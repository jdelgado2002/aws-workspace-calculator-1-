"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import ConfigurationPanel from "./configuration-panel"
import CostSummaryPanel from "./cost-summary-panel"
import type { WorkSpaceConfig, PricingEstimate, ConfigOptions } from "@/types/workspace"
import { fetchConfigOptions, fetchCurrentWorkspaces, calculatePricing } from "@/lib/api"
import { useDebounce } from "@/hooks/use-debounce"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

// Make sure bundle specs are updated correctly when a new bundle is selected
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
    // Add storage volume properties
    rootVolume: "",
    userVolume: "",
    operatingSystem: "",
    runningMode: "",
    numberOfWorkspaces: 1,
    billingOption: "",
  })

  // Add a ref to track when we're updating from API response to avoid loops
  const updatingFromApiResponse = useRef(false);

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
      // Don't make API calls if we're already updating from an API response
      if (!debouncedConfig.region || !debouncedConfig.bundleId || updatingFromApiResponse.current) return

      try {
        setCalculating(true)
        // Log the config being sent to the pricing API
        console.log("Sending config to pricing API:", {
          bundleId: debouncedConfig.bundleId,
          rootVolume: debouncedConfig.rootVolume,
          userVolume: debouncedConfig.userVolume,
          storage: debouncedConfig.bundleSpecs?.storage
        });
        
        const pricing = await calculatePricing(debouncedConfig)
        
        // If the API returned volume information, update our local state
        if (pricing.storage && pricing.rootVolume && pricing.userVolume) {
          console.log(`API returned storage info: root=${pricing.rootVolume}GB, user=${pricing.userVolume}GB, total=${pricing.storage}GB`);
          
          // Only update if values actually changed from what we already have
          const rootVolumeChanged = pricing.rootVolume.toString() !== debouncedConfig.rootVolume;
          const userVolumeChanged = pricing.userVolume.toString() !== debouncedConfig.userVolume;
          const storageChanged = pricing.storage !== debouncedConfig.bundleSpecs?.storage;
          
          if (rootVolumeChanged || userVolumeChanged || storageChanged) {
            // Set the flag to prevent loops
            updatingFromApiResponse.current = true;
            
            // Update config with API-provided values
            setConfig(prev => ({
              ...prev,
              rootVolume: pricing.rootVolume.toString(),
              userVolume: pricing.userVolume.toString(),
              bundleSpecs: {
                ...prev.bundleSpecs,
                storage: pricing.storage
              }
            }));
            
            // Reset the flag after a small delay to allow state to update
            setTimeout(() => {
              updatingFromApiResponse.current = false;
            }, 100);
          }
        }
        
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

  // Update the handleConfigChange function
  const handleConfigChange = useCallback((newConfig: Partial<WorkSpaceConfig>) => {
    console.log("Updating workspace config with:", newConfig);
    
    setConfig((prev) => {
      const updated = { ...prev, ...newConfig };

      // If bundle changed, update bundle specs and storage volumes
      if (newConfig.bundleId && configOptions) {
        const selectedBundle = configOptions.bundles.find((b) => b.id === newConfig.bundleId);
        if (selectedBundle) {
          console.log("Selected bundle specs:", selectedBundle.specs);
          updated.bundleSpecs = selectedBundle.specs;
          
          // Set storage volumes based on the bundle specs
          const storage = selectedBundle.specs.storage || 80;
          
          // Only update volumes if they haven't been explicitly set by the user
          if (newConfig.rootVolume) {
            // User explicitly provided a root volume
            updated.rootVolume = newConfig.rootVolume;
          } else if (!updated.rootVolume || updated.rootVolume === prev.rootVolume) {
            // Bundle changed, use half the total storage
            updated.rootVolume = Math.floor(storage / 2).toString();
          }
          
          if (newConfig.userVolume) {
            // User explicitly provided a user volume
            updated.userVolume = newConfig.userVolume;
          } else if (!updated.userVolume || updated.userVolume === prev.userVolume) {
            // Bundle changed, use half the total storage
            updated.userVolume = Math.floor(storage / 2).toString();
          }
          
          console.log(`STORAGE UI UPDATE: Bundle ${selectedBundle.id} has storage=${storage}GB, setting Root=${updated.rootVolume}GB, User=${updated.userVolume}GB`);
        }
      }

      return updated;
    });
  }, [configOptions]);

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

