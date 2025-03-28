// Configuration options returned from the API
export interface ConfigOptions {
  regions: {
    value: string
    label: string
  }[]
  bundles: {
    id: string
    name: string
    price: number
    displayPrice?: string
    specs: BundleSpecs
  }[]
  operatingSystems: {
    value: string
    label: string
  }[]
  runningModes: {
    value: string
    label: string
  }[]
  billingOptions: {
    value: string
    label: string
  }[]
  rawMetadata?: any
  // Pool-specific options
  poolBundles?: {
    id: string
    name: string
    price: number
    displayPrice?: string
    specs: BundleSpecs
    type: string
    selectors?: any
    // Add license-specific pricing
    licensePricing?: {
      included: {
        hourlyRate: number
        monthlyRate: number
        displayPrice: string
        displayHourlyPrice: string
      }
      byol: {
        hourlyRate: number
        monthlyRate: number
        displayPrice: string
        displayHourlyPrice: string
      }
    }
  }[]
  poolOperatingSystems?: {
    value: string
    label: string
  }[]
  poolLicenseOptions?: {
    value: string
    label: string
  }[]
}

export interface BundleSpecs {
  vCPU: number
  memory: number
  storage: number
  graphics: string
  gpu?: boolean
  gpuCount?: number
  videoMemory?: number
}

// Usage pattern configuration for WorkSpaces Pool
export interface PoolUsagePattern {
  // Weekday usage
  weekdayDaysCount: number;
  weekdayPeakHoursPerDay: number;
  weekdayOffPeakConcurrentUsers: number;
  weekdayPeakConcurrentUsers: number;
  
  // Weekend usage
  weekendDaysCount: number;
  weekendPeakHoursPerDay: number;
  weekendOffPeakConcurrentUsers: number;
  weekendPeakConcurrentUsers: number;
}

// User's WorkSpace configuration
export interface WorkSpaceConfig {
  region: string
  bundleId: string
  bundleSpecs: BundleSpecs
  rootVolume?: string
  userVolume?: string
  operatingSystem: string
  license?: string // Add this to support Core licensing
  runningMode: string
  numberOfWorkspaces: number
  billingOption: string
  // Pool specific configurations
  poolRegion?: string
  poolBundleId?: string
  poolBundleSpecs?: BundleSpecs
  poolOperatingSystem?: string
  poolLicense?: string
  poolDesktopType?: string
  poolComputeType?: string
  poolRunningMode?: string
  poolStorageSize?: string
  poolNumberOfUsers?: number
  // Pool usage pattern
  poolUsagePattern?: PoolUsagePattern
  // Flag to indicate pool calculation in API calls
  isPoolCalculation?: boolean
  // License field used internally by API
  license?: string
  // Internal fields for state management
  _lastUpdated?: number;
  _updateTimestamp?: number;
}

// Pricing estimate returned from the API
export interface PricingEstimate {
  costPerWorkspace: number
  totalMonthlyCost: number
  annualEstimate: number
  bundleName: string
  billingModel: string
  baseCost: number
  pricingSource?: "aws-api" | "calculated"
  storage?: number
  rootVolume?: number
  userVolume?: number
  originalConfig?: {
    rootVolume: string
    userVolume: string
    bundleStorage?: number
  }
}

