# AWS WorkSpaces Pricing Calculator

A production-ready React application that enables AWS customers to accurately estimate the monthly and annual costs associated with their AWS WorkSpaces usage.

## Current Implementation

The current implementation uses mock data to simulate AWS services. In a production environment, you would need to:

1. Set up proper AWS credentials
2. Use AWS SDK in a server environment (not client-side)
3. Configure AWS SDK to use credentials from environment variables

## How to Integrate with Real AWS Services

To integrate with real AWS services, you would need to:

1. Set up a server-side solution (like AWS Lambda, Express.js server, or Next.js API routes with proper configuration)
2. Use environment variables for AWS credentials:

```typescript
// Example of configuring AWS SDK in a server environment
import { WorkSpacesClient } from '@aws-sdk/client-workspaces';

const client = new WorkSpacesClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

