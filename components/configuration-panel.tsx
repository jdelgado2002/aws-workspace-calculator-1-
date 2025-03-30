"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Cpu, MemoryStick, HardDrive, MonitorSmartphone, Users, Database } from "lucide-react"
import type { WorkSpaceConfig, ConfigOptions, PoolUsagePattern } from "@/types/workspace"
import { getBundlesForRegion } from "@/app/actions/updateBundles"
import { getPoolOptions } from "@/app/actions/updatePoolOptions"
import { getPoolBundlesForRegion } from "@/app/actions/updatePoolBundles"
import { PoolUsagePattern as PoolUsagePatternComponent } from "@/components/pool-usage-pattern"
import { regions as RegionType } from '@/lib/regions';

// Default values for the pool usage pattern
const DEFAULT_POOL_USAGE_PATTERN: PoolUsagePattern = {
  // Weekday defaults (5 days, 8 peak hours per day, 80% utilization during peak)
  weekdayDaysCount: 5,
  weekdayPeakHoursPerDay: 8,
  weekdayOffPeakConcurrentUsers: 10,
  weekdayPeakConcurrentUsers: 80,
  
  // Weekend defaults (2 days, 4 peak hours per day, 40% utilization during peak)
  weekendDaysCount: 2,
  weekendPeakHoursPerDay: 4,
  weekendOffPeakConcurrentUsers: 5,
  weekendPeakConcurrentUsers: 40
}

interface ConfigurationPanelProps {
  config: WorkSpaceConfig
  configOptions: ConfigOptions | undefined
  onConfigChange: (config: Partial<WorkSpaceConfig>) => void
  isLoading: boolean
  onTabChange?: (tab: string) => void  // Add this prop
  regions: typeof RegionType; // Add regions prop type
}

