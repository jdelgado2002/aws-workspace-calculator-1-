'use server'

import { ConfigOptions } from '@/types/workspace'
import { getRegionCode } from '@/lib/utils'

// Function to extract bundle specs from description
function extractBundleSpecs(description: string) {
  const cpuMatch = description.match(/(\d+)\s*vCPU/);
  const memoryMatch = description.match(/(\d+)GB\s*RAM/);
  const gpuMatch = description.includes('GPU');

  return {
    type: description.split('(')[0].trim(),
    vCPU: cpuMatch ? parseInt(cpuMatch[1]) : 0,
    memory: memoryMatch ? parseInt(memoryMatch[1]) : 0,
    graphics: gpuMatch ? "High Performance" : "Standard",
    gpu: gpuMatch,
  };
}

export async function getPoolBundlesForRegion(region: string) {
  const formattedRegion = encodeURIComponent(region);
  const apiUrl = new URL(`https://calculator.aws/pricing/2.0/meteredUnitMaps/workspaces/USD/current/workspaces-core-calc/${formattedRegion}/primary-selector-aggregations.json`);

  try {
    const response = await fetch(apiUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      next: { revalidate: 3600 }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // Create sets to store unique values
    const uniqueBundles = new Map();
    const operatingSystems = new Set();
    const licenses = new Set();

    // Process aggregations
    data.aggregations.forEach((agg: any) => {
      const selectors = agg.selectors;
      const bundleDesc = selectors['Bundle Description'];
      
      if (!uniqueBundles.has(bundleDesc)) {
        const specs = extractBundleSpecs(bundleDesc);
        uniqueBundles.set(bundleDesc, {
          id: bundleDesc.toLowerCase().replace(/\s+/g, '-'),
          name: bundleDesc,
          specs: {
            ...specs,
            storage: parseInt(selectors.rootVolume) || 0,
          },
          price: 0, // You might want to add actual pricing logic here
          displayPrice: "Price varies by configuration",
        });
      }

      if (selectors['Operating System']) {
        operatingSystems.add(selectors['Operating System']);
      }
      if (selectors['License']) {
        licenses.add(selectors['License']);
      }
    });

    // Transform sets to arrays of objects with value/label pairs
    const poolOperatingSystems = Array.from(operatingSystems).map(os => ({
      value: os.toString().toLowerCase().replace(/\s+/g, '-'),
      label: os.toString()
    }));

    const poolLicenseOptions = Array.from(licenses).map(license => ({
      value: license.toString().toLowerCase().replace(/\s+/g, '-'),
      label: license.toString()
    }));

    return {
      poolBundles: Array.from(uniqueBundles.values()),
      poolOperatingSystems,
      poolLicenseOptions,
      rawMetadata: data // Keep raw data for debugging
    };

  } catch (error) {
    console.error('[Pool] Error fetching pool bundles:', error);
    throw error;
  }
}
