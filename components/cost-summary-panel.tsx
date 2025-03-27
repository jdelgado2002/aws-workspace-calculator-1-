"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert" // Add this import
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Info, MonitorSmartphone, Users, Database, AlertTriangle } from "lucide-react" // Add AlertTriangle icon
import type { WorkSpaceConfig, PricingEstimate, PoolUsagePattern } from "@/types/workspace"

interface CostSummaryPanelProps {
  config: WorkSpaceConfig
  pricingEstimate: PricingEstimate | null
  isLoading: boolean
  activeTab?: string // Add this to track which tab is active
}

// Helper function to calculate pool utilization based on usage pattern
function calculatePoolUtilization(usagePattern: PoolUsagePattern): number {
  if (!usagePattern) return 1.0; // 100% utilization if no pattern defined

  const hoursInWeek = 24 * 7;
  
  // Calculate total weekday hours
  const weekdayTotalHours = usagePattern.weekdayDaysCount * 24;
  const weekdayPeakHours = usagePattern.weekdayDaysCount * usagePattern.weekdayPeakHoursPerDay;
  const weekdayOffPeakHours = weekdayTotalHours - weekdayPeakHours;
  
  // Calculate total weekend hours
  const weekendTotalHours = usagePattern.weekendDaysCount * 24;
  const weekendPeakHours = usagePattern.weekendDaysCount * usagePattern.weekendPeakHoursPerDay;
  const weekendOffPeakHours = weekendTotalHours - weekendPeakHours;
  
  // Calculate weighted utilization
  const weekdayPeakUtilization = (weekdayPeakHours / hoursInWeek) * (usagePattern.weekdayPeakConcurrentUsers / 100);
  const weekdayOffPeakUtilization = (weekdayOffPeakHours / hoursInWeek) * (usagePattern.weekdayOffPeakConcurrentUsers / 100);
  const weekendPeakUtilization = (weekendPeakHours / hoursInWeek) * (usagePattern.weekendPeakConcurrentUsers / 100);
  const weekendOffPeakUtilization = (weekendOffPeakHours / hoursInWeek) * (usagePattern.weekendOffPeakConcurrentUsers / 100);
  
  // Sum all utilizations for overall percentage
  return weekdayPeakUtilization + weekdayOffPeakUtilization + weekendPeakUtilization + weekendOffPeakUtilization;
}

// Calculate weekly usage hours for the pool
function calculateWeeklyUsageHours(usagePattern: PoolUsagePattern): number {
  if (!usagePattern) return 168; // Default to full week if no pattern
  
  // Weekly peak hours
  const weekdayPeakHours = usagePattern.weekdayDaysCount * usagePattern.weekdayPeakHoursPerDay;
  const weekendPeakHours = usagePattern.weekendDaysCount * usagePattern.weekendPeakHoursPerDay;
  
  // Weekly off-peak hours
  const weekdayOffPeakHours = (usagePattern.weekdayDaysCount * 24) - weekdayPeakHours;
  const weekendOffPeakHours = (usagePattern.weekendDaysCount * 24) - weekendPeakHours;
  
  // Calculate effective hours based on utilization
  const effectiveWeekdayPeakHours = weekdayPeakHours * (usagePattern.weekdayPeakConcurrentUsers / 100);
  const effectiveWeekdayOffPeakHours = weekdayOffPeakHours * (usagePattern.weekdayOffPeakConcurrentUsers / 100); 
  const effectiveWeekendPeakHours = weekendPeakHours * (usagePattern.weekendPeakConcurrentUsers / 100);
  const effectiveWeekendOffPeakHours = weekendOffPeakHours * (usagePattern.weekendOffPeakConcurrentUsers / 100);
  
  // Total effective hours per week
  return effectiveWeekdayPeakHours + effectiveWeekdayOffPeakHours + effectiveWeekendPeakHours + effectiveWeekendOffPeakHours;
}

