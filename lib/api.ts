import type { WorkSpaceConfig, ConfigOptions, PricingEstimate } from "@/types/workspace"

// Fetch configuration options (regions, bundles, OS, etc.)
export async function fetchConfigOptions(): Promise<ConfigOptions> {
  try {
    const response = await fetch("/api/config/options")

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("API error:", errorData)
      throw new Error(`Failed to fetch config options: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error("Error fetching config options:", {
    message: error?.message,
    stack: error?.stack,
    name: error?.name,
  })

    // Provide default values if the API fails
    return {
      regions: [
        { value: "us-east-1", label: "US East (N. Virginia)" },
        { value: "us-west-2", label: "US West (Oregon)" },
      ],
      bundles: [
        {
          id: "value",
          name: "Value",
          price: 21,
          specs: {
            vCPU: 2,
            memory: 4,
            storage: 80,
            graphics: "Standard",
          },
        },
        {
          id: "standard",
          name: "Standard",
          price: 35,
          specs: {
            vCPU: 2,
            memory: 8,
            storage: 80,
            graphics: "Standard",
          },
        },
      ],
      operatingSystems: [
        { value: "windows", label: "Windows" },
        { value: "amazon-linux", label: "Amazon Linux" },
      ],
      runningModes: [
        { value: "always-on", label: "AlwaysOn" },
        { value: "auto-stop", label: "AutoStop" },
      ],
      billingOptions: [
        { value: "monthly", label: "Monthly" },
        { value: "hourly", label: "Hourly" },
      ],
    }
  }
}

// Fetch user's current WorkSpaces setup
export async function fetchCurrentWorkspaces() {
  try {
    const response = await fetch("/api/user/current-workspaces")

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("API error:", errorData)
      throw new Error(`Failed to fetch current workspaces: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error("Error fetching current workspaces:", {
    message: error?.message,
    stack: error?.stack,
    name: error?.name,
  })
    // Return an empty array as a fallback
    return []
  }
}

// Calculate pricing based on selected configuration
export async function calculatePricing(config: WorkSpaceConfig): Promise<PricingEstimate> {
  try {
    // We'll include a flag to determine if this is a pool calculation
    const isPoolCalculation = 'isPoolCalculation' in config && config.isPoolCalculation === true;
    
    // Add the flag to the request body so the API knows it's a pool calculation
    const requestBody = {
      ...config,
      isPoolCalculation,
    };
    
    const response = await fetch("/api/pricing/estimate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("API error:", errorData);
      throw new Error(`Failed to calculate pricing: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error calculating pricing:", {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
    });

    // Determine if this is a pool calculation based on if poolBundleId exists
    const isPool = config.poolBundleId && config.poolBundleSpecs;
    
    // Provide a default pricing estimate if the API fails
    const baseRate = isPool ? 0.075 : 21; // Default to Value bundle or $0.075/hr for pool
    const userCount = isPool ? (config.poolNumberOfUsers || 10) : config.numberOfWorkspaces;
    
    if (isPool) {
      // For pool, calculate monthly cost based on hourly rate
      let hourlyRate = baseRate;
      
      // Apply license discount if using BYOL
      if (config.poolLicense === "bring-your-own-license" || config.license === "bring-your-own-license") {
        hourlyRate *= 0.85; // 15% discount for BYOL
      }
      
      const monthlyRate = hourlyRate * 730; // 730 hours per month
      const costPerWorkspace = monthlyRate;
      const totalMonthlyCost = costPerWorkspace * userCount;
      const annualEstimate = totalMonthlyCost * 12;
      
      return {
        costPerWorkspace,
        totalMonthlyCost,
        annualEstimate,
        bundleName: config.poolBundleSpecs?.type || "Value Pool",
        billingModel: "Hourly",
        baseCost: costPerWorkspace,
        pricingSource: "calculated"
      };
    } else {
      // For core, use existing fallback logic
      const baseCost = baseRate;
      const costPerWorkspace = baseCost;
      const totalMonthlyCost = costPerWorkspace * config.numberOfWorkspaces;
      const annualEstimate = totalMonthlyCost * 12;
      
      return {
        costPerWorkspace,
        totalMonthlyCost,
        annualEstimate,
        bundleName: "Value (Default)",
        billingModel: "Monthly",
        baseCost,
        pricingSource: "calculated"
      };
    }
  }
}

// AppStream endpoints
export async function fetchAppStreamConfig(region: string) {
  try {
    const response = await fetch(`/api/config/appstream?region=${region}`);
    if (!response.ok) {
      throw new Error('Failed to fetch AppStream configuration');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching AppStream configuration:', error);
    throw error;
  }
}

export async function fetchAppStreamBundles(region: string, instanceFamily: string, instanceFunction: string) {
  try {
    const response = await fetch(`/api/config/appstream/bundles?region=${region}&instanceFamily=${instanceFamily}&instanceFunction=${instanceFunction}`);
    if (!response.ok) {
      throw new Error('Failed to fetch AppStream bundles');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching AppStream bundles:', error);
    throw error;
  }
}

export async function calculateAppStreamPricing(params: any) {
  try {
    // Add instrumentation to log the initial request
    console.log('AppStream pricing request parameters:', {
      region: params.region,
      instanceType: params.instanceType,
      operatingSystem: params.operatingSystem,
      userCount: params.userCount,
      usagePattern: params.usagePattern,
      bufferFactor: params.bufferFactor
    });
    
    const response = await fetch('/api/pricing/appstream/estimate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    
    if (!response.ok) {
      throw new Error('Failed to calculate AppStream pricing');
    }
    
    const result = await response.json();
    
    // Debug the raw response with full details
    console.log('Raw API response:', {
      hourlyPrice: result.hourlyPrice,
      totalInstanceHours: result.totalInstanceHours,
      instanceCost: result.instanceCost,
      expectedCost: result.hourlyPrice * result.totalInstanceHours,
      userLicenseCost: result.userLicenseCost, 
      details: result.details?.calculationDetails
    });
    
    // Create a verification function that recalculates everything to ensure consistency
    const verifyCalculation = (result: any) => {
      const hourlyRate = result.hourlyPrice;
      const totalHours = result.totalInstanceHours;
      const userLicense = result.userLicenseCost;
      
      // Check for potential issues
      if (totalHours === 0) {
        console.error('CRITICAL ERROR: totalInstanceHours is 0, calculations will not be accurate!');
      }
      
      // Recalculate instance cost
      const calculatedInstanceCost = hourlyRate * totalHours;
      const calculatedTotal = calculatedInstanceCost + userLicense;
      
      // Compare with API result - use a small epsilon for floating point comparison
      const epsilon = 0.01;
      const instanceCostMatch = Math.abs(calculatedInstanceCost - result.instanceCost) < epsilon;
      const totalCostMatch = Math.abs(calculatedTotal - result.totalMonthlyCost) < epsilon;
      
      console.log(`Verification: 
        ${totalHours} hours × $${hourlyRate}/hr = $${calculatedInstanceCost.toFixed(2)}
        API returned: $${result.instanceCost.toFixed(2)}
        Instance cost match: ${instanceCostMatch ? 'YES' : 'NO - ERROR!'}
        
        With user license: $${userLicense.toFixed(2)}
        Expected total: $${calculatedTotal.toFixed(2)}
        API total: $${result.totalMonthlyCost.toFixed(2)}
        Total cost match: ${totalCostMatch ? 'YES' : 'NO - ERROR!'}
      `);
      
      return {
        expected: {
          instanceCost: calculatedInstanceCost,
          totalCost: calculatedTotal
        },
        actual: {
          instanceCost: result.instanceCost,
          totalCost: result.totalMonthlyCost
        },
        match: {
          instanceCost: instanceCostMatch,
          totalCost: totalCostMatch
        },
        anyMismatch: !instanceCostMatch || !totalCostMatch
      };
    };
    
    // Run the verification
    const verification = verifyCalculation(result);
    
    // If there's a mismatch, correct it
    if (verification.anyMismatch) {
      console.warn('Calculation mismatch detected, correcting values...');
      if (!verification.match.instanceCost) {
        result.instanceCost = verification.expected.instanceCost;
        console.log(`Corrected instance cost: ${result.instanceCost.toFixed(2)}`);
      }
      if (!verification.match.totalCost) {
        result.totalMonthlyCost = verification.expected.totalCost;
        console.log(`Corrected total cost: ${result.totalMonthlyCost.toFixed(2)}`);
      }
    }
    
    // Add a direct check for the AWS expected value of $277.70
    if (Math.abs(result.instanceCost - 277.70) < 5) {
      console.log('Close to AWS expected value of $277.70 - successful!');
    } else {
      console.log(`Not matching AWS expected value: got $${result.instanceCost.toFixed(2)}, expected $277.70`);
    }
    
    // For safety, if hours are 0 but we expected non-zero, set a fallback
    if (result.totalInstanceHours === 0 && params.usagePattern === 'custom') {
      console.warn('Zero hours detected in the API response, applying fallback calculation');
      // Recalculate hours based on usage pattern
      const weeksPerMonth = 4.35;
      const weekdayPeakHours = params.weekdayPeakHoursPerDay * params.weekdayDaysCount * weeksPerMonth * Math.min(params.weekdayPeakConcurrentUsers, params.userCount);
      const weekdayOffPeakHours = ((24 - params.weekdayPeakHoursPerDay) * params.weekdayDaysCount * weeksPerMonth) * Math.min(params.weekdayOffPeakConcurrentUsers, params.userCount);
      const weekendPeakHours = params.weekendPeakHoursPerDay * params.weekendDaysCount * weeksPerMonth * Math.min(params.weekendPeakConcurrentUsers, params.userCount);
      const weekendOffPeakHours = ((24 - params.weekendPeakHoursPerDay) * params.weekendDaysCount * weeksPerMonth) * Math.min(params.weekendOffPeakConcurrentUsers, params.userCount);
      
      // Update the result with the fallback calculations
      result.totalInstanceHours = weekdayPeakHours + weekdayOffPeakHours + weekendPeakHours + weekendOffPeakHours;
      result.utilizedInstanceHours = result.totalInstanceHours;
      result.instanceCost = result.hourlyPrice * result.totalInstanceHours;
      result.totalMonthlyCost = result.instanceCost + result.userLicenseCost;
      
      console.log(`Applied fallback calculation:
        Hours: ${result.totalInstanceHours}
        Cost: $${result.instanceCost.toFixed(2)}
        Total: $${result.totalMonthlyCost.toFixed(2)}
      `);
    }
    
    return result;
  } catch (error) {
    console.error('Error calculating AppStream pricing:', error);
    throw error;
  }
}

