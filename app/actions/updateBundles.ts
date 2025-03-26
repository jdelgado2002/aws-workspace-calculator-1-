"use server";

/**
 * This server action fetches updated bundle information when the region changes
 * and ensures that the displayed bundle prices are accurate for the selected region.
 */
export async function getBundlesForRegion(region: string) {
  try {
    // Make sure region is provided
    if (!region) {
      throw new Error("Region is required");
    }

    // Determine the base URL for API calls
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : process.env.NEXT_PUBLIC_API_URL || '';
    
    // Generate a cache-busting timestamp to ensure fresh data
    const timestamp = Date.now();
    
    // Call our bundles API with the selected region and timestamp
    const response = await fetch(`${baseUrl}/api/config/bundles?region=${encodeURIComponent(region)}&t=${timestamp}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store', // Ensure we don't use cached data
      next: { revalidate: 0 } // Force revalidation every time
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch bundles: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Log detailed pricing information for debugging
    console.log(`[Region Change] Fetched ${data.bundles?.length || 0} bundles for region ${region}`);
    if (data.bundles?.length > 0) {
      console.log(`[Region Change] First bundle price: ${data.bundles[0].price} (${data.bundles[0].displayPrice})`);
    }
    
    // Return the bundles and related options
    return {
      bundles: data.bundles || [],
      storage: data.storage || { rootVolume: [], userVolume: [] },
      operatingSystems: data.operatingSystems || [],
      licenseOptions: data.licenseOptions || [],
    };
  } catch (error) {
    console.error("[Region Change] Error updating bundles for region:", error);
    // Return empty arrays as fallback
    return {
      bundles: [],
      storage: { rootVolume: [], userVolume: [] },
      operatingSystems: [],
      licenseOptions: [],
      error: error instanceof Error ? error.message : "Failed to fetch bundles"
    };
  }
}
