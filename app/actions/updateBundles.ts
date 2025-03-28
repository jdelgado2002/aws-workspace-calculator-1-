'use server'

import { ConfigOptions } from '@/types/workspace'

export async function getBundlesForRegion(region: string): Promise<Partial<ConfigOptions>> {
  try {
    // Make sure region is provided
    if (!region) {
      throw new Error("Region is required");
    }

    console.log(`[Core] Fetching bundles for region: ${region}`);
    
    // Determine the base URL for API calls - must be an absolute URL
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    
    // Generate a cache-busting timestamp to ensure fresh data
    const timestamp = Date.now();
    
    // Construct the full URL with proper encoding
    const apiUrl = new URL(`/api/config/bundles`, baseUrl);
    apiUrl.searchParams.append('region', region);
    apiUrl.searchParams.append('t', timestamp.toString());
    
    console.log(`[Core] Fetching from URL: ${apiUrl.toString()}`);
    
    const response = await fetch(apiUrl.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store', // Ensure we don't use cached data
      next: { revalidate: 0 } // Force revalidation every time
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch bundles: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Return the bundles and related options
    return {
      bundles: data.bundles || [],
      operatingSystems: data.operatingSystems || [],
      licenseOptions: data.licenseOptions || [],
      storage: data.storage || { rootVolume: [], userVolume: [] },
    };
  } catch (error) {
    console.error("[Core] Error fetching bundles:", error);
    return {
      bundles: [],
      error: error instanceof Error ? error.message : "Failed to fetch bundles"
    };
  }
}
