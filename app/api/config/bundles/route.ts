import { NextResponse } from "next/server"
import { formatPriceForStorage, formatPriceForDisplay, formatHourlyPriceForDisplay } from "@/lib/price-formatter"

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

// Define a direct storage parsing function that we can use in multiple places
function parseStorageSize(volumeString?: string): number {
  if (!volumeString) return 0;
  
  // Extract just the numbers from the string (e.g., "100 GB" -> 100)
  const numMatch = volumeString.match(/(\d+)/);
  return numMatch ? parseInt(numMatch[1], 10) : 0;
}

// Function to extract bundle specs from the bundle description
function extractBundleSpecs(bundleDescription: string, rootVolume?: string, userVolume?: string) {
  // Regular expression to parse the bundle description
  const regex = /^([\w\.]+) \((\d+) vCPU, (\d+)GB RAM(?:, (\d+) GPU, (\d+)GB Video Memory)?\)$/;
  const match = bundleDescription.match(regex);
  
  // Directly calculate total storage - simplify the parsing to make it more robust
  let rootSize = 0;
  let userSize = 0;
  
  // Parse root volume
  if (rootVolume) {
    rootSize = parseStorageSize(rootVolume);
    console.log(`Root volume: ${rootVolume} -> ${rootSize} GB`);
  }
  
  // Parse user volume
  if (userVolume) {
    userSize = parseStorageSize(userVolume);
    console.log(`User volume: ${userVolume} -> ${userSize} GB`);
  }
  
  // Total storage is the sum, with a fallback
  const totalStorage = (rootSize + userSize) > 0 ? (rootSize + userSize) : 80;
  
  console.log(`FINAL STORAGE for ${bundleDescription}: ${totalStorage} GB (Root: ${rootSize} GB, User: ${userSize} GB)`);
  
  if (!match) {
    return {
      type: bundleDescription,
      vCPU: 2,
      memory: 8,
      storage: totalStorage,
      graphics: "Standard",
    };
  }
  
  const hasGPU = match[4] !== undefined;
  
  return {
    type: match[1],
    vCPU: parseInt(match[2], 10),
    memory: parseInt(match[3], 10),
    storage: totalStorage,
    graphics: hasGPU ? "High Performance" : "Standard",
    ...(hasGPU && { gpu: true, gpuCount: parseInt(match[4], 10), videoMemory: parseInt(match[5], 10) }),
  };
}

