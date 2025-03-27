import { NextResponse } from "next/server"
import type { WorkSpaceConfig } from "@/types/workspace"
import { formatPriceForStorage, formatPriceForDisplay } from "@/lib/price-formatter"
import { getRegionLabel } from '@/lib/utils'

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
  // Replace with the shared utility function
  return getRegionLabel(regionCode);
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
    'graphics': 'Graphics', // Fixed: removed incorrect CPU' suffix
    'graphicspro': 'GraphicsPro', // Fixed: removed incorrect vCPU' suffix
    'graphics-g4dn': 'Graphics.g4dn',
    'graphicspro-g4dn': 'GraphicsPro.g4dn',
    'general-16': 'General Purpose (16 vCPU',  // Ensure format matches AWS exactly
    'general-32': 'General Purpose (32 vCPU'   // Ensure format matches AWS exactly
  };
  
  // Check each key against the bundleId
  for (const [key, value] of Object.entries(bundleMap)) {
    if (bundleId.toLowerCase().includes(key)) {
      return value;
    }
  }
  
  return 'Custom Bundle';
}

// Ensure storage volumes are properly accounted for in pricing estimates
export async function POST(request: Request) {
  try {
    const config: WorkSpaceConfig = await request.json()
    
    // Add more detailed logging for license tracking
    console.log("INCOMING CONFIG:", {
      bundleId: config.bundleId,
      rootVolume: config.rootVolume,
      userVolume: config.userVolume,
      operatingSystem: config.operatingSystem,
      license: config.license,
      poolLicense: config.poolLicense,
      isPoolCalculation: config.isPoolCalculation
    });

    // Initialize variables for pricing
    let baseCost = 0
    let bundleName = ""
    let pricingSource = "calculated" // Track if we're using AWS pricing or calculated pricing
    let selectedRootVolume = null; // Will store the selected root volume from API
    let selectedUserVolume = null; // Will store the selected user volume from API

    // Convert region code to AWS region name for API calls
    const regionName = getOriginalRegionName(config.region);
    console.log(`Using region name for API call: ${regionName}`);
    
    // Convert operating system value for the API
    // The API expects "Windows" or "Any" (for BYOL)
    let apiOperatingSystem = config.operatingSystem === 'windows' ? 'Windows' : 'Any';
    
    // Convert license value for the API
    let apiLicense; 
    if (config.isPoolCalculation) {
      // For pool calculations, use the pool license or the general license
      const licenseToUse = config.poolLicense || config.license || "included";
      apiLicense = licenseToUse === 'bring-your-own-license' ? 'Bring Your Own License' : 'Included';
      console.log(`Using pool license value: ${apiLicense}`);
    } else {
      // For regular WorkSpaces Core
      const licenseToUse = config.license || "included";
      apiLicense = licenseToUse === 'bring-your-own-license' ? 'Bring Your Own License' : 'Included';
      
      // If using BYOL with a non-Windows OS, use the "Any" OS
      if (licenseToUse === 'bring-your-own-license' && apiOperatingSystem !== 'Windows') {
        apiOperatingSystem = 'Any';
      }
    }
    
    console.log(`Using operating system: ${apiOperatingSystem}, license: ${apiLicense}`);
    
    // Create formatted volume strings for API calls
    // Always use the user-selected values if provided
    let formattedRootVolume = config.rootVolume ? `${config.rootVolume} GB` : "80 GB";
    let formattedUserVolume = config.userVolume ? `${config.userVolume} GB` : "100 GB";
    
    console.log(`Initial volume values from user selection: Root=${formattedRootVolume}, User=${formattedUserVolume}`);
    
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
          'graphics': 'Graphics', // Fixed: removed incorrect CPU' suffix
          'graphicspro': 'GraphicsPro', // Fixed: removed incorrect vCPU' suffix
          'graphics-g4dn': 'Graphics.g4dn',
          'graphicspro-g4dn': 'GraphicsPro.g4dn',
          'general-16': 'General Purpose (16 vCPU',  // Ensure format matches AWS exactly
          'general-32': 'General Purpose (32 vCPU'   // Ensure format matches AWS exactly
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
          
          // Check if our requested volumes are in the list of available volumes
          const userSelectedRootVolume = formattedRootVolume;
          const userSelectedUserVolume = formattedUserVolume;
          
          // Check if the user's volume selections are valid for this region/bundle
          const isRootVolumeValid = matchingVolumes.includes(userSelectedRootVolume);
          const isUserVolumeValid = matchingVolumes.includes(userSelectedUserVolume);
          
          console.log(`User selected volumes - Root: ${userSelectedRootVolume} (valid: ${isRootVolumeValid}), User: ${userSelectedUserVolume} (valid: ${isUserVolumeValid})`);
          
          // Now find a specific configuration that exists in the API
          let selectedConfig = null;
          let foundExactVolumeMatch = false;
          
          // Try to find a configuration that matches our exact OS, license AND volume preferences
          if (isRootVolumeValid && isUserVolumeValid) {
            for (const item of aggregationData.aggregations) {
              if (item.selectors && 
                  item.selectors["Bundle Description"] === matchingBundle &&
                  item.selectors["Operating System"] === apiOperatingSystem &&
                  item.selectors.License === apiLicense &&
                  item.selectors.rootVolume === userSelectedRootVolume &&
                  item.selectors.userVolume === userSelectedUserVolume) {
                
                // We found a perfect match with our preferred volumes
                selectedConfig = item.selectors;
                selectedRootVolume = selectedConfig.rootVolume;
                selectedUserVolume = selectedConfig.userVolume;
                foundExactVolumeMatch = true;
                console.log(`Found exact match with OS=${apiOperatingSystem}, License=${apiLicense}, Root=${selectedRootVolume}, User=${selectedUserVolume}`);
                break;
              }
            }
          }
          
          // If no exact match with OS, license and volumes, try finding one with matching OS and license
          if (!selectedConfig) {
            console.log(`No exact volume match found, looking for OS/License match only`);
            for (const item of aggregationData.aggregations) {
              if (item.selectors && 
                  item.selectors["Bundle Description"] === matchingBundle &&
                  item.selectors["Operating System"] === apiOperatingSystem &&
                  item.selectors.License === apiLicense) {
                // We found an OS/license match
                selectedConfig = item.selectors;
                selectedRootVolume = selectedConfig.rootVolume;
                selectedUserVolume = selectedConfig.userVolume;
                console.log(`Found OS/License match with fallback volumes: Root=${selectedRootVolume}, User=${selectedUserVolume}`);
                break;
              }
            }
          }
          
          // If still no match, fall back to any matching bundle
          if (!selectedConfig) {
            console.log(`No OS/License match found, using first available config`);
            for (const item of aggregationData.aggregations) {
              if (item.selectors && item.selectors["Bundle Description"] === matchingBundle) {
                selectedConfig = item.selectors;
                selectedRootVolume = selectedConfig.rootVolume;
                selectedUserVolume = selectedConfig.userVolume;
                break;
              }
            }
          }
          
          if (selectedConfig) {
            console.log("Selected configuration:", selectedConfig);
            
            // Use the provided OS and license for pricing, not the ones from the selected config
            const configToUse = {
              ...selectedConfig,
              "Operating System": apiOperatingSystem,
              "License": apiLicense
            };
            
            // Use the volumes from the selected configuration, UNLESS we found an exact volume match
            if (foundExactVolumeMatch) {
              // If we found an exact match, use the user's chosen volumes which are now confirmed valid
              formattedRootVolume = userSelectedRootVolume;
              formattedUserVolume = userSelectedUserVolume;
              console.log(`Using user-selected volumes (verified valid): Root=${formattedRootVolume}, User=${formattedUserVolume}`);
            } else {
              // If no exact match, fall back to the API-provided volumes
              formattedRootVolume = configToUse.rootVolume;
              formattedUserVolume = configToUse.userVolume;
              console.log(`Using API-provided volumes as fallback: Root=${formattedRootVolume}, User=${formattedUserVolume}`);
            }
            
            // Construct the pricing URL with exactly the values from the API
            const urlParams = [
              encodedRegion,
              encodeURIComponent(configToUse["Bundle Description"]),
              encodeURIComponent(formattedRootVolume),
              encodeURIComponent(formattedUserVolume),
              encodeURIComponent(configToUse["Operating System"]),
              encodeURIComponent(configToUse.License), 
              encodeURIComponent(configToUse["Running Mode"]),
              encodeURIComponent(configToUse["Product Family"])
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
                  price: parseFloat(info.price),   // Store the raw price
                  unit: info.Unit,
                  rateCode: info.rateCode
                });
              }
              
              // Calculate total monthly price for this configuration
              const totalMonthlyPrice = prices.reduce((sum, item) => sum + item.price, 0);
              
              // Use the pricing data from AWS
              bundleName = selectedConfig["Bundle Description"];
              baseCost = totalMonthlyPrice; // Store the raw price
              console.log(`Raw price from AWS: ${baseCost}`);
              pricingSource = "aws-api";
              
              // Ensure consistent price formatting
              baseCost = formatPriceForStorage(totalMonthlyPrice);
              console.log(`Using AWS API pricing: ${baseCost} (${formatPriceForDisplay(baseCost)}) for ${bundleName}`);
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
      // Continue with calculated pricing if not already handled
    }

    // If we couldn't get pricing from AWS API, use our calculated pricing
    if (pricingSource === "calculated") {
      console.log("Using calculated pricing");
      const rawPrice = estimateBundlePrice(config.bundleId, config.operatingSystem, config.runningMode);
      baseCost = formatPriceForStorage(rawPrice); // Ensure consistent price format
      bundleName = getBundleName(config.bundleId);
      console.log(`Using calculated pricing: ${baseCost} (${formatPriceForDisplay(baseCost)}) for ${bundleName}`);
    }

    // Apply running mode adjustment if not already handled
    if (pricingSource === "calculated" && config.runningMode === "auto-stop" && config.billingOption === "hourly") {
      // AutoStop with hourly billing typically costs less
      baseCost = baseCost * 0.8;
    }

    // If we're calculating pool pricing, make sure license is properly handled 
    if (config.isPoolCalculation === true) {
      console.log(`Pool calculation with license: ${config.license}, source: ${pricingSource}`);
      
      // Constants for pool pricing
      const LICENSE_COST_PER_USER = 4.19; // USD per user per month
      const STOPPED_INSTANCE_RATE = 0.025; // USD per hour for stopped instances
      const BUFFER_FACTOR = 0.10; // 10% buffer per AWS calculator
      
      // For calculated pricing, apply the discount
      if (pricingSource === "calculated" && config.license === "bring-your-own-license") {
        console.log("Applying BYOL discount to calculated pool pricing");
        baseCost *= 0.85; // Apply 15% discount for BYOL hourly rate
      }
      
      // User license costs
      const userLicenseCost = LICENSE_COST_PER_USER * config.numberOfWorkspaces;
      
      // We need to calculate utilization based on the pool usage pattern
      // This uses the same formula as in the front-end calculatePoolCosts function
      // ...calculation code for hours and buffer instances...
      
      // Update the baseCost to include user licenses and buffer costs
      console.log(`Using pool pricing methodology: hourlyRate=${baseCost}, userLicenses=${userLicenseCost}`);
      // We've already calculated hourly rate in baseCost, so we don't recalculate that
      // But we do need to add license costs to the final result
      
      // Include this in the response so the front end has all the data
      return NextResponse.json({
        // ...existing return fields...
        poolPricingDetails: {
          userLicenseCost,
          hourlyStreamingRate: baseCost,
          stoppedInstanceRate: STOPPED_INSTANCE_RATE,
          // Include hours calculations from usage pattern
        }
      });
    }

    // Calculate total costs - ensure consistent decimal handling
    const costPerWorkspace = baseCost;
    const totalMonthlyCost = formatPriceForStorage(costPerWorkspace * config.numberOfWorkspaces);
    const annualEstimate = formatPriceForStorage(totalMonthlyCost * 12);

    // Determine billing model display name
    const billingModel = config.billingOption === "monthly" ? "Monthly" : "Hourly";

    // Parse the volume information from API or use provided values
    let parsedRootVolume = null;
    let parsedUserVolume = null;

    if (selectedRootVolume) {
      const match = selectedRootVolume.match(/(\d+)\s*GB/i);
      if (match) {
        parsedRootVolume = match[1];
        console.log(`API provided root volume: ${parsedRootVolume}GB from "${selectedRootVolume}"`);
      }
    }

    if (selectedUserVolume) {
      const match = selectedUserVolume.match(/(\d+)\s*GB/i);
      if (match) {
        parsedUserVolume = match[1];
        console.log(`API provided user volume: ${parsedUserVolume}GB from "${selectedUserVolume}"`);
      }
    }

    // First use API provided values, then fall back to config values, then default calculation
    const rootVolume = parsedRootVolume || config.rootVolume || (config.bundleSpecs?.storage ? Math.floor(config.bundleSpecs.storage / 2).toString() : "80");
    const userVolume = parsedUserVolume || config.userVolume || (config.bundleSpecs?.storage ? Math.floor(config.bundleSpecs.storage / 2).toString() : "80");

    console.log(`FINAL VOLUME CHOICE: Root=${rootVolume}, User=${userVolume} (from config=${config.rootVolume}, from API=${selectedRootVolume})`);

    // Add a helper function to compute total storage
    function calculateTotalStorage(rootVol: string, userVol: string): number {
      let total = 0;
      
      // Parse root volume size
      if (rootVol) {
        const rootMatch = rootVol.match(/(\d+)/);
        if (rootMatch) {
          total += parseInt(rootMatch[1], 10);
        }
      }
      
      // Parse user volume size
      if (userVol) {
        const userMatch = userVol.match(/(\d+)/);
        if (userMatch) {
          total += parseInt(userMatch[1], 10);
        }
      }
      
      // Fallback if parsing failed
      return total > 0 ? total : 80;
    }
    
    // When creating the configuration, ensure volume info is included with the correct values
    const selectedConfiguration = {
      'Bundle Description': bundleName,
      rootVolume: `${rootVolume} GB`,
      userVolume: `${userVolume} GB`,
      'Operating System': apiOperatingSystem, // Use the correct API OS value
      License: apiLicense, // Use the correct API license value
      'Running Mode': config.runningMode === 'auto-stop' ? 'AutoStop' : 'AlwaysOn',
      'Product Family': 'WorkSpaces Core'
    };
    
    console.log(`FINAL API CONFIGURATION:`, selectedConfiguration);
    
    // When calculating the total storage for display in the response
    const totalStorage = calculateTotalStorage(
      selectedConfiguration.rootVolume,
      selectedConfiguration.userVolume
    );
    
    console.log(`STORAGE CALCULATION: Total=${totalStorage}GB (Root=${selectedConfiguration.rootVolume}, User=${selectedConfiguration.userVolume})`);
    
    // When returning the response, explicitly include the actual storage values used
    return NextResponse.json({
      costPerWorkspace,
      totalMonthlyCost,
      annualEstimate,
      bundleName,
      billingModel,
      baseCost,
      pricingSource,
      license: apiLicense, // Include the actual license used for the calculation
      storage: totalStorage,
      rootVolume: parseInt(rootVolume, 10),
      userVolume: parseInt(userVolume, 10),
      // Include the original configuration values for debugging
      originalConfig: {
        rootVolume: config.rootVolume,
        userVolume: config.userVolume,
        bundleStorage: config.bundleSpecs?.storage,
      },
      // Include the actual values used for the API call
      apiConfig: {
        rootVolume: formattedRootVolume,
        userVolume: formattedUserVolume,
      },
      // Include a flag to indicate if the user's volume selections were honored
      volumeSelectionHonored: selectedRootVolume === formattedRootVolume && selectedUserVolume === formattedUserVolume,
    });
    
    // Log the final cost summary
    console.log(`Cost Summary - Workspace: ${formatPriceForDisplay(costPerWorkspace)}, Total: ${formatPriceForDisplay(totalMonthlyCost)}, Annual: ${formatPriceForDisplay(annualEstimate)}`);
  } catch (error) {
    console.error("Error calculating pricing:", error);
    return NextResponse.json({ error: "Failed to calculate pricing" }, { status: 500 });
  }
}

