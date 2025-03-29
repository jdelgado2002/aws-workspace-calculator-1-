'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import ConfigurationPanel from './configuration-panel';
import CostSummaryPanel from './cost-summary-panel';
import type { WorkSpaceConfig } from '@/types/workspace';
import { calculatePricing, fetchConfigOptions } from '@/lib/api';
import { regions } from '@/lib/regions'; // Add regions import

const DEFAULT_CONFIG: WorkSpaceConfig = {
  region: 'us-east-1',
  bundleId: 'value',
  bundleSpecs: {
    vCPU: 2,
    memory: 4,
    storage: 80,
    graphics: 'Standard'
  },
  rootVolume: '80',
  userVolume: '50',
  operatingSystem: 'windows',
  runningMode: 'always-on',
  numberOfWorkspaces: 1,
  billingOption: 'monthly'
};

export default function WorkspaceCalculatorCore() {
  const [config, setConfig] = useState<WorkSpaceConfig>(DEFAULT_CONFIG);
  const [pricingEstimate, setPricingEstimate] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('core');
  const [configOptions, setConfigOptions] = useState(undefined);

  // Add useEffect to fetch config options when component mounts
  useEffect(() => {
    const loadConfigOptions = async () => {
      try {
        const options = await fetchConfigOptions();
        setConfigOptions(options);
      } catch (error) {
        console.error('Failed to load config options:', error);
      }
    };
    
    loadConfigOptions();
  }, []);

  const handleConfigChange = async (updates: Partial<WorkSpaceConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    
    setIsLoading(true);
    try {
      const estimate = await calculatePricing(newConfig);
      setPricingEstimate(estimate);
    } catch (error) {
      console.error('Failed to calculate pricing:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <ConfigurationPanel 
        config={config} 
        onConfigChange={handleConfigChange}
        isLoading={isLoading}
        onTabChange={setActiveTab}
        regions={regions} // Add regions prop
        configOptions={configOptions} // Add this prop
      />
      <CostSummaryPanel 
        config={config}
        pricingEstimate={pricingEstimate}
        isLoading={isLoading}
        activeTab={activeTab}
      />
    </div>
  );
}
