import { NextResponse } from 'next/server';
import { getRegionLabel } from '@/lib/utils';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const region = searchParams.get('region');
    
    if (!region) {
      return NextResponse.json({
        error: "Region parameter is required"
      }, {
        status: 400
      });
    }
    
    const regionName = getRegionLabel(region);
    
    // AppStream instance families
    const instanceFamilies = [
      { id: 'general-purpose', name: 'General purpose' },
      { id: 'compute-optimized', name: 'Compute optimized' },
      { id: 'memory-optimized', name: 'Memory optimized' },
      { id: 'graphics', name: 'Graphics' },
      { id: 'graphics-pro', name: 'Graphics Pro' },
      { id: 'graphics-g5', name: 'Graphics G5' },
      { id: 'graphics-design', name: 'Graphics Design' }
    ];
    
    // Instance functions
    const instanceFunctions = [
      { id: 'fleet', name: 'Fleet' },
      { id: 'imagebuilder', name: 'ImageBuilder' },
      { id: 'elasticfleet', name: 'ElasticFleet' }
    ];
    
    // Operating systems
    const operatingSystems = [
      { id: 'windows', name: 'Windows' },
      { id: 'amazon-linux', name: 'Amazon Linux' },
      { id: 'rhel', name: 'Red Hat Enterprise Linux' },
      { id: 'rocky-linux', name: 'Rocky Linux' }
    ];
    
    // Usage patterns
    const usagePatterns = [
      { id: 'always-on', name: 'Always-On (24/7)' },
      { id: 'business-hours', name: 'Business Hours (8h/day, weekdays)' },
      { id: 'custom', name: 'Custom Hours' }
    ];
    
    return NextResponse.json({
      region: { code: region, name: regionName },
      instanceFamilies,
      instanceFunctions,
      operatingSystems,
      multiSession: [
        { id: 'false', name: 'Single Session' },
        { id: 'true', name: 'Multi Session' }
      ],
      usagePatterns
    });
  } catch (error) {
    console.error('Error fetching AppStream configuration:', error);
    return NextResponse.json({
      error: "Failed to retrieve AppStream configuration"
    }, {
      status: 500
    });
  }
}
