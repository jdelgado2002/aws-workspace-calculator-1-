import { NextResponse } from 'next/server';
import { getRegionLabel } from '@/lib/utils';

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const { 
      region, 
      instanceType, 
      instanceFamily,
      instanceFunction,
      operatingSystem,
      multiSession,
      usageHours,
      usersPerInstance = 1,
      numberOfInstances = 1,
      usagePattern = 'always-on',
      userCount = 10,
      bufferFactor = 0.0, // Default to 0 for elastic fleet
      includeWeekends = true,
      // Extract the concurrent user values from the request
      weekdayPeakConcurrentUsers = 80,
      weekdayOffPeakConcurrentUsers = 10,
      weekendPeakConcurrentUsers = 40,
      weekendOffPeakConcurrentUsers = 5,
      weekdayDaysCount = 5,
      weekdayPeakHoursPerDay = 8,
      weekendDaysCount = 2,
      weekendPeakHoursPerDay = 4,
      // NEW: Accept instance specifications directly from the client
      instanceSpecs = null
    } = data;
    
    // Ensure bufferFactor is properly parsed as a number and is valid
    const parsedBufferFactor = Math.min(1, Math.max(0, 
      typeof bufferFactor === 'string' ? parseFloat(bufferFactor) : (bufferFactor ?? 0)
    ));

    // Log the buffer factor being used
    console.log(`Using buffer factor: ${parsedBufferFactor * 100}%`);
    
    if (!region || !instanceType || !instanceFamily || !instanceFunction || !operatingSystem) {
      return NextResponse.json({
        error: "Missing required parameters"
      }, {
        status: 400
      });
    }

    // Base pricing data (USD per hour) for US East (N. Virginia) 
    // These values are only used as fallback if AWS API fails
    const FALLBACK_BASE_PRICING = {
      // Keep existing hardcoded prices as fallback
      'general-purpose': {
        'stream.standard.small': 0.10,
        'stream.standard.medium': 0.10,
        'stream.standard.large': 0.25,
        'stream.standard.xlarge': 0.34,
        'stream.standard.2xlarge': 0.68
      },
      'compute-optimized': {
        'stream.compute.large': 0.29,
        'stream.compute.xlarge': 0.58,
        'stream.compute.2xlarge': 1.16,
        'stream.compute.4xlarge': 2.32,
        'stream.compute.8xlarge': 4.64
      },
      'memory-optimized': {
        'stream.memory.large': 0.27,
        'stream.memory.xlarge': 0.54,
        'stream.memory.2xlarge': 1.08,
        'stream.memory.4xlarge': 2.16,
        'stream.memory.8xlarge': 4.32,
        'stream.memory.z1d.large': 0.30,
        'stream.memory.z1d.xlarge': 0.60,
        'stream.memory.z1d.2xlarge': 1.20,
        'stream.memory.z1d.3xlarge': 1.80,
        'stream.memory.z1d.6xlarge': 3.60,
        'stream.memory.z1d.12xlarge': 7.20
      },
      'graphics': {
        'stream.graphics.g4dn.xlarge': 0.65,
        'stream.graphics.g4dn.2xlarge': 0.94,
        'stream.graphics.g4dn.4xlarge': 1.88,
        'stream.graphics.g4dn.8xlarge': 3.43,
        'stream.graphics.g4dn.12xlarge': 5.37,
        'stream.graphics.g4dn.16xlarge': 6.85
      },
      'graphics-g5': {
        'stream.graphics.g5.xlarge': 0.75,
        'stream.graphics.g5.2xlarge': 1.06,
        'stream.graphics.g5.4xlarge': 2.12,
        'stream.graphics.g5.8xlarge': 3.78,
        'stream.graphics.g5.12xlarge': 5.89,
        'stream.graphics.g5.16xlarge': 7.46,
        'stream.graphics.g5.24xlarge': 11.78
      },
      'graphics-pro': {
        'stream.graphics-pro.4xlarge': 3.40,
        'stream.graphics-pro.8xlarge': 6.87,
        'stream.graphics-pro.16xlarge': 13.10
      },
      'graphics-design': {
        'stream.graphics-design.large': 0.42,
        'stream.graphics-design.xlarge': 0.83,
        'stream.graphics-design.2xlarge': 1.35,
        'stream.graphics-design.4xlarge': 2.75
      }
    };

    // Initialize these variables to calculate hours based on usage pattern
    const weeksPerMonth = 4.35;
    
    // IMPORTANT: Define calculationDetails object separately to store usage details
    const calculationDetails = {
      pattern: usagePattern,
      weeksPerMonth,
      userCount,
      bufferFactor: parsedBufferFactor
    };
    
    // ===== CALCULATE HOURS BASED ON USAGE PATTERN =====
    // IMPORTANT: Calculate hours only ONCE and store in these variables
    let totalUtilizedHours = 0;
    let totalBufferHours = 0;
    let totalInstanceHours = 0;
    
    // Calculate hours based on the specified usage pattern
    if (usagePattern === 'always-on') {
      // Always-on: 24/7 access
      const hoursInMonth = 730;
      const concurrentUsers = Math.min(userCount, weekdayPeakConcurrentUsers);
      totalUtilizedHours = hoursInMonth * concurrentUsers;
      totalBufferHours = instanceFunction === 'elasticfleet' ? 0 : (totalUtilizedHours * parsedBufferFactor);
      totalInstanceHours = totalUtilizedHours + totalBufferHours;
      
      // Store calculation details
      Object.assign(calculationDetails, {
        hoursInMonth,
        concurrentUsers,
        totalUtilizedHours,
        totalBufferHours,
        totalInstanceHours,
        pattern: 'Always-On (24/7)'
      });
    } 
    else if (usagePattern === 'business-hours') {
      // Business hours: 8 hours per day, weekdays only
      const hoursPerDay = 8;
      const weekdayBusinessHours = weekdayDaysCount * hoursPerDay * weeksPerMonth;
      const concurrentUsers = Math.min(userCount, weekdayPeakConcurrentUsers);
      totalUtilizedHours = weekdayBusinessHours * concurrentUsers;
      totalBufferHours = instanceFunction === 'elasticfleet' ? 0 : (totalUtilizedHours * parsedBufferFactor);
      totalInstanceHours = totalUtilizedHours + totalBufferHours;
      
      // Store calculation details
      Object.assign(calculationDetails, {
        weekdayBusinessHours,
        concurrentUsers,
        totalUtilizedHours,
        totalBufferHours,
        totalInstanceHours,
        pattern: 'Business Hours'
      });
    }
    else if (usagePattern === 'custom') {
      // Custom pattern: Calculate based on weekday and weekend patterns
      
      // Weekday calculations
      const weekdayPeakHoursPerMonth = weekdayPeakHoursPerDay * weekdayDaysCount * weeksPerMonth;
      const weekdayOffPeakHoursPerMonth = (24 * weekdayDaysCount * weeksPerMonth) - weekdayPeakHoursPerMonth;
      const weekdayPeakHours = weekdayPeakHoursPerMonth * Math.min(weekdayPeakConcurrentUsers, userCount);
      const weekdayOffPeakHours = weekdayOffPeakHoursPerMonth * Math.min(weekdayOffPeakConcurrentUsers, userCount);
      
      // Weekend calculations
      const weekendPeakHoursPerMonth = weekendPeakHoursPerDay * weekendDaysCount * weeksPerMonth;
      const weekendOffPeakHoursPerMonth = (24 * weekendDaysCount * weeksPerMonth) - weekendPeakHoursPerMonth;
      const weekendPeakHours = weekendPeakHoursPerMonth * Math.min(weekendPeakConcurrentUsers, userCount);
      const weekendOffPeakHours = weekendOffPeakHoursPerMonth * Math.min(weekendOffPeakConcurrentUsers, userCount);
      
      // Calculate total hours
      totalUtilizedHours = weekdayPeakHours + weekdayOffPeakHours + weekendPeakHours + weekendOffPeakHours;
      totalBufferHours = instanceFunction === 'elasticfleet' ? 0 : (totalUtilizedHours * parsedBufferFactor);
      totalInstanceHours = totalUtilizedHours + totalBufferHours;
      
      // Store calculation details
      Object.assign(calculationDetails, {
        weekdayPeakHoursPerMonth,
        weekdayOffPeakHoursPerMonth,
        weekendPeakHoursPerMonth,
        weekendOffPeakHoursPerMonth,
        weekdayPeakConcurrentUsers: Math.min(weekdayPeakConcurrentUsers, userCount),
        weekdayOffPeakConcurrentUsers: Math.min(weekdayOffPeakConcurrentUsers, userCount),
        weekendPeakConcurrentUsers: Math.min(weekendPeakConcurrentUsers, userCount),
        weekendOffPeakConcurrentUsers: Math.min(weekendOffPeakConcurrentUsers, userCount),
        weekdayPeakHours,
        weekdayOffPeakHours,
        weekendPeakHours,
        weekendOffPeakHours,
        totalUtilizedHours,
        totalBufferHours,
        totalInstanceHours,
        pattern: 'Custom',
        includeWeekends
      });
    } 
    else {
      // Default to simple calculation based on provided hours
      const estimatedMonthlyHours = usageHours || 730; // Default to 730 hours (average month)
      const concurrentUsers = Math.min(userCount, weekdayPeakConcurrentUsers);
      totalUtilizedHours = estimatedMonthlyHours * concurrentUsers;
      totalBufferHours = instanceFunction === 'elasticfleet' ? 0 : (totalUtilizedHours * parsedBufferFactor);
      totalInstanceHours = totalUtilizedHours + totalBufferHours;
      
      // Store calculation details
      Object.assign(calculationDetails, {
        userSpecifiedHours: estimatedMonthlyHours,
        concurrentUsers,
        totalUtilizedHours,
        totalBufferHours,
        totalInstanceHours,
        pattern: 'User Specified'
      });
    }
    
    // Log the initially calculated hours
    console.log(`Initial hours calculation: utilized=${totalUtilizedHours}, buffer=${totalBufferHours}, total=${totalInstanceHours}`);
    
    // Try to fetch actual pricing from AWS API
    let baseHourlyPrice;
    
    try {
      const regionName = getRegionLabel(region);
      
      // Extract instance specs either from the provided data or fetch from API
      let vCPU, memory, videoMemory;
      
      if (instanceSpecs) {
        // Use the specs provided by the client
        console.log('Using instance specs provided by client:', instanceSpecs);
        vCPU = instanceSpecs.vcpu || instanceSpecs.vCPU;
        memory = instanceSpecs.memory;
        videoMemory = instanceSpecs.videoMemory;
      } else {
        // Fall back to fetching from the API
        console.log('No instance specs provided, fetching from API');
        
        // First, fetch the instance specs from the aggregation data
        const aggregationUrl = `https://calculator.aws/pricing/2.0/meteredUnitMaps/appstream/USD/current/appstream-instances-calc/${encodeURIComponent(regionName)}/primary-selector-aggregations.json`;
        
        console.log('Fetching instance specifications from:', aggregationUrl);
        
        const aggregationResponse = await fetch(aggregationUrl, {
          headers: {
            'User-Agent': 'AWS-Calculator-Client',
            'Accept': '*/*',
            'Referer': 'https://calculator.aws/',
            'Origin': 'https://calculator.aws'
          }
        });
        
        if (!aggregationResponse.ok) {
          throw new Error(`Failed to fetch instance specifications: ${aggregationResponse.status}`);
        }
        
        const aggregationData = await aggregationResponse.json();
        
        // Find the matching instance details
        const instanceDetails = aggregationData.aggregations.find(item => 
          item.selectors["Instance Type"] === instanceType && 
          item.selectors["Instance Family"] === mapInstanceFamily(instanceFamily) &&
          item.selectors["Instance Function"] === mapInstanceFunction(instanceFunction) &&
          item.selectors["Operating System"] === mapOperatingSystem(operatingSystem)
        );
        
        if (!instanceDetails) {
          throw new Error(`Could not find specifications for ${instanceType} with the given parameters`);
        }
        
        // Extract the specs from the found instance
        vCPU = instanceDetails.selectors["vCPU"];
        memory = instanceDetails.selectors["Memory (GiB)"];
        videoMemory = instanceDetails.selectors["Video Memory (GiB)"];
      }
      
      console.log(`Using instance specs: vCPU=${vCPU}, Memory=${memory}, Video Memory=${videoMemory}`);
      
      // Now construct URL with the extracted parameters
      const urlParams = [
        encodeURIComponent(regionName),
        encodeURIComponent(mapInstanceFamily(instanceFamily)),
        encodeURIComponent(mapInstanceFunction(instanceFunction)),
        encodeURIComponent(instanceType),
        encodeURIComponent(vCPU),
        encodeURIComponent(memory),
        encodeURIComponent(videoMemory),
        encodeURIComponent(mapOperatingSystem(operatingSystem))
      ];
      
      const awsPricingUrl = `https://calculator.aws/pricing/2.0/meteredUnitMaps/appstream/USD/current/appstream-instances-calc/${urlParams.join('/')}/index.json`;
      
      console.log('Fetching AppStream pricing from:', awsPricingUrl);
      
      const response = await fetch(awsPricingUrl, {
        headers: {
          'User-Agent': 'AWS-Calculator-Client',
          'Accept': '*/*',
          'Referer': 'https://calculator.aws/',
          'Origin': 'https://calculator.aws'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const regionData = data.regions[regionName];
        
        if (regionData) {
          // Find the matching instance by key components
          const priceKey = Object.keys(regionData).find(key => {
            const entry = regionData[key];
            return entry["Instance Type"] === instanceType &&
                   entry["Instance Family"] === mapInstanceFamily(instanceFamily) &&
                   entry["Instance Function"] === mapInstanceFunction(instanceFunction) &&
                   entry["Operating System"] === mapOperatingSystem(operatingSystem);
          });

          if (priceKey) {
            baseHourlyPrice = parseFloat(regionData[priceKey].price);
            console.log(`Using AWS API pricing: $${baseHourlyPrice}/hr for ${instanceType} from API`);
            
            // Log and verify the price calculation with totalInstanceHours
            console.log(`AWS API price verification: ${totalInstanceHours} hours × $${baseHourlyPrice}/hr = $${(baseHourlyPrice * totalInstanceHours).toFixed(2)}`);
          } else {
            throw new Error(`No matching price found for ${instanceType} in ${regionName}`);
          }
        } else {
          throw new Error(`No pricing data found for region ${regionName}`);
        }
      } else {
        throw new Error('AWS Pricing API request failed');
      }
    } catch (error) {
      // Fallback to hardcoded pricing if AWS API fails
      baseHourlyPrice = FALLBACK_BASE_PRICING[instanceFamily]?.[instanceType];
      console.log(`Using fallback pricing: $${baseHourlyPrice}/hr for ${instanceType} (${error.message})`);
    }

    // Add helper functions to map our values to API expected values
    function mapInstanceFamily(family: string): string {
      const mapping = {
        'general-purpose': 'General purpose',
        'compute-optimized': 'Compute optimized',
        'memory-optimized': 'Memory optimized',
        'graphics': 'Graphics',
        'graphics-pro': 'Graphics Pro',
        'graphics-g5': 'Graphics G5',
        'graphics-design': 'Graphics Design'
      };
      return mapping[family] || family;
    }

    function mapInstanceFunction(func: string): string {
      const mapping = {
        'fleet': 'Fleet',
        'imagebuilder': 'ImageBuilder',
        'elasticfleet': 'ElasticFleet'
      };
      return mapping[func] || func;
    }

    function mapOperatingSystem(os: string): string {
      const mapping = {
        'windows': 'Windows',
        'amazon-linux': 'Amazon Linux',
        'rhel': 'Red Hat Enterprise Linux',
        'rocky-linux': 'Rocky Linux'
      };
      return mapping[os] || os;
    }
    
    // Region price multipliers relative to US East (N. Virginia)
    const regionMultipliers = {
      'us-east-1': 1.0,       // N. Virginia (reference)
      'us-east-2': 1.0,       // Ohio
      'us-west-2': 1.05,      // Oregon
      'ap-northeast-1': 1.25, // Tokyo
      'ap-southeast-1': 1.25, // Singapore
      'ap-southeast-2': 1.25, // Sydney
      'ap-south-1': 1.25,     // Mumbai
      'ap-northeast-2': 1.25, // Seoul
      'eu-central-1': 1.15,   // Frankfurt
      'eu-west-1': 1.15,      // Ireland
      'eu-west-2': 1.15,      // London
      'ca-central-1': 1.10,   // Canada
      'sa-east-1': 1.30,      // Sao Paulo
      'us-gov-west-1': 1.25,  // GovCloud (US)
      'us-gov-east-1': 1.25   // GovCloud (US-East)
    };
    
    // OS pricing addition per hour
    const osPricing = {
      'windows': 0.00,        // Windows license included in instance price
      'amazon-linux': 0.00,   // Linux is free
      'rhel': 0.10,           // Red Hat additional cost
      'rocky-linux': 0.00     // Rocky Linux is free
    };
    
    // User license costs per month
    // Based on AWS documentation - approximations for different license types
    const userLicenseCostPerMonth = operatingSystem === 'windows' ? 4.19 : 0;
    
    // Instance function multipliers
    const functionMultipliers = {
      'fleet': 1.0,            // Standard fleet instance
      'imagebuilder': 1.0,     // ImageBuilder is charged at the same rate
      'elasticfleet': 0.9      // ElasticFleet has potential savings (approximate)
    };
    
    // Multi-session discount (if applicable)
    const multiSessionMultiplier = multiSession === 'true' ? 0.8 : 1.0; // 20% discount for multi-session
    
    // Apply OS pricing
    const hourlyPriceWithOS = baseHourlyPrice + (osPricing[operatingSystem] || 0);
    
    // Apply instance function multiplier
    const functionMultiplier = functionMultipliers[instanceFunction] || 1.0;
    const hourlyPriceWithFunction = hourlyPriceWithOS * functionMultiplier;
    
    // Apply region multiplier
    const regionMultiplier = regionMultipliers[region] || 1.0;
    const hourlyPriceWithRegion = hourlyPriceWithFunction * regionMultiplier;
    
    // Apply multi-session modifier if applicable
    const adjustedHourlyPrice = hourlyPriceWithRegion * multiSessionMultiplier;
    
    // CRITICAL CHANGE: Do NOT recalculate or modify totalInstanceHours here!
    // Instead, use the already calculated values
    
    // Ensure we use the exact hourly rate from the API without any rounding
    // This is critical for matching AWS's pricing calculations
    const instanceCost = totalInstanceHours * baseHourlyPrice;
    const userLicenseCost = userCount * userLicenseCostPerMonth;
    const totalMonthlyCost = instanceCost + userLicenseCost;
    
    // Log the final calculation to verify
    console.log(`Final calculation: ${totalInstanceHours} hours × $${baseHourlyPrice}/hr = $${instanceCost.toFixed(2)}`);
    console.log(`With user license cost: $${userLicenseCost.toFixed(2)}`);
    console.log(`Total monthly cost: $${totalMonthlyCost.toFixed(2)}`);
    
    // Calculate per user costs
    const effectiveUserCount = userCount > 0 ? userCount : 1;
    const costPerUser = totalMonthlyCost / effectiveUserCount;
    
    // Calculate annual cost and savings
    const annualCost = totalMonthlyCost * 12;
    
    // Calculate reserved instance savings (1-year and 3-year terms)
    const oneYearReservedSavings = annualCost * 0.75; // ~25% savings
    const threeYearReservedSavings = annualCost * 0.60; // ~40% savings
    
    return NextResponse.json({
      hourlyPrice: baseHourlyPrice, // Use the exact API price, not adjustedHourlyPrice
      totalInstanceHours: totalInstanceHours,
      instanceCost: instanceCost,
      userLicenseCost: userLicenseCost,
      totalMonthlyCost: totalMonthlyCost,
      costPerUser: costPerUser,
      annualCost: annualCost,
      oneYearReservedCost: oneYearReservedSavings,
      threeYearReservedCost: threeYearReservedSavings,
      utilizedInstanceHours: totalUtilizedHours,
      bufferInstanceHours: totalBufferHours,
      details: {
        baseInstancePrice: baseHourlyPrice,
        osAddition: osPricing[operatingSystem] || 0,
        functionMultiplier: functionMultiplier,
        regionMultiplier: regionMultiplier,
        multiSessionMultiplier: multiSessionMultiplier,
        calculationDetails: calculationDetails,
        instanceType: instanceType,
        instanceFamily: instanceFamily,
        instanceFunction: instanceFunction,
        operatingSystem: operatingSystem,
        multiSession: multiSession === 'true',
        userCount: userCount,
        bufferFactor: parsedBufferFactor  // Include buffer factor in response
      }
    });
  } catch (error) {
    console.error('Error calculating AppStream pricing:', error);
    return NextResponse.json({
      error: "Failed to calculate pricing estimate"
    }, {
      status: 500
    });
  }
}