function calculatePoolCosts(usagePattern: PoolUsagePattern, baseHourlyRate: number, userCount: number): {
  userLicenseCost: number;
  activeStreamingCost: number;
  stoppedInstanceCost: number;
  totalMonthlyCost: number;
  peakWeekdayHours: number;
  offPeakWeekdayHours: number;
  peakWeekendHours: number;
  offPeakWeekendHours: number;
  totalUtilizedHours: number;
  totalBufferHours: number;
} {
  // Constants based on AWS calculator
  const LICENSE_COST_PER_USER = 4.19; // USD per user per month
  const ACTIVE_STREAMING_RATE = baseHourlyRate; // Default to provided base rate
  const STOPPED_INSTANCE_RATE = 0.025; // USD per hour for stopped instances
  const BUFFER_FACTOR = 0.10; // 10% buffer per AWS calculator
  const WEEKS_PER_MONTH = 4.35; // AWS uses 730 hours / 168 hours = 4.35 weeks per month
  
  // 1. Calculate user license costs
  const userLicenseCost = LICENSE_COST_PER_USER * userCount;
  
  // 2. Calculate weekday usage hours
  const weekdayDays = usagePattern.weekdayDaysCount;
  const weekdayPeakHoursPerDay = usagePattern.weekdayPeakHoursPerDay;
  const weekdayTotalHoursPerDay = 24;
  
  const peakWeekdayHours = weekdayDays * weekdayPeakHoursPerDay * WEEKS_PER_MONTH;
  const totalWeekdayHours = weekdayDays * weekdayTotalHoursPerDay * WEEKS_PER_MONTH;
  const offPeakWeekdayHours = totalWeekdayHours - peakWeekdayHours;
  
  // Convert percentage to actual users
  const peakWeekdayConcurrentUsers = Math.ceil((usagePattern.weekdayPeakConcurrentUsers / 100) * userCount);
  const offPeakWeekdayConcurrentUsers = Math.ceil((usagePattern.weekdayOffPeakConcurrentUsers / 100) * userCount);
  
  // Ensure at least 1 instance
  const peakWeekdayInstances = Math.max(1, peakWeekdayConcurrentUsers);
  const offPeakWeekdayInstances = Math.max(1, offPeakWeekdayConcurrentUsers);
  
  // Calculate utilized instance hours
  const peakWeekdayInstanceHours = peakWeekdayInstances * peakWeekdayHours;
  const offPeakWeekdayInstanceHours = offPeakWeekdayInstances * offPeakWeekdayHours;
  const totalWeekdayUtilizedHours = peakWeekdayInstanceHours + offPeakWeekdayInstanceHours;
  
  // 3. Calculate weekday buffer hours (stopped instances)
  const peakWeekdayBufferInstances = Math.ceil(peakWeekdayInstances * BUFFER_FACTOR);
  const offPeakWeekdayBufferInstances = Math.ceil(offPeakWeekdayInstances * BUFFER_FACTOR);
  
  const peakWeekdayBufferHours = peakWeekdayBufferInstances * peakWeekdayHours;
  const offPeakWeekdayBufferHours = offPeakWeekdayBufferInstances * offPeakWeekdayHours;
  const totalWeekdayBufferHours = peakWeekdayBufferHours + offPeakWeekdayBufferHours;
  
  // 4. Calculate weekend usage hours
  const weekendDays = usagePattern.weekendDaysCount;
  const weekendPeakHoursPerDay = usagePattern.weekendPeakHoursPerDay;
  const weekendTotalHoursPerDay = 24;
  
  const peakWeekendHours = weekendDays * weekendPeakHoursPerDay * WEEKS_PER_MONTH;
  const totalWeekendHours = weekendDays * weekendTotalHoursPerDay * WEEKS_PER_MONTH;
  const offPeakWeekendHours = totalWeekendHours - peakWeekendHours;
  
  // Convert percentage to actual users
  const peakWeekendConcurrentUsers = Math.ceil((usagePattern.weekendPeakConcurrentUsers / 100) * userCount);
  const offPeakWeekendConcurrentUsers = Math.ceil((usagePattern.weekendOffPeakConcurrentUsers / 100) * userCount);
  
  // Ensure at least 1 instance
  const peakWeekendInstances = Math.max(1, peakWeekendConcurrentUsers);
  const offPeakWeekendInstances = Math.max(1, offPeakWeekendConcurrentUsers);
  
  // Calculate utilized instance hours
  const peakWeekendInstanceHours = peakWeekendInstances * peakWeekendHours;
  const offPeakWeekendInstanceHours = offPeakWeekendInstances * offPeakWeekendHours;
  const totalWeekendUtilizedHours = peakWeekendInstanceHours + offPeakWeekendInstanceHours;
  
  // 5. Calculate weekend buffer hours (stopped instances)
  const peakWeekendBufferInstances = Math.ceil(peakWeekendInstances * BUFFER_FACTOR);
  const offPeakWeekendBufferInstances = Math.ceil(offPeakWeekendInstances * BUFFER_FACTOR);
  
  const peakWeekendBufferHours = peakWeekendBufferInstances * peakWeekendHours;
  const offPeakWeekendBufferHours = offPeakWeekendBufferInstances * offPeakWeekendHours;
  const totalWeekendBufferHours = peakWeekendBufferHours + offPeakWeekendBufferHours;
  
  // 6. Calculate total hours
  const totalUtilizedHours = totalWeekdayUtilizedHours + totalWeekendUtilizedHours;
  const totalBufferHours = totalWeekdayBufferHours + totalWeekendBufferHours;
  
  // 7. Calculate costs
  const activeStreamingCost = totalUtilizedHours * ACTIVE_STREAMING_RATE;
  const stoppedInstanceCost = totalBufferHours * STOPPED_INSTANCE_RATE;
  
  // 8. Total cost
  const instanceCost = activeStreamingCost + stoppedInstanceCost;
  const totalMonthlyCost = userLicenseCost + instanceCost;
  
  return {
    userLicenseCost,
    activeStreamingCost,
    stoppedInstanceCost,
    totalMonthlyCost,
    peakWeekdayHours,
    offPeakWeekdayHours,
    peakWeekendHours,
    offPeakWeekendHours,
    totalUtilizedHours,
    totalBufferHours
  };
}

