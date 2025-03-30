'use client';

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { calculateAppStreamPricing, fetchAppStreamBundles, fetchAppStreamConfig } from '@/lib/api';
import { regions } from '@/lib/regions';
import { Button } from '@/components/ui/button';
import CostSummaryPanel from './cost-summary-panel';
import { AppStreamUsagePattern } from './appstream-usage-pattern'; // Import the component here
import type { AppStreamUsagePattern as AppStreamUsagePatternType } from "@/types/appstream"; // Import the type with an alias

const DEFAULT_USAGE_PATTERN: AppStreamUsagePatternType = {
  weekdayDaysCount: 5,
  weekdayPeakHoursPerDay: 8,
  weekdayOffPeakConcurrentUsers: 10,
  weekdayPeakConcurrentUsers: 80,
  weekendDaysCount: 2,
  weekendPeakHoursPerDay: 4,
  weekendOffPeakConcurrentUsers: 5,
  weekendPeakConcurrentUsers: 40
};

export default function AppStreamCalculator() {
  // State for configuration options
  const [regionData, setRegionData] = useState<any>(null);
  const [instanceFamilies, setInstanceFamilies] = useState<any[]>([]);
  const [instanceFunctions, setInstanceFunctions] = useState<any[]>([]);
  const [operatingSystems, setOperatingSystems] = useState<any[]>([]);
  const [multiSessionOptions, setMultiSessionOptions] = useState<any[]>([]);
  const [bundles, setBundles] = useState<any[]>([]);
  
  // State for user selections
  const [selectedRegion, setSelectedRegion] = useState<string>('us-east-1');
  const [selectedInstanceFamily, setSelectedInstanceFamily] = useState<string>('');
  const [selectedInstanceFunction, setSelectedInstanceFunction] = useState<string>('');
  const [selectedBundle, setSelectedBundle] = useState<string>('');
  const [selectedOS, setSelectedOS] = useState<string>('');
  const [selectedMultiSession, setSelectedMultiSession] = useState<string>('false');
  const [usageHours, setUsageHours] = useState<number>(730);
  const [usersPerInstance, setUsersPerInstance] = useState<number>(1);
  const [numberOfInstances, setNumberOfInstances] = useState<number>(1);
  const [usagePattern, setUsagePattern] = useState<AppStreamUsagePatternType>(DEFAULT_USAGE_PATTERN);
  const [userCount, setUserCount] = useState<number>(10); // Changed default from 10 to 100

  // State for pricing results
  const [pricingEstimate, setPricingEstimate] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  
  // Create a WorkSpaceConfig-like object for CostSummaryPanel
  const appstreamConfig = {
    region: selectedRegion,
    bundleId: selectedBundle,
    bundleSpecs: bundles.find(b => b.id === selectedBundle)?.specs || {
      vCPU: 0,
      memory: 0,
      storage: 0,
      graphics: 'Standard'
    },
    numberOfWorkspaces: userCount,
    operatingSystem: selectedOS,
    // Add Pool specifics for the CostSummaryPanel
    poolUsagePattern: usagePattern,
    poolNumberOfUsers: userCount,
    poolLicense: selectedOS === 'windows' ? 'included' : 'not-applicable',
    isAppStream: true // Flag to identify this as AppStream config
  };
  
  // Fetch initial configuration when region changes
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await fetchAppStreamConfig(selectedRegion);
        setRegionData(config.region);
        setInstanceFamilies(config.instanceFamilies);
        setInstanceFunctions(config.instanceFunctions);
        setOperatingSystems(config.operatingSystems);
        setMultiSessionOptions(config.multiSession);
        
        // Reset dependent selections
        setSelectedInstanceFamily('');
        setSelectedInstanceFunction('');
        setSelectedBundle('');
        setSelectedOS('');
        setBundles([]);
        setPricingEstimate(null);
      } catch (error) {
        console.error('Failed to load AppStream configuration:', error);
      }
    };
    
    loadConfig();
  }, [selectedRegion]);
  
  // Fetch bundles when instance family or function changes
  useEffect(() => {
    const loadBundles = async () => {
      if (selectedInstanceFamily && selectedInstanceFunction) {
        try {
          const bundlesData = await fetchAppStreamBundles(
            selectedRegion,
            selectedInstanceFamily,
            selectedInstanceFunction
          );
          
          setBundles(bundlesData.bundles);
          setSelectedBundle('');
        } catch (error) {
          console.error('Failed to load AppStream bundles:', error);
        }
      }
    };
    
    loadBundles();
  }, [selectedRegion, selectedInstanceFamily, selectedInstanceFunction]);
  
  // Calculate pricing when selections change
  const handleCalculatePrice = async () => {
    if (!selectedRegion || !selectedInstanceFamily || !selectedInstanceFunction || 
        !selectedBundle || !selectedOS) {
      // Show error or validation message
      return;
    }
    
    setLoading(true);
    
    try {
      const bundle = bundles.find(b => b.id === selectedBundle);
      const params = {
        region: selectedRegion,
        instanceType: selectedBundle,
        instanceFamily: selectedInstanceFamily,
        instanceFunction: selectedInstanceFunction,
        operatingSystem: selectedOS,
        multiSession: selectedMultiSession,
        usagePattern: 'custom',
        usageHours: usageHours,
        usersPerInstance: usersPerInstance,
        numberOfInstances: numberOfInstances,
        userCount: userCount,
        bufferFactor: 0.1, // Ensure we're explicitly sending the buffer factor
        weekdayDaysCount: usagePattern.weekdayDaysCount,
        weekdayPeakHoursPerDay: usagePattern.weekdayPeakHoursPerDay,
        weekdayPeakConcurrentUsers: usagePattern.weekdayPeakConcurrentUsers,
        weekdayOffPeakConcurrentUsers: usagePattern.weekdayOffPeakConcurrentUsers,
        weekendDaysCount: usagePattern.weekendDaysCount,
        weekendPeakHoursPerDay: usagePattern.weekendPeakHoursPerDay, 
        weekendPeakConcurrentUsers: usagePattern.weekendPeakConcurrentUsers,
        weekendOffPeakConcurrentUsers: usagePattern.weekendOffPeakConcurrentUsers
      };
      
      const result = await calculateAppStreamPricing(params);
      
      // Format the response to match PricingEstimate structure for CostSummaryPanel
      const formattedEstimate = {
        costPerWorkspace: result.costPerUser || 0,
        totalMonthlyCost: result.totalMonthlyCost || 0,
        annualEstimate: result.annualCost || 0,
        bundleName: bundle?.name || 'AppStream Bundle',
        billingModel: 'Hourly',
        baseCost: result.hourlyPrice * 730, // convert hourly to monthly base
        pricingSource: 'aws-api',
        license: selectedOS === 'windows' ? 'included' : 'not-applicable',
        // Add pool pricing details
        poolPricingDetails: {
          userLicenseCost: result.userLicenseCost || 0,
          activeStreamingCost: result.instanceCost || 0,
          stoppedInstanceCost: 0,
          hourlyStreamingRate: result.hourlyPrice, // Pass through the hourly rate from the API
          totalInstanceHours: result.totalInstanceHours || 0,
          utilizedInstanceHours: result.utilizedInstanceHours || 0,
          bufferInstanceHours: result.bufferInstanceHours || 0,
          bufferFactor: result.details?.calculationDetails?.bufferFactor || 0.1, // Pass through the buffer factor
        },
        // Include original details for debugging
        originalDetails: result.details
      };
      
      setPricingEstimate(formattedEstimate);
    } catch (error) {
      console.error('Failed to calculate pricing:', error);
    } finally {
      setLoading(false);
    }
  };

  // Add useEffect to calculate pricing when key values change
  useEffect(() => {
    if (selectedRegion && selectedInstanceFamily && selectedInstanceFunction && 
        selectedBundle && selectedOS) {
      handleCalculatePrice();
    }
  }, [selectedRegion, selectedInstanceFamily, selectedInstanceFunction, selectedBundle, 
      selectedOS, selectedMultiSession, usagePattern, userCount, usersPerInstance]);

  // Reset form
  const handleReset = () => {
    setSelectedInstanceFamily('');
    setSelectedInstanceFunction('');
    setSelectedBundle('');
    setSelectedOS('');
    setSelectedMultiSession('false');
    setUsageHours(730);
    setUsersPerInstance(1);
    setNumberOfInstances(1);
    setBundles([]);
    setPricingEstimate(null);
  };
  
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4">
              <h2 className="text-xl font-bold text-gray-900">Service Settings</h2>
              <p className="text-sm text-gray-500">Configure your AppStream 2.0 fleet</p>
            </div>

            {/* Basic service settings section */}
            <div className="space-y-6">
              {/* Region selector */}
              <div className="space-y-2">
                <Label htmlFor="region">Region</Label>
                <Select 
                  value={selectedRegion} 
                  onValueChange={setSelectedRegion}
                >
                  <SelectTrigger id="region">
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

              {/* Users per month - updated for higher user counts */}
              <div>
                <Label htmlFor="userCount">Users per Month</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    type="number"
                    id="userCount"
                    value={userCount}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 1;
                      setUserCount(value);
                      
                      // Update concurrent users if they exceed the new total
                      const updates: Partial<AppStreamUsagePatternType> = {};
                      if (usagePattern.weekdayPeakConcurrentUsers > value) {
                        updates.weekdayPeakConcurrentUsers = value;
                      }
                      if (usagePattern.weekdayOffPeakConcurrentUsers > value) {
                        updates.weekdayOffPeakConcurrentUsers = value;
                      }
                      if (usagePattern.weekendPeakConcurrentUsers > value) {
                        updates.weekendPeakConcurrentUsers = value;
                      }
                      if (usagePattern.weekendOffPeakConcurrentUsers > value) {
                        updates.weekendOffPeakConcurrentUsers = value;
                      }
                      
                      if (Object.keys(updates).length > 0) {
                        setUsagePattern({...usagePattern, ...updates});
                      }
                    }}
                    min={1}
                    max={10000}
                    className="w-24"
                  />
                  <Slider
                    value={[userCount]}
                    onValueChange={(value) => setUserCount(value[0])}
                    min={1}
                    max={1000}
                    className="flex-1"
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1</span>
                  <span>Drag for up to 1,000 (type for up to 10,000)</span>
                </div>
              </div>

              {/* Other service settings */}
              <div className="space-y-2">
                <Label htmlFor="instanceFamily">Instance Family</Label>
                <Select 
                  value={selectedInstanceFamily} 
                  onValueChange={setSelectedInstanceFamily}
                >
                  <SelectTrigger id="instanceFamily">
                    <SelectValue placeholder="Select an instance family" />
                  </SelectTrigger>
                  <SelectContent>
                    {instanceFamilies.map((family) => (
                      <SelectItem key={family.id} value={family.id}>
                        {family.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Fleet type (instance function) */}
              <div className="space-y-2">
                <Label htmlFor="instanceFunction">Instance Function</Label>
                <Select 
                  value={selectedInstanceFunction} 
                  onValueChange={setSelectedInstanceFunction}
                  disabled={!selectedInstanceFamily}
                >
                  <SelectTrigger id="instanceFunction">
                    <SelectValue placeholder="Select an instance function" />
                  </SelectTrigger>
                  <SelectContent>
                    {instanceFunctions.map((func) => (
                      <SelectItem key={func.id} value={func.id}>
                        {func.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Instance type */}
              <div className="space-y-2">
                <Label htmlFor="bundleType">Bundle Type</Label>
                <Select 
                  value={selectedBundle} 
                  onValueChange={setSelectedBundle}
                  disabled={!selectedInstanceFamily || !selectedInstanceFunction || bundles.length === 0}
                >
                  <SelectTrigger id="bundleType">
                    <SelectValue placeholder="Select a bundle type" />
                  </SelectTrigger>
                  <SelectContent>
                    {bundles.map((bundle) => (
                      <SelectItem key={bundle.id} value={bundle.id}>
                        {bundle.name} ({bundle.vcpu} vCPU, {bundle.memory} GiB memory
                        {bundle.videoMemory !== 'N/A' ? `, ${bundle.videoMemory} GiB video memory` : ''})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Multi-session toggle */}
              <div className="space-y-2">
                <Label htmlFor="multiSession">Multi-Session</Label>
                <Select 
                  value={selectedMultiSession} 
                  onValueChange={setSelectedMultiSession}
                  disabled={!selectedBundle}
                >
                  <SelectTrigger id="multiSession">
                    <SelectValue placeholder="Select multi-session option" />
                  </SelectTrigger>
                  <SelectContent>
                    {multiSessionOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Operating system */}
              <div className="space-y-2">
                <Label htmlFor="operatingSystem">Operating System</Label>
                <Select 
                  value={selectedOS} 
                  onValueChange={setSelectedOS}
                  disabled={!selectedBundle}
                >
                  <SelectTrigger id="operatingSystem">
                    <SelectValue placeholder="Select an operating system" />
                  </SelectTrigger>
                  <SelectContent>
                    {operatingSystems.map((os) => (
                      <SelectItem key={os.id} value={os.id}>
                        {os.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Users per session */}
              {selectedMultiSession === 'true' && (
                <div className="space-y-2">
                  <Label htmlFor="usersPerInstance">Users Per Instance</Label>
                  <div className="flex items-center space-x-2">
                    <Input
                      id="usersPerInstance"
                      type="number"
                      value={usersPerInstance}
                      onChange={(e) => setUsersPerInstance(parseInt(e.target.value) || 1)}
                      min={1}
                      max={100}
                      className="w-20"
                    />
                    <Slider
                      value={[usersPerInstance]}
                      onValueChange={(value) => setUsersPerInstance(value[0])}
                      min={1}
                      max={20}
                      step={1}
                      className="flex-1"
                    />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="mb-4">
              <h2 className="text-xl font-bold text-gray-900">Usage Pattern</h2>
              <p className="text-sm text-gray-500">Define your usage requirements</p>
            </div>

            <AppStreamUsagePattern 
              value={usagePattern} 
              onChange={(updates) => setUsagePattern({...usagePattern, ...updates})}
              maxUsers={userCount}
            />
          </CardContent>
        </Card>
      </div>

      {/* Cost Summary Panel */}
      <CostSummaryPanel 
        config={appstreamConfig}
        pricingEstimate={pricingEstimate}
        isLoading={loading}
        activeTab="pool"
      />
    </div>
  );
}
