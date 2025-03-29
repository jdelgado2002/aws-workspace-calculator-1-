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
      bufferFactor = 0.1, // Default buffer factor
      peakHoursPerWeekday = 8,
      peakHoursPerWeekendDay = 10,
      includeWeekends = true
    } = data;
    
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
      // 24/7 calculation - straightforward
      const hoursInMonth = 730;
      totalInstanceHours = hoursInMonth * numberOfInstances;
      
      calculationDetails = {
        hoursPerMonth: hoursInMonth,
        instances: numberOfInstances,
        pattern: 'Always-On (24/7)'
      };
    } 
    else if (usagePattern === 'business-hours') {
      // Business hours calculation
      const weekdaysPerMonth = 21.7; // Average number of weekdays in a month
      const businessHoursPerDay = 8; // 8 hours per day
      const hoursPerMonth = weekdaysPerMonth * businessHoursPerDay;
      
      // Calculate required instances based on user count and users per instance
      let requiredInstances = multiSession === 'true' ? 
        Math.ceil(userCount / usersPerInstance) : userCount;
        
      // Add buffer instances
      const bufferInstances = Math.ceil(requiredInstances * bufferFactor);
      const totalRequiredInstances = requiredInstances + bufferInstances;
      
      totalUtilizedHours = hoursPerMonth * requiredInstances;
      totalBufferHours = hoursPerMonth * bufferInstances;
      totalInstanceHours = hoursPerMonth * totalRequiredInstances;
      
      calculationDetails = {
        weekdaysPerMonth,
        businessHoursPerDay,
        hoursPerMonth,
        userCount,
        usersPerInstance,
        requiredInstances,
        bufferInstances,
        totalRequiredInstances,
        pattern: 'Business Hours',
        utilizedHours: totalUtilizedHours,
        bufferHours: totalBufferHours
      };
    }
    else if (usagePattern === 'custom') {
      // Custom calculation using AWS methodology
      const weeksPerMonth = 4.35; // 730 hours in a month / 168 hours in a week
      const weekdayWorkingHoursPerMonth = 24 * 5 * weeksPerMonth; // 24 hours * 5 days * 4.35 weeks
      const weekendWorkingHoursPerMonth = includeWeekends ? 24 * 2 * weeksPerMonth : 0; // 24 hours * 2 days * 4.35 weeks (if weekends included)
      
      // Weekday calculations
      const weekdayPeakHoursPerMonth = peakHoursPerWeekday * 5 * weeksPerMonth;
      const weekdayOffPeakHoursPerMonth = weekdayWorkingHoursPerMonth - weekdayPeakHoursPerMonth;
      
      // Calculate required instances based on user count and users per instance
      const requiredInstances = multiSession === 'true' ? 
        Math.ceil(userCount / usersPerInstance) : userCount;
      
      // Weekday utilized hours
      const weekdayPeakUtilizedHours = weekdayPeakHoursPerMonth * requiredInstances;
      const weekdayOffPeakUtilizedHours = weekdayOffPeakHoursPerMonth * requiredInstances;
      const weekdayTotalUtilizedHours = weekdayPeakUtilizedHours + weekdayOffPeakUtilizedHours;
      
      // Weekday buffer hours
      const weekdayPeakBufferInstances = Math.ceil(requiredInstances * bufferFactor);
      const weekdayOffPeakBufferInstances = Math.ceil(requiredInstances * bufferFactor);
      const weekdayPeakBufferHours = weekdayPeakHoursPerMonth * weekdayPeakBufferInstances;
      const weekdayOffPeakBufferHours = weekdayOffPeakHoursPerMonth * weekdayOffPeakBufferInstances;
      const weekdayTotalBufferHours = weekdayPeakBufferHours + weekdayOffPeakBufferHours;
      
      let weekendTotalUtilizedHours = 0;
      let weekendTotalBufferHours = 0;
      
      // Weekend calculations (if included)
      if (includeWeekends) {
        const weekendPeakHoursPerMonth = peakHoursPerWeekendDay * 2 * weeksPerMonth;
        const weekendOffPeakHoursPerMonth = weekendWorkingHoursPerMonth - weekendPeakHoursPerMonth;
        
        // Weekend utilized hours
        const weekendPeakUtilizedHours = weekendPeakHoursPerMonth * requiredInstances;
        const weekendOffPeakUtilizedHours = weekendOffPeakHoursPerMonth * requiredInstances;
        weekendTotalUtilizedHours = weekendPeakUtilizedHours + weekendOffPeakUtilizedHours;
        
        // Weekend buffer hours
        const weekendPeakBufferInstances = Math.ceil(requiredInstances * bufferFactor);
        const weekendOffPeakBufferInstances = Math.ceil(requiredInstances * bufferFactor);
        const weekendPeakBufferHours = weekendPeakHoursPerMonth * weekendPeakBufferInstances;
        const weekendOffPeakBufferHours = weekendOffPeakHoursPerMonth * weekendOffPeakBufferInstances;
        weekendTotalBufferHours = weekendPeakBufferHours + weekendOffPeakBufferHours;
      }
      
      // Total hours
      totalUtilizedHours = weekdayTotalUtilizedHours + weekendTotalUtilizedHours;
      totalBufferHours = weekdayTotalBufferHours + weekendTotalBufferHours;
      totalInstanceHours = totalUtilizedHours + totalBufferHours;
      
      calculationDetails = {
        weeksPerMonth,
        weekdayWorkingHoursPerMonth,
        weekendWorkingHoursPerMonth,
        weekdayPeakHoursPerMonth,
        weekdayOffPeakHoursPerMonth,
        userCount,
        usersPerInstance,
        requiredInstances,
        weekdayTotalUtilizedHours,
        weekdayTotalBufferHours,
        weekendTotalUtilizedHours,
        weekendTotalBufferHours,
        pattern: 'Custom',
        includeWeekends,
        peakHoursPerWeekday,
        peakHoursPerWeekendDay,
        bufferFactor
      };
    } 
    else {
      // Default to simple calculation based on provided hours
      const estimatedMonthlyHours = usageHours || 730; // Default to 730 hours (average month)
      totalInstanceHours = estimatedMonthlyHours * numberOfInstances;
      
      calculationDetails = {
        userSpecifiedHours: estimatedMonthlyHours,
        instances: numberOfInstances,
        pattern: 'User Specified'
      };
    }
    
    // Calculate costs
    const instanceCost = totalInstanceHours * adjustedHourlyPrice;
    const userLicenseCost = userCount * userLicenseCostPerMonth;
    const totalMonthlyCost = instanceCost + userLicenseCost;
    
    // Calculate per user costs
    const effectiveUserCount = userCount > 0 ? userCount : (numberOfInstances * usersPerInstance);
    const costPerUser = effectiveUserCount > 0 ? totalMonthlyCost / effectiveUserCount : 0;
    
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
        multiSession: multiSession === 'true'
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
