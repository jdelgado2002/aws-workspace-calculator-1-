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
      const hourlyRate = baseRate;
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

