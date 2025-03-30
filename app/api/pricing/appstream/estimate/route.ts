import { NextResponse } from 'next/server';

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
      weekendPeakHoursPerDay = 4
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
    const basePricing = {
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
    
    // Get base hourly price for the instance
    const baseHourlyPrice = basePricing[instanceFamily]?.[instanceType] || 0;
    
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
    
    // Calculate total based on usage pattern
    let totalInstanceHours = 0;
    let totalUtilizedHours = 0;
    let totalBufferHours = 0;
    let calculationDetails = {};
    
    if (usagePattern === 'always-on') {
      const hoursInMonth = 730;
      const concurrentUsers = Math.min(userCount, weekdayPeakConcurrentUsers);
      totalUtilizedHours = hoursInMonth * concurrentUsers;
      totalBufferHours = instanceFunction === 'elasticfleet' ? 0 : (totalUtilizedHours * parsedBufferFactor);
      totalInstanceHours = totalUtilizedHours + totalBufferHours;

      calculationDetails = {
        hoursInMonth,
        userCount,
        concurrentUsers,
        totalUtilizedHours,
        totalBufferHours,
        totalInstanceHours,
        pattern: 'Always-On (24/7)',
        bufferFactor: parsedBufferFactor
      };
    } 
    else if (usagePattern === 'business-hours') {
      const weeksPerMonth = 4.35;
      const hoursPerDay = 8;
      const weekdayBusinessHours = weekdayDaysCount * hoursPerDay * weeksPerMonth;

      const businessHours = weekdayBusinessHours * Math.min(userCount, weekdayPeakConcurrentUsers);
      totalBufferHours = instanceFunction === 'elasticfleet' ? 0 : (businessHours * parsedBufferFactor);
      totalUtilizedHours = businessHours;
      totalInstanceHours = businessHours + totalBufferHours;

      calculationDetails = {
        weeksPerMonth,
        weekdayBusinessHours,
        userCount,
        peakConcurrentUsers: weekdayPeakConcurrentUsers,
        totalUtilizedHours,
        totalBufferHours,
        totalInstanceHours,
        pattern: 'Business Hours',
        bufferFactor: parsedBufferFactor
      };
    }
    else if (usagePattern === 'custom') {
      const weeksPerMonth = 4.35;

      // Weekday calculations
      const weekdayPeakHoursPerMonth = weekdayPeakHoursPerDay * weekdayDaysCount * weeksPerMonth;
      const weekdayOffPeakHoursPerMonth = (24 * weekdayDaysCount * weeksPerMonth) - weekdayPeakHoursPerMonth;

      const weekdayPeakHours = weekdayPeakHoursPerMonth * Math.min(weekdayPeakConcurrentUsers, userCount);
      const weekdayOffPeakHours = weekdayOffPeakHoursPerMonth * Math.min(weekdayOffPeakConcurrentUsers, userCount);

      // Weekend calculations (if included)
      let weekendPeakHours = 0;
      let weekendOffPeakHours = 0;
      let weekendPeakHoursPerMonth = 0;
      let weekendOffPeakHoursPerMonth = 0;

      if (includeWeekends) {
        weekendPeakHoursPerMonth = weekendPeakHoursPerDay * weekendDaysCount * weeksPerMonth;
        weekendOffPeakHoursPerMonth = (24 * weekendDaysCount * weeksPerMonth) - weekendPeakHoursPerMonth;

        weekendPeakHours = weekendPeakHoursPerMonth * Math.min(weekendPeakConcurrentUsers, userCount);
        weekendOffPeakHours = weekendOffPeakHoursPerMonth * Math.min(weekendOffPeakConcurrentUsers, userCount);
      }

      totalUtilizedHours = weekdayPeakHours + weekdayOffPeakHours + weekendPeakHours + weekendOffPeakHours;
      totalBufferHours = instanceFunction === 'elasticfleet' ? 0 : (totalUtilizedHours * parsedBufferFactor);
      totalInstanceHours = totalUtilizedHours + totalBufferHours;

      calculationDetails = {
        weeksPerMonth,
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
        includeWeekends,
        bufferFactor: parsedBufferFactor
      };
    } 
    else {
      // Default to simple calculation based on provided hours
      const estimatedMonthlyHours = usageHours || 730; // Default to 730 hours (average month)
      const concurrentUsers = Math.min(userCount, weekdayPeakConcurrentUsers);
      totalUtilizedHours = estimatedMonthlyHours * concurrentUsers;
      totalBufferHours = totalUtilizedHours * parsedBufferFactor;
      totalInstanceHours = totalUtilizedHours + totalBufferHours;
      
      calculationDetails = {
        userSpecifiedHours: estimatedMonthlyHours,
        concurrentUsers,
        totalUtilizedHours,
        totalBufferHours,
        totalInstanceHours,
        pattern: 'User Specified',
        bufferFactor: parsedBufferFactor
      };
    }
    
    // Calculate costs
    const instanceCost = totalInstanceHours * adjustedHourlyPrice;
    const userLicenseCost = userCount * userLicenseCostPerMonth;
    const totalMonthlyCost = instanceCost + userLicenseCost;
    
    // Calculate per user costs
    const effectiveUserCount = userCount > 0 ? userCount : 1;
    const costPerUser = totalMonthlyCost / effectiveUserCount;
    
    // Calculate annual cost and savings
    const annualCost = totalMonthlyCost * 12;
    
    // Calculate reserved instance savings (1-year and 3-year terms)
    const oneYearReservedSavings = annualCost * 0.75; // ~25% savings
    const threeYearReservedSavings = annualCost * 0.60; // ~40% savings
    
    return NextResponse.json({
      hourlyPrice: adjustedHourlyPrice,
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
