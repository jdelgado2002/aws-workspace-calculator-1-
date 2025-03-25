import { WorkSpacesClient } from "@aws-sdk/client-workspaces"
import { EC2Client } from "@aws-sdk/client-ec2"
import { PricingClient } from "@aws-sdk/client-pricing"

const region = process.env.AWS_REGION || "us-east-1"

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  sessionToken: process.env.AWS_SESSION_TOKEN || undefined,
}

// Validate credentials
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.warn("AWS credentials not found. Using empty credentials.")
}

// Create AWS SDK clients with explicit credentials
export const workspacesClient = new WorkSpacesClient({
  region,
  credentials,
})

export const ec2Client = new EC2Client({
  region,
  credentials,
})

// Pricing API is only available in us-east-1
export const pricingClient = new PricingClient({
  region: "us-east-1",
  credentials,
})

// Helper function to safely execute AWS commands with error handling
export async function executeAwsCommand<T>(
  command: Promise<T>,
  errorMessage = "AWS API error"
): Promise<T> {
  try {
    return await command
  } catch (error: any) {
    const enrichedError = {
      message: error?.message,
      name: error?.name,
      code: error?.code,
      statusCode: error?.$metadata?.httpStatusCode,
      requestId: error?.$metadata?.requestId,
      cfId: error?.$metadata?.cfId,
      extendedRequestId: error?.$metadata?.extendedRequestId,
      retryable: error?.$retryable,
      stack: error?.stack,
    }

    console.error(`${errorMessage}:`, enrichedError)

    // Also log raw error if nothing else was found
    if (Object.keys(enrichedError).length === 0) {
      console.error("Raw AWS error object:", error)
    }

    throw new Error(`${errorMessage}: ${error?.message || "Unknown AWS error"}`)
  }
}

