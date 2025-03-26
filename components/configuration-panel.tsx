"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Cpu, MemoryStick, HardDrive, MonitorSmartphone } from "lucide-react"
import type { WorkSpaceConfig, ConfigOptions } from "@/types/workspace"
import { getBundlesForRegion } from "@/app/actions/updateBundles"

interface ConfigurationPanelProps {
  config: WorkSpaceConfig
  configOptions: ConfigOptions | undefined
  onConfigChange: (config: Partial<WorkSpaceConfig>) => void
  isLoading: boolean
}

export default function ConfigurationPanel({
  config,
  configOptions,
  onConfigChange,
  isLoading,
}: ConfigurationPanelProps) {
  // Add state for region-specific bundle options
  const [currentRegion, setCurrentRegion] = useState(config.region)
  const [regionBundles, setRegionBundles] = useState([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState("general")
  const [isMounted, setIsMounted] = useState(false)

  // Extract options from configOptions - ensure they're available
  const regions = configOptions?.regions || []
  const operatingSystems = configOptions?.operatingSystems || []
  const runningModes = configOptions?.runningModes || []
  const billingOptions = configOptions?.billingOptions || []
  
  // Initialize region bundles once when component mounts
  useEffect(() => {
    setIsMounted(true)
    setRegionBundles(configOptions?.bundles || [])
  }, [configOptions?.bundles])
  
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

        <Tabs defaultValue="general" onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6">
            <div>
              <Label htmlFor="region">AWS Region</Label>
              <Select
                value={config.region}
                onValueChange={(value) => onConfigChange({ region: value })}
                disabled={isLoading || isRefreshing}
              >
                <SelectTrigger id="region" className="w-full">
                  <SelectValue placeholder="Select a region" />
                </SelectTrigger>
                <SelectContent>
                  {regions.map((region) => (
                    <SelectItem key={region.value} value={region.value}>
                      {region.label}
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
                      {bundle.name} ({bundle.displayPrice})
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
                  <HardDrive className="h-5 w-5 text-blue-600" />
                </div>
                <div className="text-xs text-gray-500">SSD Volume</div>
                <div className="font-medium">{config.bundleSpecs.storage} GB</div>
              </div>

              <div className="flex flex-col items-center">
                <div className="bg-blue-50 p-3 rounded-full mb-2">
                  <MonitorSmartphone className="h-5 w-5 text-blue-600" />
                </div>
                <div className="text-xs text-gray-500">Graphics</div>
                <div className="font-medium">{config.bundleSpecs.graphics}</div>
              </div>
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

          <TabsContent value="advanced">
            <div className="py-12 text-center text-gray-500">
              Advanced configuration options will be available in a future update.
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