export default function CostSummaryPanel({ config, pricingEstimate, isLoading, activeTab = "core" }: CostSummaryPanelProps) {
  // Determine if we're showing pool pricing or core pricing based on the active tab
  const isPool = activeTab === "pool";
  
  // Calculate pool-specific metrics
  const poolUtilization = isPool && config.poolUsagePattern 
    ? calculatePoolUtilization(config.poolUsagePattern)
    : 1.0;
  
  const weeklyUsageHours = isPool && config.poolUsagePattern
    ? calculateWeeklyUsageHours(config.poolUsagePattern)
    : 168; // 24 hours * 7 days
    
  const monthlyUsageHours = weeklyUsageHours * 4.33; // Average weeks per month
  
  // Get the number of users for calculations
  const userCount = isPool 
    ? (config.poolNumberOfUsers || 10) 
    : config.numberOfWorkspaces;
  
  // Calculate base costs
  const baseHourlyCost = isPool && pricingEstimate
    ? (pricingEstimate.baseCost / 730) // Convert monthly to hourly
    : 0;
    
  const fullMonthlyCost = pricingEstimate?.totalMonthlyCost || 0;
  
  // Calculate optimized pool costs (only if we're in pool mode)
  const poolCosts = isPool && config.poolUsagePattern
    ? calculatePoolCosts(
        config.poolUsagePattern, 
        baseHourlyCost, 
        userCount
      )
    : { totalMonthlyCost: 0, userLicenseCost: 0, activeStreamingCost: 0, stoppedInstanceCost: 0 };

  const poolOptimizedMonthlyCost = isPool ? poolCosts.totalMonthlyCost : 0;
  
  // Calculate savings (only for pool)
  const potentialSavings = isPool
    ? fullMonthlyCost - poolOptimizedMonthlyCost
    : 0;
  
  // Effective cost per user/workspace
  const effectiveCostPerUser = isPool && userCount > 0
    ? poolOptimizedMonthlyCost / userCount
    : pricingEstimate?.costPerWorkspace || 0;
  
  // Format currency values
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  // Format percentage
  const formatPercent = (value: number) => {
    return `${Math.round(value * 100)}%`;
  };

  return (
    <Card className="h-full shadow-sm">
      <CardContent className="p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Pricing Summary</h2>
        
        {/* Show a warning if volume selections weren't honored */}
        {pricingEstimate && !pricingEstimate.volumeSelectionHonored && 
          config.rootVolume && config.userVolume && (
          <Alert className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Your selected volumes (Root: {config.rootVolume}GB, User: {config.userVolume}GB) were 
              adjusted to (Root: {pricingEstimate.rootVolume}GB, User: {pricingEstimate.userVolume}GB)
              to match available options in this region.
            </AlertDescription>
          </Alert>
        )}
        
        <div className="flex justify-between items-center mb-1">
          <h2 className="text-xl font-bold text-gray-900">Cost Summary</h2>
          <div className="flex items-center gap-2">
            {pricingEstimate?.pricingSource === "aws-api" && (
              <Badge variant="outline" className="bg-blue-50 text-blue-700 hover:bg-blue-100">
                AWS Pricing
              </Badge>
            )}
            <Badge 
              variant="outline" 
              className={`${isPool ? "bg-purple-50 text-purple-700" : "bg-green-50 text-green-700"}`}
            >
              {isPool ? "Pool" : "Core"}
            </Badge>
          </div>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          {isPool 
            ? `Estimated Pool costs for ${userCount} users` 
            : `Estimated costs for ${userCount} WorkSpace${userCount > 1 ? "s" : ""}`}
        </p>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="space-y-4 my-8">
              <Skeleton className="h-20 w-full" />
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {/* Core mode content */}
              {!isPool && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">
                      Cost per WorkSpace
                    </h3>
                    <p className="text-3xl font-bold text-gray-900">
                      {pricingEstimate ? formatCurrency(pricingEstimate.costPerWorkspace) : "$0.00"}
                      <span className="text-sm font-normal text-gray-500">/mo</span>
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2 py-2">
                    <MonitorSmartphone className="h-5 w-5 text-green-600" />
                    <div className="text-sm text-gray-700">
                      <span className="font-medium">{userCount}</span> dedicated WorkSpaces
                    </div>
                  </div>
                </div>
              )}

              {/* Pool mode content */}
              {isPool && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">
                      Effective Cost Per User
                    </h3>
                    <p className="text-3xl font-bold text-gray-900">
                      {formatCurrency(effectiveCostPerUser)}
                      <span className="text-sm font-normal text-gray-500">/mo</span>
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2 py-2">
                    <Users className="h-5 w-5 text-purple-600" />
                    <div className="text-sm text-gray-700">
                      Pool supports <span className="font-medium">{userCount}</span> users
                    </div>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-md border border-blue-100">
                    <div className="flex justify-between mb-3">
                      <div className="flex items-center gap-1">
                        <h3 className="text-sm font-medium text-blue-800">Pool Usage Details</h3>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="h-4 w-4 text-blue-500" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="text-xs">
                                Pool costs follow AWS's pricing model including user licenses, active streaming hours, and buffer instances.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-blue-600">User licenses</span>
                        <span className="text-sm font-medium">{formatCurrency(poolCosts.userLicenseCost)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-blue-600">Active streaming</span>
                        <span className="text-sm font-medium">{formatCurrency(poolCosts.activeStreamingCost)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-blue-600">Stopped instances</span>
                        <span className="text-sm font-medium">{formatCurrency(poolCosts.stoppedInstanceCost)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-blue-600">Total instance hours</span>
                        <span className="text-sm font-medium">{Math.round(poolCosts.totalUtilizedHours + poolCosts.totalBufferHours)}</span>
                      </div>
                      <div className="flex justify-between border-t border-blue-200 pt-2 mt-2">
                        <span className="text-sm font-medium text-blue-700">Total monthly cost</span>
                        <span className="text-sm font-medium">{formatCurrency(poolCosts.totalMonthlyCost)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-gray-200">
                <h3 className="text-sm font-medium text-gray-500">Total Monthly Cost</h3>
                <p className="text-3xl font-bold text-gray-900">
                  {isPool
                    ? formatCurrency(poolOptimizedMonthlyCost)
                    : formatCurrency(fullMonthlyCost)}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500">Annual Estimate</h3>
                <p className="text-xl font-semibold text-gray-900">
                  {isPool
                    ? formatCurrency(poolOptimizedMonthlyCost * 12)
                    : formatCurrency(fullMonthlyCost * 12)}
                </p>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200 space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">
                  {isPool ? "Bundle Type" : "Bundle"}
                </span>
                <span className="text-sm text-gray-900 font-medium">
                  {isPool && config.poolBundleSpecs 
                    ? `${config.poolBundleSpecs.type} (${config.poolBundleSpecs.vCPU} vCPU, ${config.poolBundleSpecs.memory} GB)` 
                    : pricingEstimate?.bundleName || "-"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Billing Model</span>
                <span className="text-sm text-gray-900">
                  {isPool ? "Hourly (usage-based)" : pricingEstimate?.billingModel || "-"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Region</span>
                <span className="text-sm text-gray-900">
                  {isPool ? config.poolRegion : config.region}
                </span>
              </div>
              {isPool && (
                <>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Operating System</span>
                    <span className="text-sm text-gray-900">
                      {config.poolOperatingSystem ? 
                        (config.poolOperatingSystem === 'windows' ? 'Windows' : 
                         config.poolOperatingSystem === 'amazon-linux' ? 'Amazon Linux' : 
                         config.poolOperatingSystem === 'ubuntu' ? 'Ubuntu' : 
                         config.poolOperatingSystem) : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">License</span>
                    <span className="text-sm text-gray-900">
                      {config.poolLicense ? 
                        (config.poolLicense === 'included' ? 'Included' : 
                         config.poolLicense === 'bring-your-own-license' ? 'BYOL' : 
                         config.poolLicense) : '-'}
                      {pricingEstimate?.license && (
                        <span className="ml-1 text-amber-600">
                          (Using {pricingEstimate.license})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Maximum Users</span>
                    <span className="text-sm text-gray-900">{config.poolNumberOfUsers || 10}</span>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

