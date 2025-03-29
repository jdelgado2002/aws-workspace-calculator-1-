import { NextResponse } from 'next/server';

// This function parses AWS pricing data to extract unique instance types with their specs
function parseInstanceTypes(data: any, instanceFamily: string, instanceFunction: string) {
  if (!data || !data.aggregations) return [];
  
  const filteredInstances = data.aggregations.filter(item => 
    item.selectors["Instance Family"] === mapInstanceFamily(instanceFamily) &&
    item.selectors["Instance Function"] === mapInstanceFunction(instanceFunction)
  );

  // Group instances by type to eliminate duplicates
  const instanceMap = new Map();
  
  filteredInstances.forEach(instance => {
    const instanceType = instance.selectors["Instance Type"];
    
    // Skip if we already have this instance type
    if (!instanceMap.has(instanceType)) {
      instanceMap.set(instanceType, {
        id: instanceType,
        name: instanceType,
        vcpu: parseInt(instance.selectors["vCPU"]) || 0,
        memory: parseFloat(instance.selectors["Memory (GiB)"]) || 0,
        videoMemory: instance.selectors["Video Memory (GiB)"]
      });
    }
  });
  
  return Array.from(instanceMap.values());
}

// Map our frontend instance family values to AWS instance family values
function mapInstanceFamily(familyId: string): string {
  const familyMap: {[key: string]: string} = {
    'general-purpose': 'General purpose',
    'compute-optimized': 'Compute optimized',
    'memory-optimized': 'Memory optimized',
    'graphics': 'Graphics',
    'graphics-pro': 'Graphics Pro',
    'graphics-g5': 'Graphics G5',
    'graphics-design': 'Graphics Design'
  };
  
  return familyMap[familyId] || familyId;
}

