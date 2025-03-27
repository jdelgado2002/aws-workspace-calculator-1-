"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import ConfigurationPanel from "./configuration-panel"
import CostSummaryPanel from "./cost-summary-panel"
import type { WorkSpaceConfig, PricingEstimate, ConfigOptions } from "@/types/workspace"
import { fetchConfigOptions, fetchCurrentWorkspaces, calculatePricing } from "@/lib/api"
import { useDebounce } from "@/hooks/use-debounce"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

// Default configuration to use when initializing
const defaultConfig: WorkSpaceConfig = {
  region: "us-west-2",
  bundleId: "standard",
  bundleSpecs: {
    vCPU: 2,
    memory: 4,
    storage: 80,
    graphics: "Standard"
  },
  rootVolume: "80",
  userVolume: "10", 
  operatingSystem: "windows",
  runningMode: "always-on",
  numberOfWorkspaces: 1,
  billingOption: "monthly",
  // Default pool settings
  poolRegion: "US West (Oregon)",
  poolBundleId: undefined,
  poolBundleSpecs: undefined,
  poolOperatingSystem: "windows",
  poolLicense: "included",
  poolNumberOfUsers: 10,
  poolUsagePattern: {
    weekdayDaysCount: 5,
    weekdayPeakHoursPerDay: 8,
    weekdayOffPeakConcurrentUsers: 10,
    weekdayPeakConcurrentUsers: 80,
    weekendDaysCount: 2,
    weekendPeakHoursPerDay: 4,
    weekendOffPeakConcurrentUsers: 5,
    weekendPeakConcurrentUsers: 40
  }
};

export default function WorkSpaceCalculator() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [configOptions, setConfigOptions] = useState<ConfigOptions | undefined>(undefined)
  
  // We'll use an activeTab state to know which pricing calculation to use
  const [activeTab, setActiveTab] = useState<string>("core");
  
  const [config, setConfig] = useState<WorkSpaceConfig>(defaultConfig)
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
          
          // Get the selected bundle
          const selectedBundle = options.bundles.find((b) => b.id === workspace.bundleId) || options.bundles[0];
          const storage = selectedBundle?.specs.storage || 80;
          
          // Split storage between root and user volumes
          const rootVolume = workspace.rootVolumeSizeGib?.toString() || Math.floor(storage / 2).toString();
          const userVolume = workspace.userVolumeSizeGib?.toString() || Math.floor(storage / 2).toString();
          
          setConfig({
            region: workspace.region || options.regions[0]?.value || "",
            bundleId: workspace.bundleId || options.bundles[0]?.id || "",
            bundleSpecs: workspace.bundleSpecs || {
              vCPU: options.bundles[0]?.specs.vCPU || 0,
              memory: options.bundles[0]?.specs.memory || 0,
              storage: options.bundles[0]?.specs.storage || 0,
              graphics: options.bundles[0]?.specs.graphics || "",
            },
            rootVolume, 
            userVolume,
            operatingSystem: workspace.operatingSystem || options.operatingSystems[0]?.value || "",
            runningMode: workspace.runningMode || options.runningModes[0]?.value || "",
            numberOfWorkspaces: workspace.count || 1,
            billingOption: workspace.billingOption || options.billingOptions[0]?.value || "",
          })
        } else {
          // Otherwise use defaults from options
          const selectedBundle = options.bundles[0];
          const storage = selectedBundle?.specs.storage || 80;
          
          // Split storage between root and user volumes
          const rootVolume = Math.floor(storage / 2).toString();
          const userVolume = Math.floor(storage / 2).toString();
          
          setConfig({
            region: options.regions[0]?.value || "",
            bundleId: options.bundles[0]?.id || "",
            bundleSpecs: {
              vCPU: options.bundles[0]?.specs.vCPU || 0,
              memory: options.bundles[0]?.specs.memory || 0,
              storage: options.bundles[0]?.specs.storage || 0,
              graphics: options.bundles[0]?.specs.graphics || "",
            },
            rootVolume,
            userVolume,
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
      if (!debouncedConfig.bundleId) return
      
      try {
        // Determine which config to use based on active tab
        const configToUse = activeTab === "pool" 
          ? { 
              ...debouncedConfig,
              // For pool pricing, we need to use pool-specific properties
              region: debouncedConfig.poolRegion || debouncedConfig.region,
              bundleId: debouncedConfig.poolBundleId || debouncedConfig.bundleId,
              bundleSpecs: debouncedConfig.poolBundleSpecs || debouncedConfig.bundleSpecs,
              operatingSystem: debouncedConfig.poolOperatingSystem || debouncedConfig.operatingSystem,
              license: debouncedConfig.poolLicense || "included",
              numberOfWorkspaces: debouncedConfig.poolNumberOfUsers || debouncedConfig.numberOfWorkspaces,
              // Set a special flag to indicate this is a pool calculation
              isPoolCalculation: true
            } 
          : debouncedConfig;
        
        const estimate = await calculatePricing(configToUse)
        setPricingEstimate(estimate)
      } catch (error) {
        console.error("Error calculating pricing:", error)
        setError("Failed to calculate pricing. Please try again.")
      }
    }

    updatePricing()
  }, [debouncedConfig, activeTab])

  // Handle configuration changes
  const handleConfigChange = useCallback((newConfig: Partial<WorkSpaceConfig>) => {
    setConfig(prevConfig => ({ ...prevConfig, ...newConfig }))
  }, [])

  // Track tab changes
  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
  }, []);

  return (
    <div className="container mx-auto py-8 px-4">
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ConfigurationPanel
            config={config}
            configOptions={configOptions}
            onConfigChange={handleConfigChange}
            isLoading={loading}
            onTabChange={handleTabChange}
          />
        </div>
        <div>
          <CostSummaryPanel
            config={config}
            pricingEstimate={pricingEstimate}
            isLoading={loading}
            activeTab={activeTab} // Pass the active tab to the summary panel
          />
        </div>
      </div>
    </div>
  )
}

