'use server'

import { ConfigOptions } from '@/types/workspace'
import { getRegionCode } from '@/lib/utils'

export async function getPoolBundlesForRegion(region: string): Promise<Partial<ConfigOptions>> {
  try {
    // Make sure region is provided
    if (!region) {
      throw new Error("Region is required");
    }

    console.log(`[Pool] Fetching bundles for region: ${region}`);
    
    // Convert region name to code if it's a full region name
    const regionCode = getRegionCode(region);
    
    // Determine the base URL for API calls - must be an absolute URL
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    
    // Generate a cache-busting timestamp to ensure fresh data
    const timestamp = Date.now();
    
    // Construct the full URL with proper encoding
    const apiUrl = new URL(`/api/config/pool-bundles`, baseUrl);
    apiUrl.searchParams.append('region', regionCode);
    apiUrl.searchParams.append('t', timestamp.toString());
    
    console.log(`[Pool] Fetching from URL: ${apiUrl.toString()}`);
    
    // Call our pool bundles API with the selected region
    const response = await fetch(apiUrl.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store', // Ensure we don't use cached data
      next: { revalidate: 0 } // Force revalidation every time
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch pool bundles: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Log information about the fetched bundles
    console.log(`[Pool] Fetched ${data.bundles?.length || 0} bundles for region ${region}`);
    if (data.bundles?.length > 0) {
      console.log(`[Pool] First bundle: ${data.bundles[0].name}, Price: ${data.bundles[0].price}`);
    }
    
    // Return the bundles and related options
    return {
      poolBundles: data.bundles || [],
      poolOperatingSystems: data.operatingSystems || [],
      poolLicenseOptions: data.licenseOptions || [],
    };
  } catch (error) {
    console.error("[Pool] Error fetching pool bundles:", error);
    // Return empty arrays as fallback
    return {
      poolBundles: [],
      poolOperatingSystems: [],
      poolLicenseOptions: [],
      error: error instanceof Error ? error.message : "Failed to fetch pool bundles"
    };
  }
}