// Map our frontend instance function values to AWS instance function values
function mapInstanceFunction(functionId: string): string {
  const functionMap: {[key: string]: string} = {
    'fleet': 'Fleet',
    'imagebuilder': 'ImageBuilder',
    'elasticfleet': 'ElasticFleet'
  };
  
  return functionMap[functionId] || functionId;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const region = searchParams.get('region');
    const instanceFamily = searchParams.get('instanceFamily');
    const instanceFunction = searchParams.get('instanceFunction');
    
    if (!region || !instanceFamily) {
      return NextResponse.json({
        error: "Region and instanceFamily parameters are required"
      }, {
        status: 400
      });
    }
    
    // Convert region code to region name for AWS API
    const regionName = getRegionName(region);
    if (!regionName) {
      return NextResponse.json({
        error: "Invalid region code"
      }, {
        status: 400
      });
    }
    
    // Fetch the instance data from AWS
    try {
      const url = `https://calculator.aws/pricing/2.0/meteredUnitMaps/appstream/USD/current/appstream-instances-calc/${encodeURIComponent(regionName)}/primary-selector-aggregations.json`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.status}`);
      }
      
      const data = await response.json();
      const bundles = parseInstanceTypes(data, instanceFamily, instanceFunction);
      
      return NextResponse.json({ bundles });
    } catch (fetchError) {
      console.error('Error fetching AWS pricing data:', fetchError);
      
      // Fallback to hardcoded data if AWS API fails
      let bundles = getFallbackBundles(instanceFamily);
      return NextResponse.json({ bundles, source: 'fallback' });
    }
  } catch (error) {
    console.error('Error fetching AppStream bundles:', error);
    return NextResponse.json({
      error: "Failed to retrieve AppStream bundles"
    }, {
      status: 500
    });
  }
}

// Helper function to convert region code to AWS region name
function getRegionName(regionCode: string): string | null {
  const regionMap: {[key: string]: string} = {
    'us-east-1': 'US East (N. Virginia)',
    'us-east-2': 'US East (Ohio)',
    'us-west-2': 'US West (Oregon)',
    'ap-northeast-1': 'Asia Pacific (Tokyo)',
    'ap-southeast-1': 'Asia Pacific (Singapore)',
    'ap-southeast-2': 'Asia Pacific (Sydney)',
    'ap-south-1': 'Asia Pacific (Mumbai)',
    'ap-northeast-2': 'Asia Pacific (Seoul)',
    'eu-central-1': 'EU (Frankfurt)',
    'eu-west-1': 'EU (Ireland)',
    'eu-west-2': 'EU (London)',
    'ca-central-1': 'Canada (Central)',
    'sa-east-1': 'South America (Sao Paulo)',
    'us-gov-west-1': 'AWS GovCloud (US)',
    'us-gov-east-1': 'AWS GovCloud (US-East)'
  };
  
  return regionMap[regionCode] || null;
}

// Fallback bundles data if the AWS API fails
function getFallbackBundles(instanceFamily: string) {
  switch(instanceFamily) {
    case 'general-purpose':
      return [
        { id: 'stream.standard.small', name: 'stream.standard.small', vcpu: 2, memory: 4, videoMemory: 'N/A' },
        { id: 'stream.standard.medium', name: 'stream.standard.medium', vcpu: 2, memory: 4, videoMemory: 'N/A' },
        { id: 'stream.standard.large', name: 'stream.standard.large', vcpu: 4, memory: 8, videoMemory: 'N/A' },
        { id: 'stream.standard.xlarge', name: 'stream.standard.xlarge', vcpu: 4, memory: 16, videoMemory: 'N/A' },
        { id: 'stream.standard.2xlarge', name: 'stream.standard.2xlarge', vcpu: 8, memory: 32, videoMemory: 'N/A' }
      ];
    case 'compute-optimized':
      return [
        { id: 'stream.compute.large', name: 'stream.compute.large', vcpu: 2, memory: 3.75, videoMemory: 'N/A' },
        { id: 'stream.compute.xlarge', name: 'stream.compute.xlarge', vcpu: 4, memory: 7.5, videoMemory: 'N/A' },
        { id: 'stream.compute.2xlarge', name: 'stream.compute.2xlarge', vcpu: 8, memory: 15, videoMemory: 'N/A' },
        { id: 'stream.compute.4xlarge', name: 'stream.compute.4xlarge', vcpu: 16, memory: 30, videoMemory: 'N/A' },
        { id: 'stream.compute.8xlarge', name: 'stream.compute.8xlarge', vcpu: 32, memory: 60, videoMemory: 'N/A' }
      ];
    // Add other instance families with their fallback data
    case 'memory-optimized':
      return [
        { id: 'stream.memory.large', name: 'stream.memory.large', vcpu: 2, memory: 8, videoMemory: 'N/A' },
        { id: 'stream.memory.xlarge', name: 'stream.memory.xlarge', vcpu: 4, memory: 16, videoMemory: 'N/A' },
        { id: 'stream.memory.2xlarge', name: 'stream.memory.2xlarge', vcpu: 8, memory: 32, videoMemory: 'N/A' },
        { id: 'stream.memory.4xlarge', name: 'stream.memory.4xlarge', vcpu: 16, memory: 64, videoMemory: 'N/A' },
        { id: 'stream.memory.8xlarge', name: 'stream.memory.8xlarge', vcpu: 32, memory: 128, videoMemory: 'N/A' },
        { id: 'stream.memory.z1d.large', name: 'stream.memory.z1d.large', vcpu: 2, memory: 16, videoMemory: 'N/A' },
        { id: 'stream.memory.z1d.xlarge', name: 'stream.memory.z1d.xlarge', vcpu: 4, memory: 32, videoMemory: 'N/A' },
        { id: 'stream.memory.z1d.2xlarge', name: 'stream.memory.z1d.2xlarge', vcpu: 8, memory: 64, videoMemory: 'N/A' },
        { id: 'stream.memory.z1d.3xlarge', name: 'stream.memory.z1d.3xlarge', vcpu: 12, memory: 96, videoMemory: 'N/A' },
        { id: 'stream.memory.z1d.6xlarge', name: 'stream.memory.z1d.6xlarge', vcpu: 24, memory: 192, videoMemory: 'N/A' },
        { id: 'stream.memory.z1d.12xlarge', name: 'stream.memory.z1d.12xlarge', vcpu: 48, memory: 384, videoMemory: 'N/A' }
      ];
    case 'graphics':
      return [
        { id: 'stream.graphics.g4dn.xlarge', name: 'stream.graphics.g4dn.xlarge', vcpu: 4, memory: 16, videoMemory: 8 },
        { id: 'stream.graphics.g4dn.2xlarge', name: 'stream.graphics.g4dn.2xlarge', vcpu: 8, memory: 32, videoMemory: 16 },
        { id: 'stream.graphics.g4dn.4xlarge', name: 'stream.graphics.g4dn.4xlarge', vcpu: 16, memory: 64, videoMemory: 16 },
        { id: 'stream.graphics.g4dn.8xlarge', name: 'stream.graphics.g4dn.8xlarge', vcpu: 32, memory: 128, videoMemory: 32 },
        { id: 'stream.graphics.g4dn.12xlarge', name: 'stream.graphics.g4dn.12xlarge', vcpu: 48, memory: 192, videoMemory: 16 },
        { id: 'stream.graphics.g4dn.16xlarge', name: 'stream.graphics.g4dn.16xlarge', vcpu: 64, memory: 256, videoMemory: 24 }
      ];
    case 'graphics-g5':
      return [
        { id: 'stream.graphics.g5.xlarge', name: 'stream.graphics.g5.xlarge', vcpu: 4, memory: 16, videoMemory: 16 },
        { id: 'stream.graphics.g5.2xlarge', name: 'stream.graphics.g5.2xlarge', vcpu: 8, memory: 32, videoMemory: 24 },
        { id: 'stream.graphics.g5.4xlarge', name: 'stream.graphics.g5.4xlarge', vcpu: 16, memory: 64, videoMemory: 24 },
        { id: 'stream.graphics.g5.8xlarge', name: 'stream.graphics.g5.8xlarge', vcpu: 32, memory: 128, videoMemory: 32 },
        { id: 'stream.graphics.g5.12xlarge', name: 'stream.graphics.g5.12xlarge', vcpu: 48, memory: 192, videoMemory: 24 },
        { id: 'stream.graphics.g5.16xlarge', name: 'stream.graphics.g5.16xlarge', vcpu: 64, memory: 256, videoMemory: 32 },
        { id: 'stream.graphics.g5.24xlarge', name: 'stream.graphics.g5.24xlarge', vcpu: 96, memory: 384, videoMemory: 96 }
      ];
    case 'graphics-pro':
      return [
        { id: 'stream.graphics-pro.4xlarge', name: 'stream.graphics-pro.4xlarge', vcpu: 16, memory: 122, videoMemory: 16 },
        { id: 'stream.graphics-pro.8xlarge', name: 'stream.graphics-pro.8xlarge', vcpu: 32, memory: 244, videoMemory: 32 },
        { id: 'stream.graphics-pro.16xlarge', name: 'stream.graphics-pro.16xlarge', vcpu: 64, memory: 488, videoMemory: 64 }
      ];
    case 'graphics-design':
      return [
        { id: 'stream.graphics-design.large', name: 'stream.graphics-design.large', vcpu: 2, memory: 8, videoMemory: 2 },
        { id: 'stream.graphics-design.xlarge', name: 'stream.graphics-design.xlarge', vcpu: 4, memory: 16, videoMemory: 4 },
        { id: 'stream.graphics-design.2xlarge', name: 'stream.graphics-design.2xlarge', vcpu: 8, memory: 32, videoMemory: 8 },
        { id: 'stream.graphics-design.4xlarge', name: 'stream.graphics-design.4xlarge', vcpu: 16, memory: 64, videoMemory: 16 }
      ];
    default:
      return [];
  }
}
