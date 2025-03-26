/**
 * Service for fetching AWS WorkSpace bundle information
 */

/**
 * Fetches bundle data for a specific region
 * @param region The AWS region name (e.g., "us-west-2" or "US West (Oregon)")
 * @returns Promise with the bundle data
 */
export async function fetchBundleData(region: string): Promise<any> {
  try {
    const url = `/api/bundles?region=${encodeURIComponent(region)}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch bundle data: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return processBundleData(data);
  } catch (error) {
    console.error('Error fetching bundle data:', error);
    throw error;
  }
}

/**
 * Processes raw bundle data into format needed for the UI
 * @param bundleData Raw bundle data from the API
 * @returns Processed bundle options for the UI
 */
export function processBundleData(bundleData: any): any[] {
  if (!bundleData || !bundleData.aggregations || !Array.isArray(bundleData.aggregations)) {
    console.warn('Invalid bundle data structure', bundleData);
    return [];
  }

  // Extract unique bundles
  const bundleMap = new Map();
  
  bundleData.aggregations.forEach((item: any) => {
    if (item.selectors && item.selectors["Bundle Description"]) {
      const description = item.selectors["Bundle Description"];
      
      if (!bundleMap.has(description)) {
        // Extract specs from description, e.g., "Power (4 vCPU, 16GB RAM)"
        let vCPU = 2;
        let memory = 8;
        let storage = 80;
        let graphics = "Standard";
        
        // Parse CPU and memory from description
        const cpuMatch = description.match(/(\d+)\s*vCPU/i);
        const memoryMatch = description.match(/(\d+)GB\s*RAM/i);
        
        if (cpuMatch) vCPU = parseInt(cpuMatch[1], 10);
        if (memoryMatch) memory = parseInt(memoryMatch[1], 10);
        
        // Check if it's a graphics bundle and process GPU info
        if (description.toLowerCase().includes('graphics')) {
          graphics = "High Performance";
          const gpuMemoryMatch = description.match(/(\d+)GB Video Memory/i);
          if (gpuMemoryMatch) {
            const gpuMemory = parseInt(gpuMemoryMatch[1], 10);
            graphics = `High Performance (${gpuMemory}GB VRAM)`;
          }
        }
        
        // Determine storage based on item selectors
        if (item.selectors["rootVolume"]) {
          const rootVolumeMatch = item.selectors["rootVolume"].match(/(\d+)\s*GB/i);
          if (rootVolumeMatch) {
            const rootVolume = parseInt(rootVolumeMatch[1], 10);
            const userVolume = item.selectors["userVolume"] ? 
              parseInt(item.selectors["userVolume"].match(/(\d+)\s*GB/i)[1], 10) : 0;
            storage = rootVolume + userVolume;
          }
        }
        
        // Generate a unique ID and determine base price
        const bundleId = description.toLowerCase().replace(/[\s().,]/g, '-');
        const basePrice = calculateBasePrice(vCPU, memory, storage, graphics);
        
        // Store the processed bundle with all necessary fields
        bundleMap.set(description, {
          id: bundleId,
          name: description,
          specs: {
            vCPU,
            memory,
            storage,
            graphics
          },
          price: basePrice,
          operatingSystem: item.selectors["Operating System"] || "Not specified",
          license: item.selectors["License"] || "Not specified",
          runningMode: item.selectors["Running Mode"] || "Not specified",
          rawData: item.selectors
        });
      }
    }
  });

  const processedBundles = Array.from(bundleMap.values());
  console.log('Processed bundles:', processedBundles); // Debug log
  return processedBundles.sort((a, b) => a.price - b.price);
}

/**
 * Helper function to calculate a base price for the bundle based on specs
 * (This is a simple calculation for demonstration - actual pricing would come from the API)
 */
function calculateBasePrice(vCPU: number, memory: number, storage: number, graphics: string): number {
  const cpuPrice = vCPU * 10;  // $10 per vCPU
  const memoryPrice = memory * 2;  // $2 per GB of RAM
  const storagePrice = storage * 0.1;  // $0.1 per GB of storage
  const graphicsPrice = graphics.includes('High Performance') ? 50 : 0;  // $50 for GPU
  
  return cpuPrice + memoryPrice + storagePrice + graphicsPrice;
}
