"use client"

import { useState, useEffect } from "react"
import ConfigurationPanel from "./configuration-panel"
import CostSummaryPanel from "./cost-summary-panel"
import type { WorkSpaceConfig, PricingEstimate, ConfigOptions } from "@/types/workspace"
import { fetchConfigOptions, fetchCurrentWorkspaces, calculatePricing } from "@/lib/api"
import { useDebounce } from "@/hooks/use-debounce"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

export default function WorkSpaceCalculator() {
  const [configOptions, setConfigOptions] = useState<ConfigOptions | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [calculating, setCalculating] = useState(false)

  const [config, setConfig] = useState<WorkSpaceConfig>({
    region: "",
    bundleId: "",
    bundleSpecs: {
      vCPU: 0,
      memory: 0,
      storage: 0,
      graphics: "",
    },
    operatingSystem: "",
    runningMode: "",
    numberOfWorkspaces: 1,
    billingOption: "",
  })

  const [pricingEstimate, setPricingEstimate] = useState<PricingEstimate | null>(null)

  const debouncedConfig = useDebounce(config, 500)

  // Fetch configuration options on component mount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true)
        const options = await fetchConfigOptions()
        setConfigOptions(options)

        // Get user's current workspaces for auto-filling
        const currentWorkspaces = await fetchCurrentWorkspaces()

        // If user has existing workspaces, use the first one to pre-populate form
        if (currentWorkspaces && currentWorkspaces.length > 0) {
          const workspace = currentWorkspaces[0]
          setConfig({
            region: workspace.region || options.regions[0]?.value || "",
            bundleId: workspace.bundleId || options.bundles[0]?.id || "",
            bundleSpecs: workspace.bundleSpecs || {
              vCPU: options.bundles[0]?.specs.vCPU || 0,
              memory: options.bundles[0]?.specs.memory || 0,
              storage: options.bundles[0]?.specs.storage || 0,
              graphics: options.bundles[0]?.specs.graphics || "",
            },
            operatingSystem: workspace.operatingSystem || options.operatingSystems[0]?.value || "",
            runningMode: workspace.runningMode || options.runningModes[0]?.value || "",
            numberOfWorkspaces: workspace.count || 1,
            billingOption: workspace.billingOption || options.billingOptions[0]?.value || "",
          })
        } else {
          // Otherwise use defaults from options
          setConfig({
            region: options.regions[0]?.value || "",
            bundleId: options.bundles[0]?.id || "",
            bundleSpecs: {
              vCPU: options.bundles[0]?.specs.vCPU || 0,
              memory: options.bundles[0]?.specs.memory || 0,
              storage: options.bundles[0]?.specs.storage || 0,
              graphics: options.bundles[0]?.specs.graphics || "",
            },
            operatingSystem: options.operatingSystems[0]?.value || "",
            runningMode: options.runningModes[0]?.value || "",
            numberOfWorkspaces: 1,
            billingOption: options.billingOptions[0]?.value || "",
          })
        }

        setError(null)
      } catch (err) {
        console.error("Error loading initial data:", err)
        setError("Failed to load configuration options. Please check your AWS credentials and try again.")
      } finally {
        setLoading(false)
      }
    }

    loadInitialData()
  }, [])

  // Calculate pricing when configuration changes
  useEffect(() => {
    const updatePricing = async () => {
      if (!debouncedConfig.region || !debouncedConfig.bundleId) return

      try {
        setCalculating(true)
        const pricing = await calculatePricing(debouncedConfig)
        setPricingEstimate(pricing)
        setError(null)
      } catch (err) {
        console.error("Failed to calculate pricing:", err)
        setError("Failed to calculate pricing. Please check your configuration and try again.")
      } finally {
        setCalculating(false)
      }
    }

    updatePricing()
  }, [debouncedConfig])

  const handleConfigChange = (newConfig: Partial<WorkSpaceConfig>) => {
    setConfig((prev) => {
      const updated = { ...prev, ...newConfig }

      // If bundle changed, update bundle specs
      if (newConfig.bundleId && configOptions) {
        const selectedBundle = configOptions.bundles.find((b) => b.id === newConfig.bundleId)
        if (selectedBundle) {
          updated.bundleSpecs = selectedBundle.specs
        }
      }

      return updated
    })
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!configOptions) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load configuration options. Please refresh the page and try again.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-3/5">
          <ConfigurationPanel
            config={config}
            configOptions={configOptions}
            onConfigChange={handleConfigChange}
            isLoading={calculating}
          />
        </div>
        <div className="w-full lg:w-2/5">
          <CostSummaryPanel config={config} pricingEstimate={pricingEstimate} isLoading={calculating} />
        </div>
      </div>
    </div>
  )
}

