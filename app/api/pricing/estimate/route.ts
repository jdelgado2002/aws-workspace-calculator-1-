import { NextResponse } from "next/server"
import type { WorkSpaceConfig } from "@/types/workspace"
import { GetProductsCommand } from "@aws-sdk/client-pricing"
import { DescribeWorkspaceBundlesCommand } from "@aws-sdk/client-workspaces"
import { pricingClient, workspacesClient, executeAwsCommand } from "@/lib/aws-config"

export async function POST(request: Request) {
  try {
    const config: WorkSpaceConfig = await request.json()

    // Initialize variables for pricing
    let baseCost = 0
    let bundleName = ""
    let bundleType = ""
    let pricingSource = "calculated" // Track if we're using AWS pricing or calculated pricing

    // Try to get bundle information from AWS WorkSpaces API
    try {
      const bundlesResponse = await executeAwsCommand(
        workspacesClient.send(
          new DescribeWorkspaceBundlesCommand({
            BundleIds: [config.bundleId],
          }),
        ),
        "Failed to fetch WorkSpace bundle details",
      )

      if (bundlesResponse.Bundles && bundlesResponse.Bundles.length > 0) {
        const bundle = bundlesResponse.Bundles[0]
        bundleName = bundle.Name || "Custom Bundle"

        // Extract bundle type for pricing lookup
        bundleType = bundle.ComputeType?.Name?.toLowerCase() || ""

        console.log(`Found bundle: ${bundleName}, type: ${bundleType}`)
      }
    } catch (error) {
      console.error("Error fetching bundle details:", error)
      // Extract bundle type from bundle ID if API call fails
      bundleType = config.bundleId.toLowerCase()
      if (bundleType.includes("value")) bundleType = "value"
      else if (bundleType.includes("standard")) bundleType = "standard"
      else if (bundleType.includes("performance")) bundleType = "performance"
      else if (bundleType.includes("power")) bundleType = "power"
      else if (bundleType.includes("graphics") && bundleType.includes("pro")) bundleType = "graphicspro"
      else if (bundleType.includes("graphics")) bundleType = "graphics"
      else bundleType = "standard" // Default to standard if unknown

      bundleName = bundleType.charAt(0).toUpperCase() + bundleType.slice(1)
    }

    // Try to get pricing information from AWS Price List API
    try {
      // Create filters for the AWS Price List API
      const filters = [
        {
          Type: "TERM_MATCH",
          Field: "regionCode",
          Value: config.region,
        },
        {
          Type: "TERM_MATCH",
          Field: "operatingSystem",
          Value: config.operatingSystem === "windows" ? "Windows" : "Linux",
        },
      ]

      // If we have a bundle type, add it to the filters
      if (bundleType) {
        filters.push({
          Type: "TERM_MATCH",
          Field: "bundleType",
          Value: bundleType.toUpperCase(),
        })
      }

      const pricingResponse = await executeAwsCommand(
        pricingClient.send(
          new GetProductsCommand({
            ServiceCode: "AmazonWorkSpaces",
            Filters: filters,
            MaxResults: 100,
          }),
        ),
        "Failed to fetch pricing information",
      )

      if (pricingResponse.PriceList && pricingResponse.PriceList.length > 0) {
        console.log("Found pricing data from AWS Price List API")

        // Parse the price list (returned as JSON strings)
        const priceListItems = pricingResponse.PriceList.map((item) =>
          typeof item === "string" ? JSON.parse(item) : item,
        )

        // Find the pricing for the selected bundle
        const bundlePricing = priceListItems.find((item) => {
          const product = item.product

          // Check if this is a WorkSpaces bundle that matches our criteria
          return (
            product &&
            product.attributes &&
            product.attributes.bundleType &&
            product.attributes.bundleType.toLowerCase().includes(bundleType)
          )
        })

        if (bundlePricing) {
          // Extract pricing information
          const terms = bundlePricing.terms

          if (terms && terms.OnDemand) {
            const onDemandKey = Object.keys(terms.OnDemand)[0]
            const priceDimensions = terms.OnDemand[onDemandKey].priceDimensions
            const priceDimensionKey = Object.keys(priceDimensions)[0]

            // Get the price per unit
            const pricePerUnit = Number.parseFloat(priceDimensions[priceDimensionKey].pricePerUnit.USD)

            if (!isNaN(pricePerUnit)) {
              baseCost = pricePerUnit
              bundleName = bundlePricing.product.attributes.bundleType || "Custom"
              pricingSource = "aws"
              console.log(`Using AWS pricing: ${baseCost} for ${bundleName}`)
            }
          }
        }
      }
    } catch (pricingError) {
      console.error("Error fetching pricing from AWS:", pricingError)
      // Continue with calculated pricing
    }

    // If we couldn't get pricing from AWS, use our calculated pricing
    if (pricingSource === "calculated") {
      console.log("Using calculated pricing")

      // Calculate pricing based on bundle and configuration
      switch (bundleType) {
        case "value":
          baseCost = 21
          break
        case "standard":
          baseCost = 35
          break
        case "performance":
          baseCost = 60
          break
        case "power":
          baseCost = 80
          break
        case "graphics":
          baseCost = 490
          break
        case "graphicspro":
          baseCost = 790
          break
        default:
          baseCost = 35 // Default to standard pricing
      }
    }

    // Apply running mode adjustment
    if (config.runningMode === "auto-stop" && config.billingOption === "hourly") {
      // AutoStop with hourly billing typically costs less
      baseCost = baseCost * 0.8
    }

    // Calculate total costs
    const costPerWorkspace = baseCost
    const totalMonthlyCost = costPerWorkspace * config.numberOfWorkspaces
    const annualEstimate = totalMonthlyCost * 12

    // Determine billing model display name
    const billingModel = config.billingOption === "monthly" ? "Monthly" : "Hourly"

    return NextResponse.json({
      costPerWorkspace,
      totalMonthlyCost,
      annualEstimate,
      bundleName,
      billingModel,
      baseCost,
      pricingSource,
    })
  } catch (error) {
    console.error("Error calculating pricing:", error)
    return NextResponse.json({ error: "Failed to calculate pricing" }, { status: 500 })
  }
}

