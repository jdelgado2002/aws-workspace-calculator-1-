import { NextResponse } from "next/server"
import { DescribeWorkspaceBundlesCommand } from "@aws-sdk/client-workspaces"
import { DescribeRegionsCommand } from "@aws-sdk/client-ec2"
import { workspacesClient, ec2Client, executeAwsCommand } from "@/lib/aws-config"

export async function GET() {
  try {
    // Fetch available AWS regions
    let regions = []
    try {
      const regionsResponse = await executeAwsCommand(
        ec2Client.send(new DescribeRegionsCommand({})),
        "Failed to fetch AWS regions",
      )
      regions =
        regionsResponse.Regions?.map((region) => ({
          value: region.RegionName || "",
          label: region.RegionName || "",
        })) || []
    } catch (error) {
      console.error("Error fetching regions:", error)
      // Fall back to default regions
      regions = [
        { value: "us-east-1", label: "US East (N. Virginia)" },
        { value: "us-west-2", label: "US West (Oregon)" },
        { value: "eu-west-1", label: "EU (Ireland)" },
        { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
        { value: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
      ]
    }

    // Fetch available WorkSpace bundles
    let bundles = []
    try {
      const bundlesResponse = await executeAwsCommand(
        workspacesClient.send(new DescribeWorkspaceBundlesCommand({})),
        "Failed to fetch WorkSpace bundles",
      )
      bundles =
        bundlesResponse.Bundles?.map((bundle) => {
          // Extract bundle details
          const bundleId = bundle.BundleId || ""
          const name = bundle.Name || ""
          const computeType = bundle.ComputeType?.Name || ""

          // Extract bundle specs
          const vCPU = computeType === "PERFORMANCE" ? 4 : computeType === "POWER" ? 8 : 2
          const memory = computeType === "PERFORMANCE" ? 16 : computeType === "POWER" ? 32 : 8
          const storage = bundle.RootStorage?.Capacity || 80
          const graphics =
            bundle.ComputeType?.Name === "GRAPHICS" || bundle.ComputeType?.Name === "GRAPHICSPRO"
              ? "High Performance"
              : "Standard"

          // Determine price based on bundle type
          // Note: In a real implementation, you would fetch actual pricing from AWS Price List API
          const price =
            computeType === "VALUE"
              ? 21
              : computeType === "STANDARD"
                ? 35
                : computeType === "PERFORMANCE"
                  ? 60
                  : computeType === "POWER"
                    ? 80
                    : 21

          return {
            id: bundleId,
            name,
            price,
            specs: {
              vCPU,
              memory,
              storage,
              graphics,
            },
          }
        }) || []
    } catch (error) {
      console.error("Error fetching bundles:", error)
      // Fall back to default bundles
      bundles = [
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
        {
          id: "performance",
          name: "Performance",
          price: 60,
          specs: {
            vCPU: 4,
            memory: 16,
            storage: 100,
            graphics: "Standard",
          },
        },
        {
          id: "power",
          name: "Power",
          price: 80,
          specs: {
            vCPU: 4,
            memory: 16,
            storage: 175,
            graphics: "High Performance",
          },
        },
      ]
    }

    // Define operating systems, running modes, and billing options
    const operatingSystems = [
      { value: "windows", label: "Windows" },
      { value: "amazon-linux", label: "Amazon Linux" },
      { value: "ubuntu", label: "Ubuntu" },
    ]

    const runningModes = [
      { value: "always-on", label: "AlwaysOn" },
      { value: "auto-stop", label: "AutoStop" },
    ]

    const billingOptions = [
      { value: "monthly", label: "Monthly" },
      { value: "hourly", label: "Hourly" },
    ]

    return NextResponse.json({
      regions,
      bundles,
      operatingSystems,
      runningModes,
      billingOptions,
    })
  } catch (error) {
    console.error("Error fetching configuration options:", error)

    // Return a friendly error message
    const errorMessage = error instanceof Error ? error.message : "Unknown error"

    return NextResponse.json({ error: `Failed to fetch configuration options: ${errorMessage}` }, { status: 500 })
  }
}

