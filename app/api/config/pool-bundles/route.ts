import { NextResponse } from "next/server"
import { formatPriceForStorage, formatPriceForDisplay, formatHourlyPriceForDisplay } from "@/lib/price-formatter"
import { getRegionLabel } from '@/lib/utils';

// Define a helper function to fetch data from AWS public pricing API
async function fetchAwsPricingData(url: string, errorMessage: string) {
  try {
    console.log(`[Pool API] Fetching from: ${url}`);
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

// Function to extract pool bundle specs from the selectors
function extractPoolBundleSpecs(selectors: any) {
  return {
    type: selectors.Bundle,
    vCPU: parseInt(selectors.vCPU, 10),
    memory: parseInt(selectors.Memory.replace(' GB', ''), 10),
    storage: parseInt(selectors.rootVolume.replace(' GB', ''), 10),
    graphics: selectors.Bundle.includes('Graphics') ? "High Performance" : "Standard",
    gpu: selectors.Bundle.includes('Graphics'),
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
    
    console.log(`[Pool API] Processing request for region: ${region}`);
    
    // Fetch bundle information for the specified region
    let bundles = [];
    let operatingSystems = [];
    let licenseOptions = [];
    
    try {
      // Get the formatted region name
      const regionName = getRegionLabel(region);
      
      // URL encode the region name for the API call
      const encodedRegion = encodeURIComponent(regionName);
      console.log(`[Pool API] Fetching pool bundles for region: ${regionName}, encoded as: ${encodedRegion}`);
      
      const bundlesResponse = await fetchAwsPricingData(
        `https://calculator.aws/pricing/2.0/meteredUnitMaps/workspaces/USD/current/workspaces-pools-calc/${encodedRegion}/primary-selector-aggregations.json`,
        `Failed to fetch WorkSpaces Pool bundles for region: ${regionName}`
      );
      
      if (bundlesResponse && bundlesResponse.aggregations) {
        // Extract unique bundle configurations and options
        const uniqueBundleConfigs = new Map();
        const uniqueOS = new Set();
        const uniqueLicenses = new Set();
        const bundleConfigs = []; // Store full configurations for price lookup
        
        // Process each bundle in the response
        bundlesResponse.aggregations.forEach(item => {
          if (item.selectors) {
            const bundleType = item.selectors.Bundle;
            const vCPU = item.selectors.vCPU;
            const memory = item.selectors.Memory;
            const bundleKey = `${bundleType}-${vCPU}-${memory}`;
            
            // Save unique bundle configuration
            if (!uniqueBundleConfigs.has(bundleKey)) {
              uniqueBundleConfigs.set(bundleKey, item.selectors);
              bundleConfigs.push(item.selectors); // Save for price lookup
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
            const bundleKey = `${config.Bundle}-${config.vCPU}-${config.Memory}`;
            
            // If we've already priced this bundle, skip
            if (bundlePrices.has(bundleKey)) continue;
            
            // We'll fetch pricing for both license types to compare
            const licenseTypes = ["Included", "Bring Your Own License"];
            const pricingByLicense = {};
            
            // Fetch pricing for each license type
            for (const licenseType of licenseTypes) {
              // Construct the pricing URL to get actual prices
              const urlParams = [
                encodedRegion,
                encodeURIComponent(config.Bundle),
                encodeURIComponent(config.vCPU),
                encodeURIComponent(config.rootVolume),
                encodeURIComponent(config.Memory),
                encodeURIComponent(config["Operating System"]),
                encodeURIComponent(licenseType), // Use the specific license type we're checking
                encodeURIComponent(config["Running Mode"]),
                encodeURIComponent(config["Product Family"])
              ];
              
              const pricingUrl = `https://calculator.aws/pricing/2.0/meteredUnitMaps/workspaces/USD/current/workspaces-pools-calc/${urlParams.join('/')}/index.json`;
              
              console.log(`[Pool API] Fetching pricing for ${licenseType} from URL: ${pricingUrl}`);
              
              try {
                const pricingData = await fetchAwsPricingData(
                  pricingUrl,
                  `Failed to fetch pricing for ${bundleKey} with license ${licenseType} in ${regionName}`
                );
                
                if (pricingData && pricingData.regions && pricingData.regions[regionName]) {
                  // Process the pricing data for this bundle
                  const regionData = pricingData.regions[regionName];
                  let hourlyRate = 0;
                  let unit = "";
                  
                  // Extract hourly rate from the first pricing object
                  for (const [priceKey, priceInfo] of Object.entries(regionData)) {
                    const info = priceInfo as any;
                    hourlyRate = parseFloat(info.price);
                    unit = info.Unit || "hour";
                    
                    // We only need the first price point
                    break;
                  }
                  
                  // Calculate monthly cost (assuming 730 hours per month - AWS standard)
                  const monthlyRate = hourlyRate * 730;
                  
                  // Store the pricing information by license type
                  pricingByLicense[licenseType] = {
                    hourlyRate: hourlyRate,
                    monthlyRate: monthlyRate,
                    unit: unit,
                  };
                  
                  console.log(`[Pool API] Fetched ${licenseType} price for ${bundleKey}: $${hourlyRate}/hr, $${monthlyRate.toFixed(2)}/mo`);
                }
              } catch (error) {
                console.error(`[Pool API] Error fetching ${licenseType} price for bundle ${config.Bundle}:`, error);
                // Continue with next license type
              }
            }
            
            // Store all pricing data for this bundle, with both license types if available
            bundlePrices.set(bundleKey, {
              ...pricingByLicense,
              // For backward compatibility, use included license rates as the default
              hourlyRate: pricingByLicense["Included"]?.hourlyRate || pricingByLicense["Bring Your Own License"]?.hourlyRate || 0,
              monthlyRate: pricingByLicense["Included"]?.monthlyRate || pricingByLicense["Bring Your Own License"]?.monthlyRate || 0,
              unit: pricingByLicense["Included"]?.unit || pricingByLicense["Bring Your Own License"]?.unit || "hour",
              config: {
                ...config,
                region: regionName
              }
            });
          } catch (error) {
            console.error(`[Pool API] Error fetching price for bundle ${config.Bundle}:`, error);
            // Continue with next bundle
          }
        }
        
        // Debug output to verify pricing
        console.log("[Pool API] All bundle prices with license variations:");
        bundlePrices.forEach((price, bundleKey) => {
          console.log(`${bundleKey}:`);
          console.log(`  Included: ${price["Included"]?.hourlyRate || 'N/A'}/hr, ${price["Included"]?.monthlyRate?.toFixed(2) || 'N/A'}/mo`);
          console.log(`  BYOL: ${price["Bring Your Own License"]?.hourlyRate || 'N/A'}/hr, ${price["Bring Your Own License"]?.monthlyRate?.toFixed(2) || 'N/A'}/mo`);
        });
        
        // Convert bundle data to our format with actual prices
        bundles = Array.from(uniqueBundleConfigs.values()).map(selectors => {
          const bundleSpecs = extractPoolBundleSpecs(selectors);
          const bundleId = `pool-${bundleSpecs.type.toLowerCase().replace(/\./g, '-')}`;
          const displayName = `${bundleSpecs.type} (${bundleSpecs.vCPU} vCPU, ${bundleSpecs.memory}GB)`;
          const bundleKey = `${selectors.Bundle}-${selectors.vCPU}-${selectors.Memory}`;
          
          // Get price data for this bundle
          const priceData = bundlePrices.get(bundleKey);
          
          // For each bundle, we'll now store pricing for both license types
          const byolPricing = priceData && priceData["Bring Your Own License"];
          const includedPricing = priceData && priceData["Included"];
          
          // Use fallback pricing if API pricing not available
          const fallbackIncludedPrice = getPoolBundlePrice(bundleSpecs, "included");
          const fallbackByolPrice = getPoolBundlePrice(bundleSpecs, "bring-your-own-license");
          
          // Store the base pricing (default to included license)
          const hourlyRate = includedPricing?.hourlyRate || (priceData?.hourlyRate || fallbackIncludedPrice / 730);
          const monthlyRate = includedPricing?.monthlyRate || (priceData?.monthlyRate || fallbackIncludedPrice);
          
          // Store the BYOL pricing separately
          const byolHourlyRate = byolPricing?.hourlyRate || fallbackByolPrice / 730;
          const byolMonthlyRate = byolPricing?.monthlyRate || fallbackByolPrice;
          
          // Ensure consistent price formatting
          const formattedMonthlyPrice = formatPriceForStorage(monthlyRate);
          const formattedByolMonthlyPrice = formatPriceForStorage(byolMonthlyRate);
          
          return {
            id: bundleId,
            name: displayName,
            price: formattedMonthlyPrice,
            rawPrice: monthlyRate,
            hourlyPrice: hourlyRate,
            displayPrice: formatPriceForDisplay(formattedMonthlyPrice),
            displayHourlyPrice: formatHourlyPriceForDisplay(hourlyRate),
            specs: bundleSpecs,
            type: "pool",
            pricingSource: priceData ? "aws-api" : "estimated",
            pricingUnit: priceData?.unit || "hour",
            selectors: selectors,
            // Add license-specific pricing
            licensePricing: {
              included: {
                hourlyRate: hourlyRate,
                monthlyRate: formattedMonthlyPrice,
                displayPrice: formatPriceForDisplay(formattedMonthlyPrice),
                displayHourlyPrice: formatHourlyPriceForDisplay(hourlyRate)
              },
              byol: {
                hourlyRate: byolHourlyRate,
                monthlyRate: formattedByolMonthlyPrice,
                displayPrice: formatPriceForDisplay(formattedByolMonthlyPrice),
                displayHourlyPrice: formatHourlyPriceForDisplay(byolHourlyRate)
              }
            }
          };
        });
        
        // Sort bundles by vCPU and then memory
        bundles.sort((a, b) => {
          if (a.specs.vCPU !== b.specs.vCPU) {
            return a.specs.vCPU - b.specs.vCPU;
          }
          return a.specs.memory - b.specs.memory;
        });
        
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
      }
    } catch (error) {
      console.error(`[Pool API] Error parsing pool bundles for region ${region}:`, error);
    }

    // If no bundles were extracted, return an error instead of fallbacks
    // This forces the client to handle the error properly
    if (bundles.length === 0) {
      return NextResponse.json({ 
        error: `No pool bundles found for region: ${region}` 
      }, { status: 404 });
    }

    // Return the bundle data
    return NextResponse.json({
      bundles,
      operatingSystems,
      licenseOptions,
      region,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error("[Pool API] Error fetching pool bundle options:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ 
      error: `Failed to fetch pool bundle options: ${errorMessage}` 
    }, { status: 500 });
  }
}

// Helper function to estimate pool bundle pricing (fallback only)
function getPoolBundlePrice(specs: any, license: string = "included"): number {
  // Pool pricing is typically higher than Core pricing
  // This is a simplified model based on specs
  let basePrice = 0;
  
  if (specs.gpu) {
    // Graphics bundles
    if (specs.vCPU >= 16) {
      basePrice = 450; // GraphicsPro
    } else {
      basePrice = 300; // Graphics
    }
  } else {
    // Standard bundles
    if (specs.vCPU <= 1) {
      basePrice = 54.75; // Value (0.075/hr * 730)
    } else if (specs.vCPU <= 2 && specs.memory <= 4) {
      basePrice = 87.60; // Standard (0.12/hr * 730)
    } else if (specs.vCPU <= 2) {
      basePrice = 131.40; // Performance (0.18/hr * 730)
    } else if (specs.vCPU <= 4) {
      basePrice = 182.50; // Power (0.25/hr * 730)
    } else {
      basePrice = 255.50; // PowerPro (0.35/hr * 730)
    }
  }
  
  // Apply license discount for BYOL
  if (license === "bring-your-own-license") {
    basePrice *= 0.85; // Apply 15% discount for BYOL
  }
  
  return basePrice;
}
