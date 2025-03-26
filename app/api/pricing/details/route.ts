import { NextResponse } from "next/server"

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

export async function GET(request: Request) {
  try {
    // Get parameters from query string
    const { searchParams } = new URL(request.url)
    const region = searchParams.get('region')
    const bundleDescription = searchParams.get('bundleDescription')
    const rootVolume = searchParams.get('rootVolume') || '80 GB'
    const userVolume = searchParams.get('userVolume') || '10 GB'
    const operatingSystem = searchParams.get('operatingSystem') || 'Windows'
    const license = searchParams.get('license') || 'Included'
    const runningMode = searchParams.get('runningMode') || 'AlwaysOn'
    
    // Validate required parameters
    if (!region || !bundleDescription) {
      return NextResponse.json({
        error: "Missing required parameters: region and bundleDescription are required"
      }, { status: 400 })
    }
    
    // Convert parameters to expected format
    const formattedOperatingSystem = operatingSystem.toLowerCase() === 'byol' ? 'Any' : 
                                    operatingSystem.toLowerCase() === 'windows' ? 'Windows' : 'Any'
    
    const formattedLicense = license === 'included' ? 'Included' : 'Bring Your Own License'
    const formattedRunningMode = runningMode === 'auto-stop' ? 'AutoStop' : 'AlwaysOn'
    
    // Ensure volume sizes include "GB" suffix - use let instead of const
    let formattedRootVolume = rootVolume.includes("GB") ? rootVolume : `${rootVolume} GB`
    let formattedUserVolume = userVolume.includes("GB") ? userVolume : `${userVolume} GB`
    
    // Make sure bundleDescription is properly formatted
    let formattedBundleDesc = bundleDescription
    if (!bundleDescription.includes("vCPU")) {
      // If we received a bundle ID instead of full description, try to map it
      // In a real app, you'd fetch the full description from another endpoint
      const bundleMap: Record<string, string> = {
        'value': 'Value (1 vCPU, 2GB RAM)',
        'standard': 'Standard (2 vCPU, 4GB RAM)',
        'performance': 'Performance (2 vCPU, 8GB RAM)',
        'power': 'Power (4 vCPU, 16GB RAM)',
        'powerpro': 'PowerPro (8 vCPU, 32GB RAM)',
        'graphics': 'Graphics (8 vCPU, 15GB RAM, 1 GPU, 4GB Video Memory)',
        'graphics-g4dn': 'Graphics.g4dn (4 vCPU, 16GB RAM, 1 GPU, 16GB Video Memory)',
        'graphicspro': 'GraphicsPro (16 vCPU, 122GB RAM, 1 GPU, 8GB Video Memory)',
        'graphicspro-g4dn': 'GraphicsPro.g4dn (16 vCPU, 64GB RAM, 1 GPU, 16GB Video Memory)',
        'general-16': 'General Purpose (16 vCPU, 64GB RAM)',
        'general-32': 'General Purpose (32 vCPU, 128GB RAM)'
      }
      
      // Try to find a match for the bundle ID
      for (const [key, value] of Object.entries(bundleMap)) {
        if (bundleDescription.toLowerCase().includes(key)) {
          formattedBundleDesc = value
          break
        }
      }
    }
    
    // First try to fetch the aggregation data to verify parameters
    const encodedRegion = encodeURIComponent(region)
    console.log(`Fetching aggregation data for region: ${region}`)
    
    try {
      // This API call helps us verify what bundle configurations are valid
      const aggregationData = await fetchAwsPricingData(
        `https://calculator.aws/pricing/2.0/meteredUnitMaps/workspaces/USD/current/workspaces-core-calc/${encodedRegion}/primary-selector-aggregations.json`,
        `Failed to fetch aggregation data for ${region}`
      )
      
      if (aggregationData && aggregationData.aggregations) {
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
        let bundlePrefix = bundleDescription.toLowerCase();
        for (const [key, value] of Object.entries(bundleMap)) {
          if (bundleDescription.toLowerCase().includes(key)) {
            bundlePrefix = value;
            break;
          }
        }
        
        // Find a configuration that matches our bundle
        let selectedConfig = null;
        for (const item of aggregationData.aggregations) {
          if (item.selectors && 
              item.selectors["Bundle Description"] && 
              item.selectors["Bundle Description"].startsWith(bundlePrefix)) {
            selectedConfig = item.selectors;
            break;
          }
        }
        
        if (selectedConfig) {
          console.log("Found configuration:", selectedConfig);
          
          // Construct the pricing URL with exactly the values from the API
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
          
          // Fetch the pricing data using the exact values from the API
          const pricingData = await fetchAwsPricingData(
            pricingUrl,
            `Failed to fetch pricing for ${selectedConfig["Bundle Description"]} in ${region}`
          );
          
          // Process the response
          if (!pricingData || !pricingData.regions || !pricingData.regions[region]) {
            // If pricing data is not available, return a 404
            return NextResponse.json({
              error: `No pricing data available for the specified configuration in ${region}`,
              fallbackPrice: estimateFallbackPrice(formattedBundleDesc, formattedOperatingSystem, formattedRunningMode)
            }, { status: 404 })
          }
          
          // Extract the pricing information
          const regionData = pricingData.regions[region]
          const prices: any[] = []
          
          // Loop through all pricing entries in the response
          for (const [key, priceInfo] of Object.entries(regionData)) {
            const info = priceInfo as any
            prices.push({
              description: key,
              price: parseFloat(info.price),
              unit: info.Unit,
              rateCode: info.rateCode,
              bundleDetails: {
                bundle: info.Bundle,
                license: info.License,
                operatingSystem: info['Operating System'],
                runningMode: info['Running Mode'],
                rootVolume: info.rootVolume,
                userVolume: info.userVolume
              }
            })
          }
          
          // Calculate total monthly price for this configuration
          const totalMonthlyPrice = prices.reduce((sum, item) => sum + item.price, 0)
          
          return NextResponse.json({
            bundle: formattedBundleDesc,
            region: region,
            prices: prices,
            totalMonthlyPrice: totalMonthlyPrice,
            operatingSystem: formattedOperatingSystem,
            license: formattedLicense,
            runningMode: formattedRunningMode,
            rootVolume: formattedRootVolume,
            userVolume: formattedUserVolume,
            source: "AWS Pricing API"
          })
          
        } else {
          throw new Error(`No matching bundle found for ${bundleDescription}`);
        }
      }
    } catch (error) {
      console.error("Error fetching aggregation data:", error);
      // Continue with the original parameters
    }
    
    // Construct the pricing URL
    const encodedParams = [
      encodedRegion,
      encodeURIComponent(formattedBundleDesc),
      encodeURIComponent(formattedRootVolume),
      encodeURIComponent(formattedUserVolume),
      encodeURIComponent(formattedOperatingSystem),
      encodeURIComponent(formattedLicense),
      encodeURIComponent(formattedRunningMode),
      encodeURIComponent('WorkSpaces Core')
    ]
    
    const pricingUrl = `https://calculator.aws/pricing/2.0/meteredUnitMaps/workspaces/USD/current/workspaces-core-calc/${encodedParams.join('/')}/index.json`
    
    console.log(`Fetching pricing from URL: ${pricingUrl}`)
    
    // Fetch the pricing data
    const pricingData = await fetchAwsPricingData(
      pricingUrl,
      `Failed to fetch pricing for ${formattedBundleDesc} in ${region}`
    )
    
    // Process the response
    if (!pricingData || !pricingData.regions || !pricingData.regions[region]) {
      // If pricing data is not available, return a 404
      return NextResponse.json({
        error: `No pricing data available for the specified configuration in ${region}`,
        fallbackPrice: estimateFallbackPrice(formattedBundleDesc, formattedOperatingSystem, formattedRunningMode)
      }, { status: 404 })
    }
    
    // Extract the pricing information
    const regionData = pricingData.regions[region]
    const prices: any[] = []
    
    // Loop through all pricing entries in the response
    for (const [key, priceInfo] of Object.entries(regionData)) {
      const info = priceInfo as any
      prices.push({
        description: key,
        price: parseFloat(info.price),
        unit: info.Unit,
        rateCode: info.rateCode,
        bundleDetails: {
          bundle: info.Bundle,
          license: info.License,
          operatingSystem: info['Operating System'],
          runningMode: info['Running Mode'],
          rootVolume: info.rootVolume,
          userVolume: info.userVolume
        }
      })
    }
    
    // Calculate total monthly price for this configuration
    const totalMonthlyPrice = prices.reduce((sum, item) => sum + item.price, 0)
    
    return NextResponse.json({
      bundle: formattedBundleDesc,
      region: region,
      prices: prices,
      totalMonthlyPrice: totalMonthlyPrice,
      operatingSystem: formattedOperatingSystem,
      license: formattedLicense,
      runningMode: formattedRunningMode,
      rootVolume: formattedRootVolume,
      userVolume: formattedUserVolume,
      source: "AWS Pricing API"
    })
    
  } catch (error) {
    console.error("Error fetching pricing details:", error)
    
    // Return a friendly error message
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    
    return NextResponse.json({
      error: `Failed to fetch pricing details: ${errorMessage}`,
      source: "Error",
      // Include a fallback estimated price
      fallbackPrice: { 
        monthly: 35, // Default to Standard pricing
        hourly: 0.43
      }
    }, { status: 500 })
  }
}

