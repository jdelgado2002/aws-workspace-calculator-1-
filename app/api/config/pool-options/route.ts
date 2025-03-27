import { NextResponse } from 'next/server';
import { getRegionLabel } from '@/lib/utils'; // Changed from getAWSRegionLabel to getRegionLabel

export async function GET(request: Request) {
  try {
    const metadataUrl = 'https://calculator.aws/pricing/2.0/meteredUnitMaps/workspaces/USD/current/workspaces-pools-calc/metadata.json';
    
    // Fetch the metadata from AWS
    const response = await fetch(metadataUrl, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch WorkSpaces Pool metadata: ${response.status}`);
    }

    const metadataResponse = await response.json();
    
    // Extract regions from metadata
    const regions = metadataResponse.regions.map((region: any) => ({
      value: region,
      label: getRegionLabel(region), // Changed from getAWSRegionLabel to getRegionLabel
    }));

    // Extract any other pool-specific options from the metadata
    // These will depend on the structure of the response
    // For now, return the regions and the full metadata for debugging
    
    return NextResponse.json({
      regions,
      rawMetadata: metadataResponse,
    });
  } catch (error) {
    console.error('Error fetching WorkSpaces Pool options:', error);
    return NextResponse.json({ error: 'Failed to fetch WorkSpaces Pool options' }, { status: 500 });
  }
}
