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

    // Initialize variables for pricing and volume validation
    let baseCost = 0
    let bundleName = ""
    let pricingSource = "calculated" // Track if we're using AWS pricing or calculated pricing
    let selectedRootVolume = null; // Will store the selected root volume from API
    let selectedUserVolume = null; // Will store the selected user volume from API
    // Add variables to track volume validity throughout the entire function
    let isRootVolumeValid = true; // Default to true
    let isUserVolumeValid = true; // Default to true

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
    // For Pool calculations, we don't need to provide user-selected volumes
    let formattedRootVolume = config.isPoolCalculation 
      ? "200 GB" // Default for pools, will be overridden by API
      : (config.rootVolume ? `${config.rootVolume} GB` : "80 GB");
    
    let formattedUserVolume = config.isPoolCalculation
      ? undefined // Pools don't use user volumes in the same way
      : (config.userVolume ? `${config.userVolume} GB` : "100 GB");
    
    console.log(`Initial volume values from user selection: Root=${formattedRootVolume}, User=${formattedUserVolume || "N/A for Pools"}`);
    
    // Try to get direct pricing information from AWS Pricing API
    try {
      // First, try to fetch the aggregation data to verify parameters
      const encodedRegion = encodeURIComponent(regionName);
      console.log(`Fetching aggregation data for region: ${regionName}`);
      
      // Determine the API endpoint based on whether this is a pool calculation
      const apiType = config.isPoolCalculation ? "workspaces-pools-calc" : "workspaces-core-calc";
      
      // This API call helps us verify what bundle configurations are valid
      const aggregationData = await fetchAwsPricingData(
        `https://calculator.aws/pricing/2.0/meteredUnitMaps/workspaces/USD/current/${apiType}/${encodedRegion}/primary-selector-aggregations.json`,
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
          'general-16': 'General Purpose (16 vCPU',
          'general-32': 'General Purpose (32 vCPU',
          'pool-value': 'Value',
          'pool-standard': 'Standard',
          'pool-performance': 'Performance',
          'pool-power': 'Power',
          'pool-powerpro': 'PowerPro'
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
          if (item.selectors) {
            // For pools, the key might be "Bundle" instead of "Bundle Description"
            const bundleKey = config.isPoolCalculation ? "Bundle" : "Bundle Description";
            const description = item.selectors[bundleKey];
            
            // Check if this is the bundle we're looking for
            if (description && description.startsWith(bundlePrefix)) {
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
          
          // Find the closest available volumes to what the user selected
          const userSelectedRootVolume = formattedRootVolume;
          const userSelectedUserVolume = formattedUserVolume;
          
          // For Pools, we only need to check if the root volume is valid 
          // since user volume might not be applicable
          if (config.isPoolCalculation) {
            // For pools, we don't validate the user's selections; we use what the API tells us
            console.log(`Pool calculation - will use API-provided volumes`);
            isRootVolumeValid = true;
            isUserVolumeValid = true;
          } else {
            // Check if the user's volume selections are valid for this region/bundle
            isRootVolumeValid = matchingVolumes.includes(userSelectedRootVolume);
            isUserVolumeValid = matchingVolumes.includes(userSelectedUserVolume);
            
            console.log(`User selected volumes - Root: ${userSelectedRootVolume} (valid: ${isRootVolumeValid}), User: ${userSelectedUserVolume} (valid: ${isUserVolumeValid})`);
            
            // If volumes are not valid, find the closest alternatives
            if (!isRootVolumeValid || !isUserVolumeValid) {
              // Parse the volume sizes as numbers for comparison
              const requestedRootSize = parseInt(userSelectedRootVolume.replace(/\s*GB$/i, ''), 10);
              const requestedUserSize = parseInt(userSelectedUserVolume.replace(/\s*GB$/i, ''), 10);
              
              // Extract sizes from available volumes and sort them
              const availableVolumeSizes = matchingVolumes.map(vol => {
                const sizeMatch = vol.match(/(\d+)\s*GB/i);
                return sizeMatch ? parseInt(sizeMatch[1], 10) : 0;
              }).filter(size => size > 0).sort((a, b) => a - b);
              
              console.log(`Available volume sizes: ${availableVolumeSizes.join(', ')} GB`);
              
              // Find the closest root volume
              if (!isRootVolumeValid && availableVolumeSizes.length > 0) {
                // Find the closest volume (either equal or greater)
                let closestRootSize = availableVolumeSizes[0]; // Default to smallest
                
                for (const size of availableVolumeSizes) {
                  if (size >= requestedRootSize) {
                    closestRootSize = size;
                    break;
                  }
                }
                
                formattedRootVolume = `${closestRootSize} GB`;
                console.log(`Selected closest root volume: ${formattedRootVolume}`);
              }
              
              // Find the closest user volume
              if (!isUserVolumeValid && availableVolumeSizes.length > 0) {
                // Find the closest volume (either equal or greater)
                let closestUserSize = availableVolumeSizes[0]; // Default to smallest
                
                for (const size of availableVolumeSizes) {
                  if (size >= requestedUserSize) {
                    closestUserSize = size;
                    break;
                  }
                }
                
                formattedUserVolume = `${closestUserSize} GB`;
                console.log(`Selected closest user volume: ${formattedUserVolume}`);
              }
            }
          }
          
          // Now find a specific configuration that exists in the API
          let selectedConfig = null;
          let foundExactVolumeMatch = false;
          let bundleKey = config.isPoolCalculation ? "Bundle" : "Bundle Description";
          
          // Try to find a configuration that matches our exact OS, license AND adjusted volume preferences
          for (const item of aggregationData.aggregations) {
            if (item.selectors && 
                item.selectors[bundleKey] === matchingBundle &&
                item.selectors["Operating System"] === apiOperatingSystem &&
                item.selectors.License === apiLicense &&
                item.selectors.rootVolume === formattedRootVolume &&
                item.selectors.userVolume === formattedUserVolume) {
              
              // We found a perfect match with our preferred volumes
              selectedConfig = item.selectors;
              selectedRootVolume = selectedConfig.rootVolume;
              selectedUserVolume = selectedConfig.userVolume;
              foundExactVolumeMatch = true;
              console.log(`Found exact match with OS=${apiOperatingSystem}, License=${apiLicense}, Root=${selectedRootVolume}, User=${selectedUserVolume}`);
              break;
            }
          }
          
          // If no exact match with OS, license and volumes, try finding one with matching OS and license
          if (!selectedConfig) {
            console.log(`No exact volume match found, looking for OS/License match only`);
            for (const item of aggregationData.aggregations) {
              if (item.selectors && 
                  item.selectors[bundleKey] === matchingBundle &&
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
              if (item.selectors && item.selectors[bundleKey] === matchingBundle) {
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
              "License": apiLicense,
              // For pool calculations, use "Pool" as running mode
              "Running Mode": config.isPoolCalculation ? "Pool" : selectedConfig["Running Mode"],
              // For pool calculations, use "Enterprise Applications" as product family
              "Product Family": config.isPoolCalculation ? "Enterprise Applications" : "WorkSpaces Core"
            };
            
            // Always use the API-provided volumes to ensure compatibility
            formattedRootVolume = selectedConfig.rootVolume;
            // For pools, userVolume might not be present in the API response
            formattedUserVolume = config.isPoolCalculation 
              ? undefined 
              : (selectedConfig.userVolume || formattedUserVolume);
              
            console.log(`Using API-provided volumes: Root=${formattedRootVolume}, User=${formattedUserVolume || "N/A for Pools"}`);
            
            // Construct the pricing URL with exactly the values from the API
            const urlParams = [
              encodedRegion,
              encodeURIComponent(config.isPoolCalculation ? configToUse.Bundle : configToUse["Bundle Description"]),
            ];
            
            // Add vCPU and Memory for pool calculations
            if (config.isPoolCalculation && configToUse.vCPU) {
              urlParams.push(encodeURIComponent(configToUse.vCPU));
              urlParams.push(encodeURIComponent(formattedRootVolume));
              urlParams.push(encodeURIComponent(configToUse.Memory));
            } else {
              // Regular Core parameters
              urlParams.push(encodeURIComponent(formattedRootVolume));
              urlParams.push(encodeURIComponent(formattedUserVolume));
            }
            
            // Add common parameters
            urlParams.push(encodeURIComponent(configToUse["Operating System"]));
            urlParams.push(encodeURIComponent(configToUse.License));
            urlParams.push(encodeURIComponent(configToUse["Running Mode"]));
            urlParams.push(encodeURIComponent(configToUse["Product Family"]));
            
            const pricingUrl = `https://calculator.aws/pricing/2.0/meteredUnitMaps/workspaces/USD/current/${apiType}/${urlParams.join('/')}/index.json`;
            console.log(`Fetching pricing from URL: ${pricingUrl}`);
            
            try {
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
                const totalMonthlyPrice = prices.reduce((sum, item) => {
                  // For hourly prices (Pool or AutoStop), multiply by 730 hours/month
                  if (item.unit && item.unit.toLowerCase() === 'hour') {
                    return sum + (item.price * 730);
                  }
                  return sum + item.price;
                }, 0);
                
                // Use the pricing data from AWS
                bundleName = config.isPoolCalculation ? configToUse.Bundle : configToUse["Bundle Description"];
                baseCost = totalMonthlyPrice; // Store the raw price
                console.log(`Raw price from AWS: ${baseCost}`);
                pricingSource = "aws-api";
                
                // Ensure consistent price formatting
                baseCost = formatPriceForStorage(totalMonthlyPrice);
                console.log(`Using AWS API pricing: ${baseCost} (${formatPriceForDisplay(baseCost)}) for ${bundleName}`);
              } else {
                throw new Error("No pricing data available from AWS API");
              }
            } catch (error) {
              console.error(`Error fetching AWS pricing data:`, error);
              // Fall back to calculated pricing
              console.log("Falling back to calculated pricing due to API error");
              pricingSource = "calculated";
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
      const STOPPED_INSTANCE_RATE = 0.03; // USD per hour for stopped instances (updated from 0.025 to 0.03)
      const BUFFER_FACTOR = 0.0; // 10% buffer per AWS calculator
      const WEEKS_PER_MONTH = 4.35; // 730 hours / 168 hours per week = 4.35
      
      // For calculated pricing, apply the discount for BYOL
      if (pricingSource === "calculated" && 
         (config.license === "bring-your-own-license" || config.poolLicense === "bring-your-own-license")) {
        console.log("Applying BYOL discount to calculated pool pricing");
        baseCost *= 0.85; // Apply 15% discount for BYOL hourly rate
      }
      
      // Calculate streaming cost per hour - this is the CRITICAL part where our calculation was off
      // The AWS calculator uses a value around 0.059 per hour for Value bundle with BYOL
      // We need to ensure our hourly rate aligns with AWS's rates
      
      // Adjust the streaming rate based on bundle type and license
      let streamingRatePerHour = baseCost / 730; // Default conversion
      
      // If we're using API pricing, the baseCost should be correct, but we still verify
      if (pricingSource === "aws-api") {
        // Make sure baseCost represents the monthly cost that would result 
        // from using the instance for all 730 hours in a month
        // We don't need to adjust further as the AWS API should provide the correct rate
        console.log(`Using AWS API pricing base: ${baseCost}/month, ${streamingRatePerHour}/hour`);
      } else {
        // For calculated pricing, we need to ensure our rates match AWS's
        // Standard rates for pool bundles (adjust as needed based on testing)
        const BUNDLE_HOURLY_RATES = {
          'value': { 'included': 0.070, 'byol': 0.059 },
          'standard': { 'included': 0.090, 'byol': 0.075 },
          'performance': { 'included': 0.130, 'byol': 0.110 },
          'power': { 'included': 0.175, 'byol': 0.149 },
          'powerpro': { 'included': 0.250, 'byol': 0.213 }
        };
        
        // Extract the bundle type from bundleId (strip 'pool-' prefix if present)
        const bundleType = config.bundleId.toLowerCase().replace('pool-', '');
        // Determine which license pricing to use
        const licenseType = (config.poolLicense === 'bring-your-own-license' || config.license === 'bring-your-own-license') 
          ? 'byol' 
          : 'included';
        
        // Get the appropriate hourly rate for this bundle/license combination
        if (BUNDLE_HOURLY_RATES[bundleType] && BUNDLE_HOURLY_RATES[bundleType][licenseType]) {
          streamingRatePerHour = BUNDLE_HOURLY_RATES[bundleType][licenseType];
          console.log(`Using predefined hourly rate for ${bundleType}/${licenseType}: $${streamingRatePerHour}/hour`);
        } else {
          // Fall back to original calculation if bundle type not found
          console.log(`No predefined rate for ${bundleType}/${licenseType}, using calculated rate: $${streamingRatePerHour}/hour`);
        }
      }
      
      console.log(`Final streaming rate per hour: ${streamingRatePerHour}`);
      
      // Get user count and usage pattern
      const userCount = config.numberOfWorkspaces || config.poolNumberOfUsers || 10;
      const usagePattern = config.poolUsagePattern || {
        weekdayDaysCount: 5,
        weekdayPeakHoursPerDay: 8,
        weekdayOffPeakConcurrentUsers: 100,
        weekdayPeakConcurrentUsers: 100,
        weekendDaysCount: 2,
        weekendPeakHoursPerDay: 4,
        weekendOffPeakConcurrentUsers: 100,
        weekendPeakConcurrentUsers: 100
      };
      
      // Calculate user license costs - only apply if using included license model
      let userLicenseCost = 0;
      // For the CSV sample provided, license cost is 0 because it's BYOL
      if (apiLicense === "Included") {
        userLicenseCost = LICENSE_COST_PER_USER * userCount;
      }
      
      // For percentages, we need to convert from 0-100 to decimal 0-1
      // But it appears the input values are already actual user counts for the CSV example
      const weekdayPeakConcurrentUsers = Math.max(1, Math.floor((usagePattern.weekdayPeakConcurrentUsers / 100) * userCount));
      const weekdayOffPeakConcurrentUsers = Math.max(1, Math.floor((usagePattern.weekdayOffPeakConcurrentUsers / 100) * userCount));
      const weekendPeakConcurrentUsers = Math.max(1, Math.floor((usagePattern.weekendPeakConcurrentUsers / 100) * userCount));
      const weekendOffPeakConcurrentUsers = Math.max(1, Math.floor((usagePattern.weekendOffPeakConcurrentUsers / 100) * userCount));
      
      console.log(`Concurrent users: Weekday peak=${weekdayPeakConcurrentUsers}, off-peak=${weekdayOffPeakConcurrentUsers}, Weekend peak=${weekendPeakConcurrentUsers}, off-peak=${weekendOffPeakConcurrentUsers}`);
      
      // WEEKDAY CALCULATIONS
      // Peak hours per month (weekday)
      const weekdayPeakHoursPerMonth = usagePattern.weekdayDaysCount * usagePattern.weekdayPeakHoursPerDay * WEEKS_PER_MONTH;
      // Total weekday hours per month
      const weekdayTotalHoursPerMonth = usagePattern.weekdayDaysCount * 24 * WEEKS_PER_MONTH;
      // Off-peak hours per month (weekday)
      const weekdayOffPeakHoursPerMonth = weekdayTotalHoursPerMonth - weekdayPeakHoursPerMonth;
      
      console.log(`Weekday hours: peak=${weekdayPeakHoursPerMonth}, off-peak=${weekdayOffPeakHoursPerMonth}, total=${weekdayTotalHoursPerMonth}`);
      
      // Calculate utilized instance hours (weekday) - users * hours
      const weekdayPeakInstanceHours = weekdayPeakConcurrentUsers * weekdayPeakHoursPerMonth;
      const weekdayOffPeakInstanceHours = weekdayOffPeakConcurrentUsers * weekdayOffPeakHoursPerMonth;
      const weekdayTotalUtilizedHours = weekdayPeakInstanceHours + weekdayOffPeakInstanceHours;
      
      console.log(`Weekday instance hours: peak=${weekdayPeakInstanceHours}, off-peak=${weekdayOffPeakInstanceHours}, total=${weekdayTotalUtilizedHours}`);
      
      // Calculate buffer instance hours (weekday)
      const weekdayPeakBufferInstances = Math.ceil(weekdayPeakConcurrentUsers * BUFFER_FACTOR);
      const weekdayOffPeakBufferInstances = Math.ceil(weekdayOffPeakConcurrentUsers * BUFFER_FACTOR);
      const weekdayPeakBufferHours = weekdayPeakBufferInstances * weekdayPeakHoursPerMonth;
      const weekdayOffPeakBufferHours = weekdayOffPeakBufferInstances * weekdayOffPeakHoursPerMonth;
      const weekdayTotalBufferHours = weekdayPeakBufferHours + weekdayOffPeakBufferHours;
      
      console.log(`Weekday buffer: peak=${weekdayPeakBufferHours}, off-peak=${weekdayOffPeakBufferHours}, total=${weekdayTotalBufferHours}`);
      
      // WEEKEND CALCULATIONS
      // Peak hours per month (weekend)
      const weekendPeakHoursPerMonth = usagePattern.weekendDaysCount * usagePattern.weekendPeakHoursPerDay * WEEKS_PER_MONTH;
      // Total weekend hours per month
      const weekendTotalHoursPerMonth = usagePattern.weekendDaysCount * 24 * WEEKS_PER_MONTH;
      // Off-peak hours per month (weekend)
      const weekendOffPeakHoursPerMonth = weekendTotalHoursPerMonth - weekendPeakHoursPerMonth;
      
      console.log(`Weekend hours: peak=${weekendPeakHoursPerMonth}, off-peak=${weekendOffPeakHoursPerMonth}, total=${weekendTotalHoursPerMonth}`);
      
      // Calculate utilized instance hours (weekend)
      const weekendPeakInstanceHours = weekendPeakConcurrentUsers * weekendPeakHoursPerMonth;
      const weekendOffPeakInstanceHours = weekendOffPeakConcurrentUsers * weekendOffPeakHoursPerMonth;
      const weekendTotalUtilizedHours = weekendPeakInstanceHours + weekendOffPeakInstanceHours;
      
      console.log(`Weekend instance hours: peak=${weekendPeakInstanceHours}, off-peak=${weekendOffPeakInstanceHours}, total=${weekendTotalUtilizedHours}`);
      
      // Calculate buffer instance hours (weekend)
      const weekendPeakBufferInstances = Math.ceil(weekendPeakConcurrentUsers * BUFFER_FACTOR);
      const weekendOffPeakBufferInstances = Math.ceil(weekendOffPeakConcurrentUsers * BUFFER_FACTOR);
      const weekendPeakBufferHours = weekendPeakBufferInstances * weekendPeakHoursPerMonth;
      const weekendOffPeakBufferHours = weekendOffPeakBufferInstances * weekendOffPeakHoursPerMonth;
      const weekendTotalBufferHours = weekendPeakBufferHours + weekendOffPeakBufferHours;
      
      console.log(`Weekend buffer: peak=${weekendPeakBufferHours}, off-peak=${weekendOffPeakBufferHours}, total=${weekendTotalBufferHours}`);
      
      // TOTAL CALCULATIONS
      // Total utilized hours
      const totalUtilizedHours = weekdayTotalUtilizedHours + weekendTotalUtilizedHours;
      // Total buffer hours
      const totalBufferHours = weekdayTotalBufferHours + weekendTotalBufferHours;
      // Total instance hours
      const totalInstanceHours = totalUtilizedHours + totalBufferHours;
      
      console.log(`Total hours: utilized=${totalUtilizedHours}, buffer=${totalBufferHours}, total=${totalInstanceHours}`);
      
      // Calculate costs
      // Active streaming cost
      const activeStreamingCost = totalUtilizedHours * streamingRatePerHour;
      // Stopped instances cost (buffer)
      const stoppedInstanceCost = totalBufferHours * STOPPED_INSTANCE_RATE;
      // Total instance cost
      const totalInstanceCost = activeStreamingCost + stoppedInstanceCost;
      // Total monthly cost
      const totalMonthlyCost = userLicenseCost + totalInstanceCost;
      
      console.log(`Pool calculation results:
        User license cost: ${userLicenseCost.toFixed(2)}
        Active streaming cost: ${activeStreamingCost.toFixed(2)} (${totalUtilizedHours} hrs @ $${streamingRatePerHour}/hr)
        Stopped instance cost: ${stoppedInstanceCost.toFixed(2)} (${totalBufferHours} hrs @ $${STOPPED_INSTANCE_RATE}/hr)
        Total instance cost: ${totalInstanceCost.toFixed(2)}
        Total monthly cost: ${totalMonthlyCost.toFixed(2)}
        Total instance hours: ${totalInstanceHours}
      `);
      
      // Round to 2 decimal places for consistent display
      const roundedTotalMonthlyCost = Math.round(totalMonthlyCost * 100) / 100;
      
      return NextResponse.json({
        costPerWorkspace: roundedTotalMonthlyCost / userCount,
        totalMonthlyCost: roundedTotalMonthlyCost,
        annualEstimate: roundedTotalMonthlyCost * 12,
        bundleName: bundleName,
        billingModel: "Hourly",
        baseCost: baseCost, // Keep original hourly base cost for reference
        license: apiLicense,
        pricingSource: pricingSource,
        rootVolume: parseInt(selectedRootVolume?.replace(/\s*GB$/i, '') || "80", 10),
        userVolume: parseInt(selectedUserVolume?.replace(/\s*GB$/i, '') || "100", 10),
        // For pools, we always honor what the API gives us since users don't select volumes
        volumeSelectionHonored: true,
        poolPricingDetails: {
          userLicenseCost,
          activeStreamingCost,
          stoppedInstanceCost,
          hourlyStreamingRate: streamingRatePerHour,
          stoppedInstanceRate: STOPPED_INSTANCE_RATE,
          totalInstanceHours,
          totalUtilizedHours,
          totalBufferHours,
          // Weekday details
          weekdayPeakHours: weekdayPeakHoursPerMonth,
          weekdayOffPeakHours: weekdayOffPeakHoursPerMonth,
          weekdayUtilizedHours: weekdayTotalUtilizedHours,
          weekdayBufferHours: weekdayTotalBufferHours,
          // Weekend details
          weekendPeakHours: weekendPeakHoursPerMonth,
          weekendOffPeakHours: weekendOffPeakHoursPerMonth,
          weekendUtilizedHours: weekendTotalUtilizedHours,
          weekendBufferHours: weekendTotalBufferHours,
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
    
    // Track if the volume selections were honored
    const volumeSelectionHonored = 
      selectedRootVolume === `${config.rootVolume} GB` && 
      selectedUserVolume === `${config.userVolume} GB`;
      
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
      volumeSelectionHonored: isRootVolumeValid && isUserVolumeValid,
    });
    
    // Log the final cost summary
    console.log(`Cost Summary - Workspace: ${formatPriceForDisplay(costPerWorkspace)}, Total: ${formatPriceForDisplay(totalMonthlyCost)}, Annual: ${formatPriceForDisplay(annualEstimate)}`);
  } catch (error) {
    console.error("Error calculating pricing:", error);
    return NextResponse.json({ error: "Failed to calculate pricing" }, { status: 500 });
  }
}

