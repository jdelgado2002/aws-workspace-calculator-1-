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

  // State for pricing results
  const [pricing, setPricing] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  
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
        setPricing(null);
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
        usageHours: usageHours,
        usersPerInstance: usersPerInstance,
        numberOfInstances: numberOfInstances
      };
      
      const result = await calculateAppStreamPricing(params);
      setPricing(result);
    } catch (error) {
      console.error('Failed to calculate pricing:', error);
    } finally {
      setLoading(false);
    }
  };
  
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
    setPricing(null);
  };
  
  return (
    <div className="space-y-8">
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
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
              
              <div className="space-y-2">
                <Label htmlFor="numberOfInstances">Number of Instances</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="numberOfInstances"
                    type="number"
                    value={numberOfInstances}
                    onChange={(e) => setNumberOfInstances(parseInt(e.target.value) || 1)}
                    min={1}
                    max={1000}
                    className="w-20"
                  />
                  <Slider
                    value={[numberOfInstances]}
                    onValueChange={(value) => setNumberOfInstances(value[0])}
                    min={1}
                    max={50}
                    step={1}
                    className="flex-1"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="usageHours">Monthly Usage Hours</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="usageHours"
                    type="number"
                    value={usageHours}
                    onChange={(e) => setUsageHours(parseInt(e.target.value) || 0)}
                    min={0}
                    max={730}
                    className="w-20"
                  />
                  <Slider
                    value={[usageHours]}
                    onValueChange={(value) => setUsageHours(value[0])}
                    min={0}
                    max={730}
                    step={10}
                    className="flex-1"
                  />
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  {usageHours === 730 ? 'Running 24/7' : `${usageHours} hours per month`}
                </div>
              </div>
              
              <div className="flex space-x-2 pt-2">
                <Button 
                  onClick={handleCalculatePrice} 
                  disabled={!selectedRegion || !selectedInstanceFamily || !selectedInstanceFunction || 
                            !selectedBundle || !selectedOS || loading}
                >
                  {loading ? 'Calculating...' : 'Calculate Price'}
                </Button>
                <Button variant="outline" onClick={handleReset}>
                  Reset
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-lg font-medium mb-4">Cost Summary</h3>
            
            {pricing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-sm">Hourly Price (per instance):</div>
                  <div className="text-sm font-medium text-right">${pricing.hourlyPrice.toFixed(3)}</div>
                  
                  <div className="text-sm">Total Hourly Cost:</div>
                  <div className="text-sm font-medium text-right">${pricing.hourlyTotal.toFixed(2)}</div>
                  
                  <div className="border-t pt-2 text-sm">Monthly Cost ({pricing.estimatedMonthlyHours} hours):</div>
                  <div className="border-t pt-2 text-lg font-bold text-right">${pricing.monthlyTotal.toFixed(2)}</div>
                  
                  <div className="text-sm">Cost per User Session:</div>
                  <div className="text-sm font-medium text-right">${pricing.costPerUserSession.toFixed(2)}</div>
                </div>
                
                <div className="mt-6">
                  <h4 className="text-sm font-medium mb-2">Pricing Details</h4>
                  <div className="text-xs space-y-1 text-gray-600">
                    <div>Base Instance Price: ${pricing.details.baseInstancePrice.toFixed(3)}/hour</div>
                    <div>OS Addition: ${pricing.details.osAddition.toFixed(3)}/hour</div>
                    <div>Region Multiplier: {pricing.details.regionMultiplier.toFixed(2)}x</div>
                    {pricing.details.multiSessionMultiplier !== 1 && (
                      <div>Multi-session Discount: {((1 - pricing.details.multiSessionMultiplier) * 100).toFixed(0)}%</div>
                    )}
                    {selectedMultiSession === 'true' && (
                      <div>Effective User Sessions: {pricing.details.effectiveUserSessions} (across {numberOfInstances} instances)</div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                Select options and click "Calculate Price" to see the estimated cost.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