// Helper function to estimate fallback price when API fails
function estimateFallbackPrice(bundleDescription: string, operatingSystem: string, runningMode: string) {
  // Extract bundle type
  let bundleType = bundleDescription.toLowerCase()
  
  // Base prices for different bundle types
  let basePrice = 0
  
  if (bundleType.includes('value')) {
    basePrice = 21
  } else if (bundleType.includes('standard')) {
    basePrice = 35
  } else if (bundleType.includes('performance')) {
    basePrice = 60
  } else if (bundleType.includes('power') && !bundleType.includes('pro')) {
    basePrice = 80
  } else if (bundleType.includes('powerpro')) {
    basePrice = 124
  } else if (bundleType.includes('graphics') && bundleType.includes('pro')) {
    basePrice = 350
  } else if (bundleType.includes('graphics')) {
    basePrice = 220
  } else if (bundleType.includes('general') && bundleType.includes('16')) {
    basePrice = 250
  } else if (bundleType.includes('general') && bundleType.includes('32')) {
    basePrice = 500
  } else {
    basePrice = 35 // Default to standard pricing
  }
  
  // Adjust price based on operating system
  if (operatingSystem.toLowerCase() === 'any') {
    basePrice *= 0.85 // BYOL discount approximately 15%
  }
  
  let hourlyRate = basePrice / 730 // Approximate hourly rate (730 hours in a month)
  
  // Return both monthly and hourly prices
  return {
    monthly: basePrice,
    hourly: parseFloat(hourlyRate.toFixed(3)),
    autoStopMonthly: runningMode === 'AutoStop' ? parseFloat((hourlyRate * 160).toFixed(2)) : basePrice // Assume 160 hours for AutoStop
  }
}
