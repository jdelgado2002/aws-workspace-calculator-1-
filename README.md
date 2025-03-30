# AWS Workspace Calculator - Code Structure Guide

This is a comprehensive guide to explain the codebase structure, pricing logic, and overall architecture of the AWS Workspace Calculator application.

## Folder Structure

```
/app
  /api                 - Backend API endpoints
    /config            - Configuration endpoints for different services
    /pricing           - Pricing calculation endpoints
/components            - React UI components
/lib                   - Utility functions and API clients
/types                 - TypeScript type definitions
/dotnet                - .NET backend for AWS pricing (alternative)
```

### [api Structure](untitled:/app/api%20Structure)

The application uses Next.js API routes to handle backend operations:

```
/app/api
  /config
    /options           - General WorkSpaces options
    /bundles           - WorkSpaces Core bundles
    /pool-bundles      - WorkSpaces Pool bundles
    /appstream         - AppStream configuration
    /appstream/bundles - AppStream instance bundles
  /pricing
    /estimate          - WorkSpaces pricing calculator
    /details           - Detailed pricing info
    /appstream/estimate - AppStream pricing calculator
```

## Logic Structure

### Pricing Calculation Flow

1. **Configuration Selection**: User selects options in the UI
2. **API Request**: Configuration is sent to appropriate pricing endpoint
3. **AWS Pricing API**: The endpoint attempts to fetch real pricing from AWS Calculator API
4. **Processing**: Raw pricing data is processed into a standardized format
5. **Fallback Logic**: If AWS API fails, fallback to hardcoded estimates
6. **Response**: Pricing estimate is returned to the UI
7. **Display**: Results are shown in the CostSummaryPanel component

### Calculation Types

The application supports three main pricing calculations:

1. **WorkSpaces Core**: Individual WorkSpaces with dedicated resources
2. **WorkSpaces Pool**: Shared resources for multiple users
3. **AppStream**: AppStream 2.0 streaming service

## API Endpoints

### Configuration Endpoints

- **GET /api/config/options**
  - Returns WorkSpaces configuration options (regions, OS, bundles)
  - Fallback: Returns minimal hardcoded options

- **GET /api/config/bundles?region={region}**
  - Returns WorkSpaces bundles for a specific region
  - Fallback: Returns generic bundle options

- **GET /api/config/pool-bundles?region={region}**
  - Returns WorkSpaces Pool bundles for a specific region
  - Fallback: Returns generic pool bundle options

- **GET /api/config/appstream?region={region}**
  - Returns AppStream configuration options
  - Fallback: Returns minimal AppStream options

- **GET /api/config/appstream/bundles**
  - Returns AppStream instance types for selected family/function
  - Fallback: Returns hardcoded instance options by family type

### Pricing Endpoints

- **POST /api/pricing/estimate**
  - Calculates WorkSpaces Core or Pool pricing
  - Takes full configuration as input
  - Returns detailed pricing breakdown
  - Fallback: Uses hardcoded price estimates

- **POST /api/pricing/appstream/estimate**
  - Calculates AppStream pricing
  - Takes configuration including usage patterns
  - Returns hourly and monthly estimates
  - Fallback: Uses hardcoded AppStream rates

## External APIs

The application fetches pricing from AWS Calculator API endpoints:

- **Core WorkSpaces**: 
  ```
  https://calculator.aws/pricing/2.0/meteredUnitMaps/workspaces/USD/current/workspaces-core-calc/...
  ```

- **WorkSpaces Pool**: 
  ```
  https://calculator.aws/pricing/2.0/meteredUnitMaps/workspaces/USD/current/workspaces-pools-calc/...
  ```

- **AppStream**: 
  ```
  https://calculator.aws/pricing/2.0/meteredUnitMaps/appstream/USD/current/appstream-instances-calc/...
  ```

## Fallback Mechanisms

The application has multiple levels of fallback to ensure it works even when external APIs fail:

### Client-Side Fallbacks

Located in `/lib/api.ts`, these provide default values when API calls fail:
- Default regions and bundles
- Estimated pricing based on bundle type

### Server-Side Fallbacks

API routes include fallback logic when AWS pricing API fails:
- Hardcoded pricing constants
- Calculated estimates based on service type and configuration

### When Fallbacks Are Used

The application uses fallback data in these scenarios:

1. **API Request Failure**: When calls to AWS pricing API return non-200 status codes
2. **Timeout**: When requests to AWS pricing API time out
3. **Data Validation Failure**: When the API returns data that doesn't match expected format
4. **Missing Data**: When AWS API returns incomplete information
5. **Calculation Validation Failure**: When calculated values don't match expected totals

### Fallback Decision Logic

```
1. Try to get real pricing from AWS Calculator API
2. If that fails -> Use hardcoded pricing by instance/bundle type
3. If validation fails -> Apply correction factors to match expected totals
4. If unexpected values are returned -> Log warnings and use safer calculations
```

## Special Calculation Logic

### WorkSpaces Pool Logic

WorkSpaces Pool pricing includes these components:
- User license costs
- Active streaming costs (based on usage patterns)
- Buffer instance costs (for scaling capacity)

The key calculations happen in `calculatePoolCosts()` in `components/cost-summary-panel.tsx`:
- Weekday vs. weekend usage
- Peak vs. off-peak hours
- Concurrent user calculations

### AppStream Pricing Logic

AppStream pricing has multiple components:
- Base instance hourly rate
- Operating system costs
- Region multipliers
- Instance function modifiers
- Usage pattern calculations

The calculations in `app/api/pricing/appstream/estimate/route.ts` handle:
- Converting usage patterns to instance hours
- Applying appropriate multipliers
- Ensuring instances match user demands

## Null Safety and Error Handling

The application includes extensive null checks and error handling:
- Optional chaining (`?.`) for accessing potentially null values
- Null coalescing operators (`||`) for providing default values
- Type guards to ensure type safety
- Try/catch blocks around network requests
- Validation of response data before use

## How to Add New Options or Pricing

To add new pricing options:

1. **Add new bundle types**: Update the appropriate bundle data in config endpoints
2. **Add fallback pricing**: Add new entries to fallback pricing constants
3. **Update UI components**: Add new options to selectors in configuration panels
4. **Extend calculation logic**: Update calculation functions to handle new options