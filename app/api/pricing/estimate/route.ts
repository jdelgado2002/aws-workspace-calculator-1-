import { NextResponse } from "next/server"
import type { WorkSpaceConfig } from "@/types/workspace"

// Define a helper function to fetch data from AWS public pricing API
async function fetchAwsPricingData(url: string, errorMessage: string) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'AWS-Calculator-Client',
        'Accept': '*/*',
        'Referer': 'https://calculator.aws/',
        'Origin': 'https://calculator.aws',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch from ${url}: ${response.statusText}`)
    }

    return await response.json()
  } catch (error) {
    console.error(errorMessage, error)
    throw new Error(errorMessage)
  }
}

// Extract the original region name from AWS region code
function getOriginalRegionName(regionCode: string) {
  // Map common region codes to their original names used in AWS pricing API
  const regionMap: Record<string, string> = {
    'us-east-1': 'US East (N. Virginia)',
    'us-west-2': 'US West (Oregon)',
    'eu-west-1': 'EU (Ireland)',
    'ap-northeast-1': 'Asia Pacific (Tokyo)',
    'ap-southeast-2': 'Asia Pacific (Sydney)',
    'ca-central-1': 'Canada (Central)',
    'eu-central-1': 'EU (Frankfurt)',
    'eu-west-2': 'EU (London)',
    'sa-east-1': 'South America (Sao Paulo)',
    'ap-south-1': 'Asia Pacific (Mumbai)',
    'ap-northeast-2': 'Asia Pacific (Seoul)',
    'ap-southeast-1': 'Asia Pacific (Singapore)',
    'il-central-1': 'Israel (Tel Aviv)',
    'us-gov-east-1': 'AWS GovCloud (US-East)',
    'us-gov-west-1': 'AWS GovCloud (US)'
  };
  
  return regionMap[regionCode] || regionCode;
}

// Helper function to estimate price based on bundle specs (fallback)
function estimateBundlePrice(bundleId: string, operatingSystem: string, runningMode: string) {
  // Convert bundleId to a standard format
  const bundleType = bundleId.toLowerCase();
  
  // Base prices for different bundle types
  let basePrice = 0;
  
  if (bundleType.includes('value')) {
    basePrice = 21;
  } else if (bundleType.includes('standard')) {
    basePrice = 35;
  } else if (bundleType.includes('performance')) {
    basePrice = 60;
  } else if (bundleType.includes('power') && !bundleType.includes('pro')) {
    basePrice = 80;
  } else if (bundleType.includes('powerpro')) {
    basePrice = 124;
  } else if (bundleType.includes('graphics') && bundleType.includes('pro')) {
    basePrice = 350;
  } else if (bundleType.includes('graphics')) {
    basePrice = 220;
  } else if (bundleType.includes('general') && bundleType.includes('16')) {
    basePrice = 250;
  } else if (bundleType.includes('general') && bundleType.includes('32')) {
    basePrice = 500;
  } else {
    basePrice = 35; // Default to standard pricing
  }
  
  // Adjust price based on operating system
  if (operatingSystem === 'any' || operatingSystem.includes('byol')) {
    basePrice *= 0.85; // BYOL discount approximately 15%
  }
  
  // Adjust price based on running mode
  if (runningMode === 'auto-stop') {
    // For AutoStop, we calculate an estimated cost based on typical usage (40hrs/week)
    const hourlyRate = basePrice / 730; // Approximate hourly rate
    basePrice = hourlyRate * 160; // Estimate 160 hours usage per month
  }
  
  return basePrice;
}

// Helper function to get bundle name from bundle ID
function getBundleName(bundleId: string) {
  const bundleMap: Record<string, string> = {
    'value': 'Value',
    'standard': 'Standard',
    'performance': 'Performance',
    'power': 'Power',
    'powerpro': 'PowerPro',
    'graphics': 'Graphics',
    'graphicspro': 'GraphicsPro',
    'graphics-g4dn': 'Graphics.g4dn',
    'graphicspro-g4dn': 'GraphicsPro.g4dn',
    'general-16': 'General Purpose (16 vCPU)',
    'general-32': 'General Purpose (32 vCPU)',
  };
  
  // Check each key against the bundleId
  for (const [key, value] of Object.entries(bundleMap)) {
    if (bundleId.toLowerCase().includes(key)) {
      return value;
    }
  }
  
  return 'Custom Bundle';
}

export async function POST(request: Request) {
  try {
    const config: WorkSpaceConfig = await request.json()

    // Initialize variables for pricing
    let baseCost = 0
    let bundleName = ""
    let pricingSource = "calculated" // Track if we're using AWS pricing or calculated pricing

    // Convert region code to AWS region name for API calls
    const regionName = getOriginalRegionName(config.region);
    console.log(`Using region name for API call: ${regionName}`);
    
    // Try to get direct pricing information from AWS Pricing API
    try {
      // First, try to fetch the aggregation data to verify parameters
      const encodedRegion = encodeURIComponent(regionName);
      console.log(`Fetching aggregation data for region: ${regionName}`);
      
      // This API call helps us verify what bundle configurations are valid
      const aggregationData = await fetchAwsPricingData(
        `https://calculator.aws/pricing/2.0/meteredUnitMaps/workspaces/USD/current/workspaces-core-calc/${encodedRegion}/primary-selector-aggregations.json`,
        `Failed to fetch aggregation data for ${regionName}`
      );
      
      if (aggregationData && aggregationData.aggregations) {
        // Find bundle that matches our selected bundle ID
        let matchingBundle = null;
        let matchingVolumes = [];
        let matchingOS = [];
        let matchingLicenses = [];
        let matchingRunningModes = [];
        
        // Extract bundle ID from config or convert to proper format
        let bundleId = config.bundleId.toLowerCase();
        
        // Map from our bundle ID to the expected bundle name prefix
        const bundleMap = {
          'value': 'Value',
          'standard': 'Standard',
          'performance': 'Performance',
          'power': 'Power',
          'powerpro': 'PowerPro',
          'graphics': 'Graphics',
          'graphicspro': 'GraphicsPro',
          'graphics-g4dn': 'Graphics.g4dn',
          'graphicspro-g4dn': 'GraphicsPro.g4dn',
          'general-16': 'General Purpose (16',
          'general-32': 'General Purpose (32'
        };
        
        // Find the bundle prefix we need to search for
        let bundlePrefix = bundleId;
        for (const [key, value] of Object.entries(bundleMap)) {
          if (bundleId.includes(key)) {
            bundlePrefix = value;
            break;
          }
        }
        
        console.log(`Looking for bundle that matches prefix: ${bundlePrefix}`);
        
        // Find all aggregations that match our bundle
        aggregationData.aggregations.forEach(item => {
          if (item.selectors && item.selectors["Bundle Description"]) {
            const description = item.selectors["Bundle Description"];
            
            // Check if this is the bundle we're looking for
            if (description.startsWith(bundlePrefix)) {
              // If we haven't found a matching bundle yet, save this one
              if (!matchingBundle) {
                matchingBundle = description;
                console.log(`Found matching bundle: ${matchingBundle}`);
              }
              
              // Collect available options for this bundle
              if (item.selectors.rootVolume && !matchingVolumes.includes(item.selectors.rootVolume)) {
                matchingVolumes.push(item.selectors.rootVolume);
              }
              
              if (item.selectors.userVolume && !matchingVolumes.includes(item.selectors.userVolume)) {
                matchingVolumes.push(item.selectors.userVolume);
              }
              
              if (item.selectors["Operating System"] && !matchingOS.includes(item.selectors["Operating System"])) {
                matchingOS.push(item.selectors["Operating System"]);
              }
              
              if (item.selectors.License && !matchingLicenses.includes(item.selectors.License)) {
                matchingLicenses.push(item.selectors.License);
              }
              
              if (item.selectors["Running Mode"] && !matchingRunningModes.includes(item.selectors["Running Mode"])) {
                matchingRunningModes.push(item.selectors["Running Mode"]);
              }
            }
          }
        });
        
        if (matchingBundle) {
          console.log(`Will use bundle: ${matchingBundle}`);
          console.log(`Available root/user volumes: ${matchingVolumes.join(', ')}`);
          console.log(`Available OS options: ${matchingOS.join(', ')}`);
          console.log(`Available license options: ${matchingLicenses.join(', ')}`);
          console.log(`Available running modes: ${matchingRunningModes.join(', ')}`);
          
          // Now find a specific configuration that exists in the API
          let selectedConfig = null;
          
          // Find an exact match if possible
          for (const item of aggregationData.aggregations) {
            if (item.selectors && item.selectors["Bundle Description"] === matchingBundle) {
              // We've found an exact match, use this configuration
              selectedConfig = item.selectors;
              break;
            }
          }
          
          // If no exact match, use the first configuration we found
          if (!selectedConfig) {
            for (const item of aggregationData.aggregations) {
              if (item.selectors && item.selectors["Bundle Description"] === matchingBundle) {
                selectedConfig = item.selectors;
                break;
              }
            }
          }
          
          if (selectedConfig) {
            console.log("Selected configuration:", selectedConfig);
            
            // Construct the pricing URL with exactly the values from the API
            // This ensures we're using the format AWS expects
            const urlParams = [
              encodedRegion,
              encodeURIComponent(selectedConfig["Bundle Description"]),
              encodeURIComponent(selectedConfig.rootVolume),
              encodeURIComponent(selectedConfig.userVolume),
              encodeURIComponent(selectedConfig["Operating System"]),
              encodeURIComponent(selectedConfig.License),
              encodeURIComponent(selectedConfig["Running Mode"]),
              encodeURIComponent(selectedConfig["Product Family"])
            ];
            
            const pricingUrl = `https://calculator.aws/pricing/2.0/meteredUnitMaps/workspaces/USD/current/workspaces-core-calc/${urlParams.join('/')}/index.json`;
            
            console.log(`Fetching pricing from URL: ${pricingUrl}`);
            
            // Fetch the pricing data
            const pricingData = await fetchAwsPricingData(
              pricingUrl,
              `Failed to fetch pricing for ${matchingBundle} in ${regionName}`
            );
            
            // Process the response
            if (pricingData && pricingData.regions && pricingData.regions[regionName]) {
              // Extract the pricing information
              const regionData = pricingData.regions[regionName];
              const prices = [];
              
              // Loop through all pricing entries in the response
              for (const [key, priceInfo] of Object.entries(regionData)) {
                const info = priceInfo as any;
                prices.push({
                  description: key,
                  price: parseFloat(info.price),
                  unit: info.Unit,
                  rateCode: info.rateCode
                });
              }
              
              // Calculate total monthly price for this configuration
              const totalMonthlyPrice = prices.reduce((sum, item) => sum + item.price, 0);
              
              // Use the pricing data from AWS
              bundleName = selectedConfig["Bundle Description"];
              baseCost = totalMonthlyPrice;
              pricingSource = "aws-api";
              
              console.log(`Using AWS API pricing: ${baseCost} for ${bundleName}`);
            } else {
              throw new Error("No pricing data available from AWS API");
            }
          } else {
            throw new Error("No valid configuration found in AWS API");
          }
        } else {
          throw new Error(`No matching bundle found for ${bundleId}`);
        }
      } else {
        throw new Error("Invalid aggregation data from AWS API");
      }
    } catch (error) {
      console.error("Error fetching pricing details:", error);
      // Continue with calculated pricing
    }

    // If we couldn't get pricing from AWS API, use our calculated pricing
    if (pricingSource === "calculated") {
      console.log("Using calculated pricing");
      
      baseCost = estimateBundlePrice(config.bundleId, config.operatingSystem, config.runningMode);
      bundleName = getBundleName(config.bundleId);
    }

    // Apply running mode adjustment if not already handled
    if (pricingSource === "calculated" && config.runningMode === "auto-stop" && config.billingOption === "hourly") {
      // AutoStop with hourly billing typically costs less
      baseCost = baseCost * 0.8;
    }

    // Calculate total costs
    const costPerWorkspace = baseCost;
    const totalMonthlyCost = costPerWorkspace * config.numberOfWorkspaces;
    const annualEstimate = totalMonthlyCost * 12;

    // Determine billing model display name
    const billingModel = config.billingOption === "monthly" ? "Monthly" : "Hourly";

    return NextResponse.json({
      costPerWorkspace,
      totalMonthlyCost,
      annualEstimate,
      bundleName,
      billingModel,
      baseCost,
      pricingSource,
    });
  } catch (error) {
    console.error("Error calculating pricing:", error);
    return NextResponse.json({ error: "Failed to calculate pricing" }, { status: 500 });
  }
}

