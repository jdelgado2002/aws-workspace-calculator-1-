import { NextResponse } from "next/server"
import { getRegionLabel } from '@/lib/utils';

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

// Function to extract bundle specs from the bundle description
function extractBundleSpecs(bundleDescription: string) {
  // Regular expression to parse the bundle description
  const regex = /^([\w\.]+) \((\d+) vCPU, (\d+)GB RAM(?:, (\d+) GPU, (\d+)GB Video Memory)?\)$/;
  const match = bundleDescription.match(regex);
  
  if (!match) {
    return {
      type: bundleDescription,
      vCPU: 2,
      memory: 8,
      storage: 80,
      graphics: "Standard",
    };
  }
  
  const hasGPU = match[4] !== undefined;
  
  return {
    type: match[1],
    vCPU: parseInt(match[2], 10),
    memory: parseInt(match[3], 10),
    storage: 80, // Default, will be updated with actual volumes
    graphics: hasGPU ? "High Performance" : "Standard",
    ...(hasGPU && { gpu: true, gpuCount: parseInt(match[4], 10), videoMemory: parseInt(match[5], 10) }),
  };
}

export async function GET() {
  try {
    // Fetch WorkSpaces Core metadata to get accurate region information
    let regions = [];
    let defaultRegion = "US West (Oregon)"; // Default region to use
    
    try {
      const metadataResponse = await fetchAwsPricingData(
        'https://calculator.aws/pricing/2.0/meteredUnitMaps/workspaces/USD/current/workspaces-core-calc/metadata.json',
        'Failed to fetch WorkSpaces Core metadata'
      );
      
      // Extract region information from the metadata
      if (metadataResponse && metadataResponse.valueAttributes && metadataResponse.valueAttributes.Location) {
        regions = metadataResponse.valueAttributes.Location.map(regionName => {
          // Create a mapping from AWS region name to region code
          let value = "";
          
          if (regionName.includes("GovCloud")) {
            value = regionName.includes("US-East") ? "us-gov-east-1" : "us-gov-west-1";
          } else if (regionName.includes("US East")) {
            value = "us-east-1";
          } else if (regionName.includes("US West")) {
            value = "us-west-2";
          } else if (regionName.includes("EU (Ireland)")) {
            value = "eu-west-1";
          } else if (regionName.includes("EU (London)")) {
            value = "eu-west-2";
          } else if (regionName.includes("EU (Frankfurt)")) {
            value = "eu-central-1";
          } else if (regionName.includes("Asia Pacific (Tokyo)")) {
            value = "ap-northeast-1";
          } else if (regionName.includes("Asia Pacific (Seoul)")) {
            value = "ap-northeast-2";
          } else if (regionName.includes("Asia Pacific (Mumbai)")) {
            value = "ap-south-1";
          } else if (regionName.includes("Asia Pacific (Singapore)")) {
            value = "ap-southeast-1";
          } else if (regionName.includes("Asia Pacific (Sydney)")) {
            value = "ap-southeast-2";
          } else if (regionName.includes("Canada")) {
            value = "ca-central-1";
          } else if (regionName.includes("South America")) {
            value = "sa-east-1";
          } else if (regionName.includes("Israel")) {
            value = "il-central-1";
          } else {
            // For any unrecognized region, create a slug version of the name
            value = regionName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '');
          }
          
          return {
            value, // Our internal region code
            label: regionName,
            originalName: regionName // Keep the exact original name for API calls
          };
        });
        
        // Set default region to the first one in the list
        if (regions.length > 0) {
          defaultRegion = regions[0].originalName;
        }
      }
    } catch (error) {
      console.error("Error fetching regions from metadata:", error);
      // Fall back to default regions with proper original names
      regions = [
        { value: "us-east-1", label: getRegionLabel("us-east-1"), originalName: getRegionLabel("us-east-1") },
        { value: "us-west-2", label: getRegionLabel("us-west-2"), originalName: getRegionLabel("us-west-2") },
        { value: "eu-west-1", label: getRegionLabel("eu-west-1"), originalName: getRegionLabel("eu-west-1") },
        { value: "ap-northeast-1", label: getRegionLabel("ap-northeast-1"), originalName: getRegionLabel("ap-northeast-1") },
        { value: "ap-southeast-2", label: getRegionLabel("ap-southeast-2"), originalName: getRegionLabel("ap-southeast-2") },
      ];
    }

    // Fetch bundle information for the default region
    let bundles = [];
    let rootVolumeOptions = [];
    let userVolumeOptions = [];
    let operatingSystems = [];
    let licenseOptions = [];
    
    try {
      // URL encode the region name for the API call - use originalName
      const encodedRegion = encodeURIComponent(defaultRegion);
      console.log(`Fetching bundles for region: ${defaultRegion}, encoded as: ${encodedRegion}`);
      
      const bundlesResponse = await fetchAwsPricingData(
        `https://calculator.aws/pricing/2.0/meteredUnitMaps/workspaces/USD/current/workspaces-core-calc/${encodedRegion}/primary-selector-aggregations.json`,
        'Failed to fetch WorkSpaces bundles'
      );
      
      if (bundlesResponse && bundlesResponse.aggregations) {
        // Extract unique bundle descriptions and create a map of bundle configurations
        const uniqueBundles = new Set();
        const uniqueRootVolumes = new Set();
        const uniqueUserVolumes = new Set();
        const uniqueOS = new Set();
        const uniqueLicenses = new Set();
        const bundleConfigs = []; // Store full configurations for price lookup
        
        // Log aggregation data for debugging
        console.log(`Found ${bundlesResponse.aggregations.length} configurations for region ${defaultRegion}`);
        
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
        
        // Log the unique values found for debugging
        console.log(`Found unique volume options - Root: ${Array.from(uniqueRootVolumes).join(', ')}, User: ${Array.from(uniqueUserVolumes).join(', ')}`);
        
        // Fetch actual prices for bundles from AWS API
        const bundlePrices = new Map(); // Map to store bundle prices
        
        // Fetch prices for each unique bundle configuration
        for (const config of bundleConfigs) {
          try {
            const bundleDesc = config["Bundle Description"];
            
            // If we've already priced this bundle, skip
            if (bundlePrices.has(bundleDesc)) continue;
            
            // Use the actual values from the API response
            const rootVol = config.rootVolume;
            const userVol = config.userVolume;
            
            // Construct the pricing URL to get actual prices
            const urlParams = [
              encodedRegion,
              encodeURIComponent(config["Bundle Description"]),
              encodeURIComponent(rootVol),
              encodeURIComponent(userVol),
              encodeURIComponent(config["Operating System"]),
              encodeURIComponent(config.License),
              encodeURIComponent(config["Running Mode"]),
              encodeURIComponent(config["Product Family"])
            ];
            
            const pricingUrl = `https://calculator.aws/pricing/2.0/meteredUnitMaps/workspaces/USD/current/workspaces-core-calc/${urlParams.join('/')}/index.json`;
            
            // Log the full URL so we can verify it's correct
            console.log(`Fetching pricing from URL: ${pricingUrl}`);
            
            const pricingData = await fetchAwsPricingData(
              pricingUrl,
              `Failed to fetch pricing for ${bundleDesc} in ${defaultRegion}`
            );
            
            if (pricingData && pricingData.regions && pricingData.regions[defaultRegion]) {
              // Calculate total price for this bundle
              const regionData = pricingData.regions[defaultRegion];
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
              
              // Store the price for this bundle
              bundlePrices.set(bundleDesc, {
                alwaysOn: totalPrice,
                autoStop: hourlyPrice,
                // Calculate hourly cost for AutoStop
                autoStopMonthly: hourlyPrice * 160, // Assuming 160 hours per month
                // Add config info for debugging
                config: {
                  rootVolume: config.rootVolume,
                  userVolume: config.userVolume,
                  operatingSystem: config["Operating System"],
                  license: config.License,
                  runningMode: config["Running Mode"],
                }
              });
              
              console.log(`Fetched real price for ${bundleDesc}: AlwaysOn=$${totalPrice}, AutoStop=$${hourlyPrice}/hr`);
            }
          } catch (error) {
            console.error(`Error fetching price for bundle ${config["Bundle Description"]}:`, error);
            // Continue with next bundle
          }
        }
        
        // Debug output to verify pricing
        console.log("All bundle prices:");
        bundlePrices.forEach((price, bundleDesc) => {
          console.log(`${bundleDesc}: $${price.alwaysOn}/mo, $${price.autoStop}/hr`);
        });
        
        // Convert bundle descriptions to our bundle format with real prices
        bundles = Array.from(uniqueBundles).map(description => {
          const bundleSpecs = extractBundleSpecs(description as string);
          const bundleId = bundleSpecs.type.toLowerCase().replace(/\./g, '-');
          
          // Get real prices if available, or use fallback
          const priceData = bundlePrices.get(description as string);
          
          // Important: use the EXACT price from the API, with no rounding or formatting
          // to ensure consistency
          const price = priceData ? priceData.alwaysOn : getFallbackPrice(bundleSpecs, "AlwaysOn");
          const hourlyPrice = priceData ? priceData.autoStop : getFallbackPrice(bundleSpecs, "AutoStop") / 160;
          const autoStopMonthlyPrice = priceData ? priceData.autoStopMonthly : getFallbackPrice(bundleSpecs, "AutoStop");
          
          return {
            id: bundleId,
            name: description as string,
            price: price, // Store exact price
            displayPrice: `$${price.toFixed(2)}/mo`, // Format for display
            hourlyPrice: hourlyPrice,
            displayHourlyPrice: `$${hourlyPrice.toFixed(3)}/hr`,
            autoStopMonthlyPrice: autoStopMonthlyPrice,
            specs: bundleSpecs,
            pricingSource: priceData ? "aws-api" : "estimated",
            // Include the config used for this price
            pricingConfig: priceData ? priceData.config : null,
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
        
        // Convert OS options to dropdown format - filter out "Any" which is a license type, not an OS
        operatingSystems = Array.from(uniqueOS)
          .filter(os => os !== "Any") // Filter out "Any" as it's not a real OS
          .map(os => ({
            value: (os as string).toLowerCase(),
            label: os as string,
          }));
        
        // Make sure the licenseOptions array includes the BYOL option derived from "Any" OS
        if (uniqueOS.has("Any") && !Array.from(uniqueLicenses).some(license => license === "Bring Your Own License")) {
          licenseOptions.push({
            value: "bring-your-own-license",
            label: "Bring Your Own License (BYOL)",
          });
        }
        
        // Convert license options to dropdown format
        licenseOptions = Array.from(uniqueLicenses).map(license => ({
          value: (license as string).toLowerCase().replace(/\s+/g, '-'),
          label: license as string,
        }));
      }
    } catch (error) {
      console.error("Error parsing bundles:", error);
    }

    // If no bundles were extracted, use fallback bundles
    if (bundles.length === 0) {
      console.log("No bundles found, using fallbacks");
      // Use generic fallbacks that will work with most regions
      bundles = [
        {
          id: "value",
          name: "Value (1 vCPU, 2GB RAM)",
          price: 21,
          hourlyPrice: 0.26,
          specs: {
            type: "Value",
            vCPU: 1,
            memory: 2,
            storage: 90, // Generic value (80+10)
            graphics: "Standard",
          },
        },
        {
          id: "standard",
          name: "Standard (2 vCPU, 4GB RAM)",
          price: 35,
          hourlyPrice: 0.43,
          specs: {
            type: "Standard",
            vCPU: 2,
            memory: 4,
            storage: 130, // Generic value (80+50)
            graphics: "Standard",
          },
        },
        {
          id: "performance",
          name: "Performance (2 vCPU, 8GB RAM)",
          price: 60,
          hourlyPrice: 0.57,
          specs: {
            type: "Performance",
            vCPU: 2,
            memory: 8,
            storage: 180, // Generic value (80+100)
            graphics: "Standard",
          },
        },
        {
          id: "power",
          name: "Power (4 vCPU, 16GB RAM)",
          price: 80,
          hourlyPrice: 0.82,
          specs: {
            type: "Power",
            vCPU: 4,
            memory: 16,
            storage: 180, // Generic value (80+100)
            graphics: "High Performance",
          },
        },
      ];
    }

    // If no root volume options were extracted, use generic fallback options
    if (rootVolumeOptions.length === 0) {
      console.log("No root volume options found, using fallbacks");
      rootVolumeOptions = [
        { value: "80", label: "80 GB" },
        { value: "175", label: "175 GB" },
      ];
    }

    // If no user volume options were extracted, use generic fallback options
    if (userVolumeOptions.length === 0) {
      console.log("No user volume options found, using fallbacks");
      userVolumeOptions = [
        { value: "10", label: "10 GB" },
        { value: "50", label: "50 GB" },
        { value: "100", label: "100 GB" },
      ];
    }

    // If no operating systems were extracted, use fallback options
    if (operatingSystems.length === 0) {
      operatingSystems = [
        { value: "windows", label: "Windows" },
        { value: "amazon-linux", label: "Amazon Linux" },
        { value: "ubuntu", label: "Ubuntu" },
      ];
    }

    // If no license options were extracted, use fallback options
    if (licenseOptions.length === 0) {
      licenseOptions = [
        { value: "included", label: "Included" },
        { value: "byol", label: "Bring Your Own License" },
      ];
    }

    // Extract running modes
    const runningModes = [
      { value: "always-on", label: "AlwaysOn" },
      { value: "auto-stop", label: "AutoStop" },
    ];

    // Extract billing options
    const billingOptions = [
      { value: "monthly", label: "Monthly" },
      { value: "hourly", label: "Hourly" },
    ];

    return NextResponse.json({
      regions,
      bundles,
      operatingSystems,
      runningModes,
      billingOptions,
      storage: {
        rootVolume: rootVolumeOptions,
        userVolume: userVolumeOptions,
      },
      licenseOptions,
      apiSource: "AWS Public Pricing API",
    });
  } catch (error) {
    console.error("Error fetching configuration options:", error);

    // Return a friendly error message
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json({ error: `Failed to fetch configuration options: ${errorMessage}` }, { status: 500 });
  }
}

// Fallback function for price estimation when API pricing is unavailable
function getFallbackPrice(specs: any, runningMode: string) {
  if (runningMode === "AutoStop") {
    // For AutoStop, we calculate hourly rates but return a monthly estimate
    // based on typical usage patterns (e.g., 160 hours per month)
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
    
    return Math.round(baseHourlyRate * 160); // Assume 160 hours of usage per month
  } else {
    // For AlwaysOn, we use a monthly rate
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

