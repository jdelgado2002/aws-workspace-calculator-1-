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
    specs: {
      vCPU: number
      memory: number
      storage: number
      graphics: string
    }
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
}

// User's WorkSpace configuration
export interface WorkSpaceConfig {
  region: string
  bundleId: string
  bundleSpecs: {
    vCPU: number
    memory: number
    storage: number
    graphics: string
    gpu?: boolean
    gpuCount?: number
    videoMemory?: number
  }
  rootVolume: string
  userVolume: string
  operatingSystem: string
  runningMode: string
  numberOfWorkspaces: number
  billingOption: string
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