export async function GET(request: Request) {
  try {
    // Get region from query parameter
    const { searchParams } = new URL(request.url);
    const region = searchParams.get('region');
    
    if (!region) {
      return NextResponse.json({ error: "Region parameter is required" }, { status: 400 });
    }
    
    // Fetch bundle information for the specified region
    let bundles = [];
    let rootVolumeOptions = [];
    let userVolumeOptions = [];
    let operatingSystems = [];
    let licenseOptions = [];
    
    try {
      // First fetch metadata to get the original region name format
      const metadataResponse = await fetchAwsPricingData(
        'https://calculator.aws/pricing/2.0/meteredUnitMaps/workspaces/USD/current/workspaces-core-calc/metadata.json',
        'Failed to fetch WorkSpaces Core metadata'
      );
      
      // Find the original region name from the metadata or use the provided region as-is
      let regionName = region;
      if (metadataResponse && metadataResponse.valueAttributes && metadataResponse.valueAttributes.Location) {
        // First try to find by exact match to our region codes
        const foundRegion = metadataResponse.valueAttributes.Location.find(name => {
          // Convert both to lowercase for case-insensitive comparison
          return name.toLowerCase() === region.toLowerCase();
        });
        
        if (foundRegion) {
          regionName = foundRegion;
        } else {
          // If no exact match, try to match by parts of the region name
          const possibleMatch = metadataResponse.valueAttributes.Location.find(name => {
            // Create a simplified version of both strings for matching
            const simplifiedName = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
            const simplifiedRegion = region.toLowerCase().replace(/[^a-z0-9]+/g, '');
            
            return simplifiedName.includes(simplifiedRegion) || simplifiedRegion.includes(simplifiedName);
          });
          
          if (possibleMatch) {
            regionName = possibleMatch;
          }
          
          // If all else fails, map common region codes to full names
          if (regionName === region) {
            const regionMap = {
              'us-east-1': 'US East (N. Virginia)',
              'us-west-2': 'US West (Oregon)',
              'eu-west-1': 'EU (Ireland)',
              'ap-northeast-1': 'Asia Pacific (Tokyo)',
              'ap-southeast-2': 'Asia Pacific (Sydney)',
              'us-gov-east-1': 'AWS GovCloud (US-East)',
              'us-gov-west-1': 'AWS GovCloud (US)'
            };
            
            regionName = regionMap[region] || region;
          }
        }
      }
      
      // URL encode the region name for the API call
      const encodedRegion = encodeURIComponent(regionName);
      console.log(`Fetching bundles for region: ${regionName}, encoded as: ${encodedRegion}`);
      
      // Log the region we're using to make it clear in the logs
      console.log(`REGION UPDATE: Fetching bundles specifically for region: ${regionName}`);
      
      const bundlesResponse = await fetchAwsPricingData(
        `https://calculator.aws/pricing/2.0/meteredUnitMaps/workspaces/USD/current/workspaces-core-calc/${encodedRegion}/primary-selector-aggregations.json`,
        `Failed to fetch WorkSpaces bundles for region: ${regionName}`
      );
      
      if (bundlesResponse && bundlesResponse.aggregations) {
        // Extract unique bundle descriptions and store full configs
        const uniqueBundles = new Set();
        const uniqueRootVolumes = new Set();
        const uniqueUserVolumes = new Set();
        const uniqueOS = new Set();
        const uniqueLicenses = new Set();
        const bundleConfigs = []; // Store full configurations for price lookup
        
        bundlesResponse.aggregations.forEach(item => {
          if (item.selectors) {
            // Extract bundle descriptions
            if (item.selectors["Bundle Description"]) {
              uniqueBundles.add(item.selectors["Bundle Description"]);
              bundleConfigs.push(item.selectors); // Save full config for price lookup
            }
            
            // Extract volume options
            if (item.selectors.rootVolume) {
              uniqueRootVolumes.add(item.selectors.rootVolume);
            }
            if (item.selectors.userVolume) {
              uniqueUserVolumes.add(item.selectors.userVolume);
            }
            
            // Extract operating systems
            if (item.selectors["Operating System"]) {
              uniqueOS.add(item.selectors["Operating System"]);
            }
            
            // Extract license options
            if (item.selectors.License) {
              uniqueLicenses.add(item.selectors.License);
            }
          }
        });
        
        // Fetch actual prices for bundles from AWS API
        const bundlePrices = new Map(); // Map to store bundle prices
        
        // Fetch prices for each unique bundle configuration
        for (const config of bundleConfigs) {
          try {
            const bundleDesc = config["Bundle Description"];
            
            // If we've already priced this bundle, skip
            if (bundlePrices.has(bundleDesc)) continue;
            
            // Construct the pricing URL to get actual prices
            const urlParams = [
              encodedRegion,
              encodeURIComponent(config["Bundle Description"]),
              encodeURIComponent(config.rootVolume),
              encodeURIComponent(config.userVolume),
              encodeURIComponent(config["Operating System"]),
              encodeURIComponent(config.License),
              encodeURIComponent(config["Running Mode"]),
              encodeURIComponent(config["Product Family"])
            ];
            
            const pricingUrl = `https://calculator.aws/pricing/2.0/meteredUnitMaps/workspaces/USD/current/workspaces-core-calc/${urlParams.join('/')}/index.json`;
            
            // Log the URL to help troubleshoot pricing issues
            console.log(`Fetching region-specific pricing from URL: ${pricingUrl}`);
            
            const pricingData = await fetchAwsPricingData(
              pricingUrl,
              `Failed to fetch pricing for ${bundleDesc} in ${regionName}`
            );
            
            if (pricingData && pricingData.regions && pricingData.regions[regionName]) {
              // Calculate total price for this bundle
              const regionData = pricingData.regions[regionName];
              let totalPrice = 0;
              let hourlyPrice = 0;
              
              // Extract the pricing information
              for (const [key, priceInfo] of Object.entries(regionData)) {
                const info = priceInfo as any;
                const price = parseFloat(info.price);
                
                // Check if this is hourly or monthly
                if (config["Running Mode"] === "AutoStop") {
                  hourlyPrice += price;
                } else {
                  totalPrice += price;
                }
              }
              
              // Store the price for this bundle along with the region
              bundlePrices.set(bundleDesc, {
                alwaysOn: totalPrice,
                autoStop: hourlyPrice,
                autoStopMonthly: hourlyPrice * 160, 
                config: {
                  rootVolume: config.rootVolume,
                  userVolume: config.userVolume,
                  operatingSystem: config["Operating System"],
                  license: config.License,
                  runningMode: config["Running Mode"],
                  region: regionName // Add region information for debugging
                }
              });
              
              console.log(`Fetched ${regionName} price for ${bundleDesc}: AlwaysOn=$${totalPrice}, AutoStop=$${hourlyPrice}/hr`);
            }
          } catch (error) {
            console.error(`Error fetching price for bundle ${config["Bundle Description"]} in region ${regionName}:`, error);
            // Continue with next bundle
          }
        }
        
        // Debug output to verify pricing for this region
        console.log(`All bundle prices for region ${regionName}:`);
        bundlePrices.forEach((price, bundleDesc) => {
          console.log(`${bundleDesc} in ${regionName}: $${price.alwaysOn}/mo, $${price.autoStop}/hr`);
        });
        
        // Convert bundle descriptions to our bundle format with real prices for this region
        bundles = Array.from(uniqueBundles).map(description => {
          const priceData = bundlePrices.get(description as string);
          
          // Print the full price data for debugging
          console.log(`Price data for ${description}:`, JSON.stringify(priceData));
          
          // Extract the root and user volumes directly from the pricing configuration
          let rootVolume = null;
          let userVolume = null;
          
          if (priceData && priceData.config) {
            rootVolume = priceData.config.rootVolume;
            userVolume = priceData.config.userVolume;
            console.log(`Volume info for ${description}: Root=${rootVolume}, User=${userVolume}`);
          } else {
            console.log(`No config data available for ${description}`);
          }

          // Create bundle specs with volume information
          const bundleSpecs = extractBundleSpecs(
            description as string,
            rootVolume,
            userVolume
          );
          
          // Log the final storage value that will be displayed
          console.log(`STORAGE VALUE for ${description}: ${bundleSpecs.storage} GB`);
          
          const bundleId = bundleSpecs.type.toLowerCase().replace(/\./g, '-');
          
          // Log the resulting specs to confirm storage value
          console.log(`Bundle Specs Debug - ${description as string}:`, {
            storage: bundleSpecs.storage,
            vCPU: bundleSpecs.vCPU,
            memory: bundleSpecs.memory
          });
          
          // Get real prices if available, or use fallback
          const rawPrice = priceData ? priceData.alwaysOn : getFallbackPrice(bundleSpecs, "AlwaysOn");
          const rawHourlyPrice = priceData ? priceData.autoStop : getFallbackPrice(bundleSpecs, "AutoStop") / 160;
          const rawAutoStopMonthlyPrice = priceData ? priceData.autoStopMonthly : getFallbackPrice(bundleSpecs, "AutoStop");
          
          // Format prices consistently using our helper
          const price = formatPriceForStorage(rawPrice);
          const hourlyPrice = parseFloat(rawHourlyPrice.toFixed(3)); // Ensure 3 decimal places for hourly
          const autoStopMonthlyPrice = formatPriceForStorage(rawAutoStopMonthlyPrice);
          
          // Log the pricing for this bundle
          console.log(`Bundle ${bundleId} in ${regionName}: Raw=${rawPrice}, Formatted=${price}, Display=${formatPriceForDisplay(price)}`);
          
          return {
            id: bundleId,
            name: description as string,
            price: price, // Ensure this is EXACTLY what calculations will use
            displayPrice: formatPriceForDisplay(price),
            hourlyPrice: hourlyPrice,
            displayHourlyPrice: formatHourlyPriceForDisplay(hourlyPrice),
            autoStopMonthlyPrice: autoStopMonthlyPrice,
            specs: bundleSpecs,
            pricingSource: priceData ? "aws-api" : "estimated",
            // Include debug information
            region: regionName,
            timestamp: Date.now()
          };
        });
        
        // Sort bundles by vCPU and then memory
        bundles.sort((a, b) => {
          if (a.specs.vCPU !== b.specs.vCPU) {
            return a.specs.vCPU - b.specs.vCPU;
          }
          return a.specs.memory - b.specs.memory;
        });
        
        // Convert volume options to dropdown format
        rootVolumeOptions = Array.from(uniqueRootVolumes).map(volume => ({
          value: (volume as string).replace(/\s+GB$/, ''),
          label: volume as string,
        }));
        
        userVolumeOptions = Array.from(uniqueUserVolumes).map(volume => ({
          value: (volume as string).replace(/\s+GB$/, ''),
          label: volume as string,
        }));
        
        // Convert OS options to dropdown format
        operatingSystems = Array.from(uniqueOS).map(os => ({
          value: (os as string).toLowerCase(),
          label: os as string === "Any" ? "BYOL" : os as string,
        }));
        
        // Convert license options to dropdown format
        licenseOptions = Array.from(uniqueLicenses).map(license => ({
          value: (license as string).toLowerCase().replace(/\s+/g, '-'),
          label: license as string,
        }));
        
        // Add debugging information to response
        console.log(`Returning ${bundles.length} bundles for ${regionName} with timestamps`);
      }
    } catch (error) {
      console.error(`Error parsing bundles for region ${region}:`, error);
    }

    // If no bundles were extracted, return an error
    if (bundles.length === 0) {
      return NextResponse.json({ 
        error: `No bundles found for region: ${region}` 
      }, { status: 404 });
    }

    return NextResponse.json({
      bundles,
      storage: {
        rootVolume: rootVolumeOptions,
        userVolume: userVolumeOptions,
      },
      operatingSystems,
      licenseOptions,
      region,
      timestamp: Date.now() // Add timestamp to help with caching
    });
  } catch (error) {
    console.error("Error fetching bundle options:", error);

    // Return a friendly error message
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json({ 
      error: `Failed to fetch bundle options: ${errorMessage}` 
    }, { status: 500 });
  }
}

// Fallback function for price estimation when API pricing is unavailable
function getFallbackPrice(specs: any, runningMode: string) {
  // Same implementation as in options/route.ts
  if (runningMode === "AutoStop") {
    let baseHourlyRate = 0;
    
    if (specs.gpu) {
      baseHourlyRate = specs.vCPU > 8 ? 1.5 : 0.8;
    } else {
      if (specs.vCPU <= 2) {
        baseHourlyRate = specs.memory <= 4 ? 0.3 : 0.4;
      } else if (specs.vCPU <= 4) {
        baseHourlyRate = 0.6;
      } else {
        baseHourlyRate = 1.0;
      }
    }
    
    return Math.round(baseHourlyRate * 160);
  } else {
    if (specs.gpu) {
      return specs.vCPU > 8 ? 350 : 220;
    } else {
      if (specs.vCPU <= 1) return 21;
      if (specs.vCPU <= 2 && specs.memory <= 4) return 35;
      if (specs.vCPU <= 2) return 60;
      if (specs.vCPU <= 4) return 80;
      if (specs.vCPU <= 8) return 124;
      if (specs.vCPU <= 16) return 250;
      return 500;
    }
  }
}