export default function ConfigurationPanel({
  config,
  configOptions,
  onConfigChange,
  isLoading,
  onTabChange,
  regions,
}: ConfigurationPanelProps) {
  // Add state for region-specific bundle options
  const [currentRegion, setCurrentRegion] = useState(config.region)
  const [regionBundles, setRegionBundles] = useState([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState("core")
  const [isMounted, setIsMounted] = useState(false)
  
  // Add state for pool configuration
  const [poolOptions, setPoolOptions] = useState<Partial<ConfigOptions>>({ regions: [] })
  const [isLoadingPoolOptions, setIsLoadingPoolOptions] = useState(false)
  const [poolRegion, setPoolRegion] = useState(config.poolRegion || config.region)
  
  // Add state for pool bundles
  const [poolBundles, setPoolBundles] = useState([])
  const [isLoadingPoolBundles, setIsLoadingPoolBundles] = useState(false)
  const [currentPoolRegion, setCurrentPoolRegion] = useState(config.poolRegion || "")

  // Add state for pool operating systems and licenses
  const [poolOperatingSystems, setPoolOperatingSystems] = useState([]);
  const [poolLicenseOptions, setPoolLicenseOptions] = useState([]);

  // Extract options from configOptions - ensure they're available
  const operatingSystems = configOptions?.operatingSystems || []
  const licenseOptions = configOptions?.licenseOptions || []
  const runningModes = configOptions?.runningModes || []
  const billingOptions = configOptions?.billingOptions || []
  
  // Extract the volume options from configOptions
  const rootVolumeOptions = configOptions?.storage?.rootVolume || [];
  const userVolumeOptions = configOptions?.storage?.userVolume || [];

  // Initialize region bundles once when component mounts
  useEffect(() => {
    setIsMounted(true)
    setRegionBundles(configOptions?.bundles || [])
    
    // Load pool options on mount
    const loadPoolOptions = async () => {
      if (isLoadingPoolOptions) return // Prevent multiple simultaneous calls
      
      setIsLoadingPoolOptions(true)
      try {
        console.log("Loading pool options...")
        const options = await getPoolOptions()
        console.log("Received pool options:", options)
        
        if (options.regions && options.regions.length > 0) {
          setPoolOptions(options)
          
          // Only set poolRegion if it hasn't been set before
          if (!config.poolRegion) {
            const defaultPoolRegion = options.regions[0].value
            console.log("Setting default pool region:", defaultPoolRegion)
            setPoolRegion(defaultPoolRegion)
            setCurrentPoolRegion(defaultPoolRegion)
            onConfigChange({ poolRegion: defaultPoolRegion })
            
            // Load initial pool bundles for the default region
            loadPoolBundles(defaultPoolRegion)
          } else {
            // Load pool bundles for the existing region
            loadPoolBundles(config.poolRegion)
          }
        } else {
          console.warn("No regions found in pool options")
        }
      } catch (error) {
        console.error("Error loading pool options:", error)
      } finally {
        setIsLoadingPoolOptions(false)
      }
    }
    
    loadPoolOptions()
  }, [configOptions?.bundles, config.poolRegion]) // Include poolRegion in dependencies
  
  // Use regionBundles instead of configOptions.bundles
  const bundles = regionBundles

  // Watch for region changes and fetch new bundle data
  useEffect(() => {
    if (!isMounted) return
    
    if (config.region !== currentRegion) {
      setIsRefreshing(true)
      setCurrentRegion(config.region)
      
      // Fetch bundles for the new region
      const updateBundlesForRegion = async () => {
        console.log(`Refreshing bundles for region change: ${config.region}`)
        try {
          const newOptions = await getBundlesForRegion(config.region)
          
          if (newOptions.bundles.length > 0) {
            console.log(`Received ${newOptions.bundles.length} bundles for ${config.region}`)
            
            // For each bundle, create a string representation for debugging
            newOptions.bundles.forEach(bundle => {
              console.log(`Bundle: ${bundle.name}, Price: ${bundle.price}, DisplayPrice: ${bundle.displayPrice}`)
            })
            
            setRegionBundles(newOptions.bundles)
            
            // Check if current bundle exists in new region
            const bundleExists = newOptions.bundles.some(b => b.id === config.bundleId)
            
            // If current bundle doesn't exist in this region, select the first available bundle
            if (!bundleExists && newOptions.bundles.length > 0) {
              console.log(`Selected bundle ${config.bundleId} not available in ${config.region}, selecting ${newOptions.bundles[0].id}`)
              onConfigChange({ 
                bundleId: newOptions.bundles[0].id,
                bundleSpecs: newOptions.bundles[0].specs
              })
            }
          }
        } catch (error) {
          console.error("Error updating bundles for region:", error)
        } finally {
          setIsRefreshing(false)
        }
      }
      
      updateBundlesForRegion()
    }
  }, [config.region, currentRegion, isMounted])

  // Watch for pool region changes and fetch new pool bundle data
  useEffect(() => {
    if (!isMounted) return
    
    if (config.poolRegion && config.poolRegion !== currentPoolRegion) {
      setCurrentPoolRegion(config.poolRegion)
      loadPoolBundles(config.poolRegion)
    }
  }, [config.poolRegion, currentPoolRegion, isMounted])
  
  // Function to load pool bundles for a specific region
  const loadPoolBundles = async (region: string) => {
    if (!region || isLoadingPoolBundles) return
    
    setIsLoadingPoolBundles(true)
    try {
      console.log(`Loading pool bundles for region: ${region}`)
      const options = await getPoolBundlesForRegion(region)
      console.log("Received pool bundles:", options)
      
      if (options.poolBundles && options.poolBundles.length > 0) {
        setPoolBundles(options.poolBundles)
        
        // Store OS and license options
        if (options.poolOperatingSystems) {
          setPoolOperatingSystems(options.poolOperatingSystems);
        }
        
        if (options.poolLicenseOptions) {
          setPoolLicenseOptions(options.poolLicenseOptions);
        }
        
        // If no pool bundle is selected or the current one doesn't exist in this region,
        // select the first available bundle
        const bundleExists = config.poolBundleId && 
          options.poolBundles.some(b => b.id === config.poolBundleId)
        
        if (!config.poolBundleId || !bundleExists) {
          const defaultBundle = options.poolBundles[0]
          console.log(`Setting default pool bundle: ${defaultBundle.id}`)
          onConfigChange({
            poolBundleId: defaultBundle.id,
            poolBundleSpecs: defaultBundle.specs
          })
        }
        
        // Set default OS and license if they haven't been set
        if (options.poolOperatingSystems?.length > 0 && !config.poolOperatingSystem) {
          onConfigChange({ poolOperatingSystem: options.poolOperatingSystems[0].value });
        }
        
        if (options.poolLicenseOptions?.length > 0 && !config.poolLicense) {
          onConfigChange({ poolLicense: options.poolLicenseOptions[0].value });
        }
      } else {
        console.warn(`No pool bundles found for region: ${region}`)
        setPoolBundles([])
      }
    } catch (error) {
      console.error("Error loading pool bundles:", error)
    } finally {
      setIsLoadingPoolBundles(false)
    }
  }

  // Ensure the pool usage pattern is initialized
  useEffect(() => {
    if (isMounted && !config.poolUsagePattern) {
      onConfigChange({ poolUsagePattern: DEFAULT_POOL_USAGE_PATTERN });
    }
  }, [isMounted, config.poolUsagePattern]);

  // Handle changes to the pool usage pattern
  const handlePoolUsagePatternChange = (pattern: Partial<PoolUsagePattern>) => {
    onConfigChange({ 
      poolUsagePattern: { 
        ...config.poolUsagePattern || DEFAULT_POOL_USAGE_PATTERN, 
        ...pattern 
      } 
    });
  };

  // Update the tab change handler to call parent's onTabChange
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (onTabChange) {
      onTabChange(value);
    }
  };

  // Add handler for license changes to update pricing dynamically
  const handlePoolLicenseChange = (licenseValue: string) => {
    // Find the selected bundle
    const selectedBundle = poolBundles.find(b => b.id === config.poolBundleId);
    
    // If bundle has license-specific pricing and licensePricing is available
    if (selectedBundle?.licensePricing) {
      // Get the pricing for the selected license
      const pricing = licenseValue === "bring-your-own-license" 
        ? selectedBundle.licensePricing.byol
        : selectedBundle.licensePricing.included;
      
      console.log(`Updating pool pricing for license ${licenseValue}:`, pricing);
      
      // Update bundle specs with the appropriate price based on license
      const updatedBundleSpecs = config.poolBundleSpecs 
        ? { 
            ...config.poolBundleSpecs,
            // We don't modify the specs directly, let the calculation handle it
          } 
        : undefined;
      
      // Update the license and apply the calculation in cost-summary-panel
      onConfigChange({ 
        poolLicense: licenseValue,
        // Add an empty timestamp to force a re-render and recalculation
        // This is a hack but effective way to trigger the useEffect in the parent component
        _updateTimestamp: Date.now()
      });
    } else {
      // If no license-specific pricing, just update the license
      onConfigChange({ 
        poolLicense: licenseValue,
        _updateTimestamp: Date.now() // Force update
      });
    }
  };

  // Add a handler for license changes in Core
  const handleLicenseChange = (licenseValue: string) => {
    onConfigChange({ license: licenseValue });
  };

  // Add handleRegionChange function
  const handleRegionChange = (value: string) => {
    setCurrentRegion(value);
    onConfigChange({ region: value });
  };

  // Only render once client-side to prevent hydration mismatch
  if (!isMounted) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-12">
            <div className="animate-pulse text-gray-500">Loading configuration options...</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="shadow-sm">
      <CardContent className="p-6">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-gray-900">Configure Your WorkSpaces</h2>
          <p className="text-sm text-gray-500">Adjust the settings below to calculate your estimated costs</p>
        </div>

        <Tabs defaultValue="core" onValueChange={handleTabChange}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="core">WorkSpaces Core</TabsTrigger>
            <TabsTrigger value="pool">WorkSpaces Pool</TabsTrigger>
          </TabsList>

          <TabsContent value="core" className="space-y-6">
            <div>
              <Label htmlFor="region">AWS Region</Label>
              <Select value={config.region} onValueChange={handleRegionChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a region" />
                </SelectTrigger>
                <SelectContent>
                  {regions.map((region) => (
                    <SelectItem key={region.code} value={region.code}>
                      {region.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="bundle">WorkSpace Bundle</Label>
              <Select
                value={config.bundleId}
                onValueChange={(value) => {
                  const selectedBundle = bundles.find(b => b.id === value);
                  if (selectedBundle) {
                    console.log(`Selected bundle: ${selectedBundle.name}, Price: ${selectedBundle.price}`);
                    onConfigChange({ 
                      bundleId: value,
                      bundleSpecs: selectedBundle.specs
                    });
                  }
                }}
                disabled={isLoading || isRefreshing}
              >
                <SelectTrigger id="bundle" className="w-full">
                  <SelectValue placeholder="Select a bundle" />
                </SelectTrigger>
                <SelectContent>
                  {bundles.map((bundle) => (
                    <SelectItem key={bundle.id} value={bundle.id}>
                      {bundle.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isRefreshing && (
                <div className="text-xs mt-1 text-muted-foreground">
                  Updating bundles for region...
                </div>
              )}
            </div>

            <div className="grid grid-cols-4 gap-4 py-4">
              <div className="flex flex-col items-center">
              <div className="bg-blue-50 p-3 rounded-full mb-2">
                <Cpu className="h-5 w-5 text-blue-600" />
              </div>
              <div className="text-xs text-gray-500">vCPU</div>
              <div className="font-medium">{config.bundleSpecs.vCPU} vCPU</div>
              </div>

              <div className="flex flex-col items-center">
              <div className="bg-blue-50 p-3 rounded-full mb-2">
                <MemoryStick className="h-5 w-5 text-blue-600" />
              </div>
              <div className="text-xs text-gray-500">Memory</div>
              <div className="font-medium">{config.bundleSpecs.memory} GB</div>
              </div>

              <div className="flex flex-col items-center">
              <div className="bg-blue-50 p-3 rounded-full mb-2">
                <MonitorSmartphone className="h-5 w-5 text-blue-600" />
              </div>
              <div className="text-xs text-gray-500">Graphics</div>
              <div className="font-medium">{config.bundleSpecs.graphics}</div>
              </div>

              <div className="flex flex-col items-center">
              <div className="bg-blue-50 p-3 rounded-full mb-2">
                <HardDrive className="h-5 w-5 text-blue-600" />
              </div>
              <div className="text-xs text-gray-500">Total Storage</div>
              <div className="font-medium">{parseInt(config.rootVolume || "0") + parseInt(config.userVolume || "0")} GB</div>
              </div>
            </div>

            {/* Volume selectors in a second row */}
            <div className="grid grid-cols-2 gap-6">
              <div>
              <Label htmlFor="rootVolume" className="mb-2 block">Root Volume</Label>
              <Select
                value={config.rootVolume?.toString() || ""}
                onValueChange={(value) => onConfigChange({ rootVolume: value })}
                disabled={isLoading}
              >
                <SelectTrigger id="rootVolume" className="w-full">
                <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent>
                {rootVolumeOptions.map((volume) => (
                  <SelectItem key={volume.value} value={volume.value}>
                  {volume.label}
                  </SelectItem>
                ))}
                </SelectContent>
              </Select>
              </div>

              <div>
              <Label htmlFor="userVolume" className="mb-2 block">User Volume</Label>
              <Select
                value={config.userVolume?.toString() || ""}
                onValueChange={(value) => onConfigChange({ userVolume: value })}
                disabled={isLoading}
              >
                <SelectTrigger id="userVolume" className="w-full">
                <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent>
                {userVolumeOptions.map((volume) => (
                  <SelectItem key={volume.value} value={volume.value}>
                  {volume.label}
                  </SelectItem>
                ))}
                </SelectContent>
              </Select>
              </div>
            </div>

            <div className="text-xs text-gray-500 -mt-2">
              Storage breakdown: {config.rootVolume || "0"} GB Root + {config.userVolume || "0"} GB User
            </div>

            <div>
              <Label htmlFor="os">Operating System</Label>
              <Select
                value={config.operatingSystem}
                onValueChange={(value) => onConfigChange({ operatingSystem: value })}
                disabled={isLoading}
              >
                <SelectTrigger id="os" className="w-full">
                  <SelectValue placeholder="Select an operating system" />
                </SelectTrigger>
                <SelectContent>
                  {operatingSystems.map((os) => (
                    <SelectItem key={os.value} value={os.value}>
                      {os.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="license">License Type</Label>
              <Select
                value={config.license || "included"}
                onValueChange={handleLicenseChange}
                disabled={isLoading}
              >
                <SelectTrigger id="license" className="w-full">
                  <SelectValue placeholder="Select license type" />
                </SelectTrigger>
                <SelectContent>
                  {licenseOptions && licenseOptions.length > 0 ? (
                    licenseOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))
                  ) : (
                    <>
                      <SelectItem value="included">Included</SelectItem>
                      <SelectItem value="bring-your-own-license">Bring Your Own License</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
              {config.operatingSystem === "windows" && config.license === "bring-your-own-license" && (
                <p className="text-xs text-amber-600 mt-1">
                  You'll need valid Windows licenses for your BYOL deployment
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="runningMode">Running Mode</Label>
              <Select
                value={config.runningMode}
                onValueChange={(value) => onConfigChange({ runningMode: value })}
                disabled={isLoading}
              >
                <SelectTrigger id="runningMode" className="w-full">
                  <SelectValue placeholder="Select a running mode" />
                </SelectTrigger>
                <SelectContent>
                  {runningModes.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <Label htmlFor="numberOfWorkspaces">Number of WorkSpaces</Label>
                <span className="text-sm font-medium">{config.numberOfWorkspaces}</span>
              </div>
              <Slider
                id="numberOfWorkspaces"
                min={1}
                max={100}
                step={1}
                value={[config.numberOfWorkspaces]}
                onValueChange={(value) => onConfigChange({ numberOfWorkspaces: value[0] })}
                className="py-4"
                disabled={isLoading}
              />
              <div className="flex justify-between text-xs text-gray-500">
                <span>1</span>
                <span>100</span>
              </div>
            </div>

            <div>
              <Label htmlFor="billingOption">Billing Option</Label>
              <Select
                value={config.billingOption}
                onValueChange={(value) => onConfigChange({ billingOption: value })}
                disabled={isLoading}
              >
                <SelectTrigger id="billingOption" className="w-full">
                  <SelectValue placeholder="Select a billing option" />
                </SelectTrigger>
                <SelectContent>
                  {billingOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          <TabsContent value="pool" className="space-y-6">
            <div>
              <Label htmlFor="poolRegion">AWS Region</Label>
              <Select
                value={poolRegion}
                onValueChange={(value) => {
                  console.log("Pool region selected:", value)
                  setPoolRegion(value)
                  onConfigChange({ poolRegion: value })
                  loadPoolBundles(value)
                }}
                disabled={isLoadingPoolOptions}
              >
                <SelectTrigger id="poolRegion" className="w-full">
                  <SelectValue placeholder="Select a region" />
                </SelectTrigger>
                <SelectContent>
                  {(poolOptions.regions && poolOptions.regions.length > 0) ? (
                    poolOptions.regions.map((region) => (
                      <SelectItem key={region.value} value={region.value}>
                        {region.label}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="loading" disabled>
                      No regions available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {isLoadingPoolOptions && (
                <div className="text-xs mt-1 text-muted-foreground">
                  Loading regions...
                </div>
              )}
            </div>
            
            <div>
              <Label htmlFor="poolBundle">Pool Bundle</Label>
              <Select
                value={config.poolBundleId}
                onValueChange={(value) => {
                  const selectedBundle = poolBundles.find(b => b.id === value);
                  if (selectedBundle) {
                    console.log(`Selected pool bundle: ${selectedBundle.name}, Price: ${selectedBundle.price}`);
                    onConfigChange({ 
                      poolBundleId: value,
                      poolBundleSpecs: selectedBundle.specs
                    });
                  }
                }}
                disabled={isLoadingPoolBundles || poolBundles.length === 0}
              >
                <SelectTrigger id="poolBundle" className="w-full">
                  <SelectValue placeholder="Select a pool bundle" />
                </SelectTrigger>
                <SelectContent>
                  {poolBundles.length > 0 ? (
                    poolBundles.map((bundle) => (
                      <SelectItem key={bundle.id} value={bundle.id}>
                        {bundle.name} - {bundle.displayPrice}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="loading" disabled>
                      {isLoadingPoolBundles ? "Loading bundles..." : "No bundles available"}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {isLoadingPoolBundles && (
                <div className="text-xs mt-1 text-muted-foreground">
                  Loading pool bundles...
                </div>
              )}
            </div>
            
            {config.poolBundleSpecs && (
              <div className="grid grid-cols-4 gap-4 py-4">
                <div className="flex flex-col items-center">
                  <div className="bg-blue-50 p-3 rounded-full mb-2">
                    <Cpu className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="text-xs text-gray-500">vCPU</div>
                  <div className="font-medium">{config.poolBundleSpecs.vCPU} vCPU</div>
                </div>

                <div className="flex flex-col items-center">
                  <div className="bg-blue-50 p-3 rounded-full mb-2">
                    <MemoryStick className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="text-xs text-gray-500">Memory</div>
                  <div className="font-medium">{config.poolBundleSpecs.memory} GB</div>
                </div>

                <div className="flex flex-col items-center">
                  <div className="bg-blue-50 p-3 rounded-full mb-2">
                    <HardDrive className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="text-xs text-gray-500">Storage</div>
                  <div className="font-medium">{config.poolBundleSpecs.storage} GB</div>
                </div>

                <div className="flex flex-col items-center">
                  <div className="bg-blue-50 p-3 rounded-full mb-2">
                    <MonitorSmartphone className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="text-xs text-gray-500">Graphics</div>
                  <div className="font-medium">{config.poolBundleSpecs.graphics}</div>
                </div>
              </div>
            )}
            
            <div>
              <div className="flex justify-between mb-2">
                <Label htmlFor="poolNumberOfUsers">Maximum Number of Users</Label>
                <span className="text-sm font-medium">{config.poolNumberOfUsers || 10}</span>
              </div>
              <Slider
                id="poolNumberOfUsers"
                min={1}
                max={100}
                step={1}
                value={[config.poolNumberOfUsers || 10]}
                onValueChange={(value) => onConfigChange({ poolNumberOfUsers: value[0] })}
                className="py-4"
                disabled={isLoadingPoolBundles}
              />
              <div className="flex justify-between text-xs text-gray-500">
                <span>1</span>
                <span>100</span>
              </div>
            </div>
            
            {/* Add operating system selection */}
            <div>
              <Label htmlFor="poolOperatingSystem">Operating System</Label>
              <Select
                value={config.poolOperatingSystem}
                onValueChange={(value) => onConfigChange({ poolOperatingSystem: value })}
                disabled={isLoadingPoolBundles || poolOperatingSystems.length === 0}
              >
                <SelectTrigger id="poolOperatingSystem" className="w-full">
                  <SelectValue placeholder="Select operating system" />
                </SelectTrigger>
                <SelectContent>
                  {poolOperatingSystems.length > 0 ? (
                    poolOperatingSystems.map((os) => (
                      <SelectItem key={os.value} value={os.value}>
                        {os.label}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="loading" disabled>
                      {isLoadingPoolBundles ? "Loading..." : "No options available"}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            
            {/* Add license selection */}
            <div>
              <Label htmlFor="poolLicense">License Type</Label>
              <Select
                value={config.poolLicense}
                onValueChange={handlePoolLicenseChange}
                disabled={isLoadingPoolBundles || poolLicenseOptions.length === 0}
              >
                <SelectTrigger id="poolLicense" className="w-full">
                  <SelectValue placeholder="Select license type" />
                </SelectTrigger>
                <SelectContent>
                  {poolLicenseOptions.length > 0 ? (
                    poolLicenseOptions.map((license) => (
                      <SelectItem key={license.value} value={license.value}>
                        {license.label}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="loading" disabled>
                      {isLoadingPoolBundles ? "Loading..." : "No options available"}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {config.poolOperatingSystem === "windows" && config.poolLicense === "bring-your-own-license" && (
                <p className="text-xs text-amber-600 mt-1">
                  You'll need valid Windows licenses for your BYOL deployment
                </p>
              )}
            </div>
            
            {/* Add the usage pattern component */}
            <PoolUsagePatternComponent 
              value={config.poolUsagePattern || DEFAULT_POOL_USAGE_PATTERN} 
              onChange={handlePoolUsagePatternChange}
            />
            
            {/* Display debug information for pool data if available */}
            {poolOptions.rawMetadata && (
              <div className="p-4 mt-4 bg-gray-50 rounded-md">
                <h4 className="text-sm font-medium mb-2">Pool Configuration Data</h4>
                <div className="text-xs text-gray-500 overflow-auto max-h-40">
                  <pre>{JSON.stringify(poolOptions.rawMetadata, null, 2).substring(0, 500)}...</pre>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
