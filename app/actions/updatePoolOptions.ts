'use server'

import { ConfigOptions } from '@/types/workspace'
import { getRegionLabel } from '@/lib/utils'

export async function getPoolOptions(): Promise<Partial<ConfigOptions>> {
  try {
    // Fetch directly from AWS metadata endpoint instead of going through our API
    const metadataUrl = 'https://calculator.aws/pricing/2.0/meteredUnitMaps/workspaces/USD/current/workspaces-pools-calc/metadata.json'
    
    console.log('Fetching pool options from:', metadataUrl)
    
    const response = await fetch(metadataUrl, {
      headers: {
        'Content-Type': 'application/json',
      },
      next: { revalidate: 3600 } // Cache for 1 hour instead of no-store to prevent rate limiting
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch WorkSpaces Pool metadata: ${response.status}`)
    }

    const metadataResponse = await response.json()
    
    // The regions are in a different location in the Pool metadata response
    // They are under valueAttributes.Location instead of regions
    const locationRegions = metadataResponse.valueAttributes?.Location || []
    console.log('Received pool metadata with regions:', locationRegions.length || 0)
    
    // Check if regions exist in the response
    if (!locationRegions || !Array.isArray(locationRegions) || locationRegions.length === 0) {
      console.warn('No regions found in pool metadata response:', metadataResponse)
      return { regions: [] }
    }
    
    // Extract regions from metadata
    const regions = locationRegions.map((region: string) => ({
      value: region,
      label: getRegionLabel(region),
    }))

    // Return the processed data
    return {
      regions,
      rawMetadata: metadataResponse,
    }
  } catch (error) {
    console.error('Error fetching pool options:', error)
    // Provide fallback regions in case of error
    return {
      regions: [
        { value: "us-east-1", label: "US East (N. Virginia)" },
        { value: "us-west-2", label: "US West (Oregon)" }
      ]
    }
  }
}
