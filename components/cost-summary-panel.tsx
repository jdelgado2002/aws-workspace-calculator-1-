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

function calculatePoolCosts(usagePattern: PoolUsagePattern, baseHourlyRate: number, userCount: number, license: string = "included"): {
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
  totalInstanceHours: number;
} {
  // Constants based on AWS calculator
  const LICENSE_COST_PER_USER = 4.19; // USD per user per month
  
  // Apply license discount for BYOL
  const isBYOL = license === "bring-your-own-license";
  
  // Instead of hardcoding rates, use the baseHourlyRate from the API
  // The API provides the correct rate, so we should use it directly
  const ACTIVE_STREAMING_RATE = baseHourlyRate;

  console.log(`Using API-provided streaming rate: ${ACTIVE_STREAMING_RATE}/hr for ${license} license`);

  const STOPPED_INSTANCE_RATE = 0.03; // This rate is fixed per AWS documentation
  const BUFFER_FACTOR = 0.10; // 10% buffer factor as per AWS calculator
  const WEEKS_PER_MONTH = 4.35; // 730 hours / 168 hours = 4.35 weeks per month
  
  // Calculate user license costs - only if using included license
  const userLicenseCost = license !== "bring-your-own-license" ? LICENSE_COST_PER_USER * userCount : 0;
  
  // 2. Calculate weekday usage hours
  const weekdayDays = usagePattern.weekdayDaysCount;
  const weekdayPeakHoursPerDay = usagePattern.weekdayPeakHoursPerDay;
  const weekdayTotalHoursPerDay = 24;
  
  const peakWeekdayHours = weekdayDays * weekdayPeakHoursPerDay * WEEKS_PER_MONTH;
  const totalWeekdayHours = weekdayDays * weekdayTotalHoursPerDay * WEEKS_PER_MONTH;
  const offPeakWeekdayHours = totalWeekdayHours - peakWeekdayHours;
  
  // Important: For the calculations to match AWS, we need to use the ACTUAL user counts,
  // not percentages. If usagePattern has percentages, convert to actual users.
  const peakWeekdayConcurrentUsers = Math.max(1, Math.floor((usagePattern.weekdayPeakConcurrentUsers / 100) * userCount));
  const offPeakWeekdayConcurrentUsers = Math.max(1, Math.floor((usagePattern.weekdayOffPeakConcurrentUsers / 100) * userCount));
  
  // Calculate utilized instance hours - direct multiplication of users and hours
  const peakWeekdayInstanceHours = peakWeekdayConcurrentUsers * peakWeekdayHours;
  const offPeakWeekdayInstanceHours = offPeakWeekdayConcurrentUsers * offPeakWeekdayHours;
  const totalWeekdayUtilizedHours = peakWeekdayInstanceHours + offPeakWeekdayInstanceHours;
  
  // 3. Calculate weekday buffer hours (stopped instances)
  // Important: Apply buffer factor directly to instance hours
  const peakWeekdayBufferHours = peakWeekdayInstanceHours * BUFFER_FACTOR;
  const offPeakWeekdayBufferHours = offPeakWeekdayInstanceHours * BUFFER_FACTOR;
  const totalWeekdayBufferHours = peakWeekdayBufferHours + offPeakWeekdayBufferHours;
  
  // 4. Calculate weekend usage hours
  const weekendDays = usagePattern.weekendDaysCount;
  const weekendPeakHoursPerDay = usagePattern.weekendPeakHoursPerDay;
  const weekendTotalHoursPerDay = 24;
  
  const peakWeekendHours = weekendDays * weekendPeakHoursPerDay * WEEKS_PER_MONTH;
  const totalWeekendHours = weekendDays * weekendTotalHoursPerDay * WEEKS_PER_MONTH;
  const offPeakWeekendHours = totalWeekendHours - peakWeekendHours;
  
  // Convert percentage to actual users - same approach as weekday
  const peakWeekendConcurrentUsers = Math.max(1, Math.floor((usagePattern.weekendPeakConcurrentUsers / 100) * userCount));
  const offPeakWeekendConcurrentUsers = Math.max(1, Math.floor((usagePattern.weekendOffPeakConcurrentUsers / 100) * userCount));
  
  // Calculate utilized instance hours
  const peakWeekendInstanceHours = peakWeekendConcurrentUsers * peakWeekendHours;
  const offPeakWeekendInstanceHours = offPeakWeekendConcurrentUsers * offPeakWeekendHours;
  const totalWeekendUtilizedHours = peakWeekendInstanceHours + offPeakWeekendInstanceHours;
  
  // 5. Calculate weekend buffer hours (stopped instances)
  const peakWeekendBufferHours = peakWeekendInstanceHours * BUFFER_FACTOR;
  const offPeakWeekendBufferHours = offPeakWeekendInstanceHours * BUFFER_FACTOR;
  const totalWeekendBufferHours = peakWeekendBufferHours + offPeakWeekendBufferHours;
  
  // 6. Calculate total hours
  const totalUtilizedHours = totalWeekdayUtilizedHours + totalWeekendUtilizedHours;
  const totalBufferHours = totalWeekdayBufferHours + totalWeekendBufferHours;
  const totalInstanceHours = totalUtilizedHours + totalBufferHours;
  
  // 7. Calculate costs
  const activeStreamingCost = totalUtilizedHours * ACTIVE_STREAMING_RATE;
  const stoppedInstanceCost = totalBufferHours * STOPPED_INSTANCE_RATE;
  
  // 8. Total cost
  const instanceCost = activeStreamingCost + stoppedInstanceCost;
  const totalMonthlyCost = userLicenseCost + instanceCost;
  
  console.log(`Cost breakdown:
    - User licenses: ${userLicenseCost.toFixed(2)}
    - Active streaming: ${activeStreamingCost.toFixed(2)} (${totalUtilizedHours} hrs @ $${ACTIVE_STREAMING_RATE}/hr)
    - Stopped instances: ${stoppedInstanceCost.toFixed(2)} (${totalBufferHours} hrs @ $${STOPPED_INSTANCE_RATE}/hr)
    - Total cost: ${totalMonthlyCost.toFixed(2)}
  `);

  // Add debug logging for verification
  console.log(`Calculation with API rate:
    Base hourly rate from API: ${baseHourlyRate}
    Active streaming rate used: ${ACTIVE_STREAMING_RATE}
    License type: ${license}
    Total hours: ${totalInstanceHours}
    Expected cost: ${(totalInstanceHours * ACTIVE_STREAMING_RATE).toFixed(2)}
  `);
  
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
    totalBufferHours,
    totalInstanceHours
  };
}

export default function CostSummaryPanel({ config, pricingEstimate, isLoading, activeTab = "core" }: CostSummaryPanelProps) {   
  // Determine if we're showing pool pricing or core pricing based on the active tab    
  const isPool = activeTab === "pool";
  
  // Calculate pool-specific metrics
  
  // Get the number of users for calculations
  const userCount = isPool 
    ? (config.poolNumberOfUsers || 10) 
    : config.numberOfWorkspaces;
  
  // Get the license type from config (use the pool-specific license for pool calculations)
  const licenseType = isPool ? (config.poolLicense || "included") : (config.license || "included");
  
  // Calculate base costs - ensure we have a valid base hourly rate
  // For pool calculations, we'll let the calculatePoolCosts function apply any license discounts
  const baseHourlyCost = isPool && pricingEstimate
    ? (pricingEstimate.baseCost / 730) || 0.12 // Convert monthly to hourly with fallback
    : 0;
  
  console.log(`Base hourly cost: ${baseHourlyCost}, license: ${licenseType}`);
  
  // Get the total monthly cost from pricing estimate
  const fullMonthlyCost = pricingEstimate?.totalMonthlyCost || 0;
  
  // For pool calculations, use the pricing details from the API if available
  let poolCosts = { totalMonthlyCost: 0, userLicenseCost: 0, activeStreamingCost: 0, stoppedInstanceCost: 0, totalInstanceHours: 0 };
  
  if (isPool && pricingEstimate?.poolPricingDetails) {
    // Use the detailed pool pricing data from the API  
    poolCosts = {
      totalMonthlyCost: pricingEstimate.totalMonthlyCost || 0,
      userLicenseCost: pricingEstimate.poolPricingDetails.userLicenseCost || 0,
      activeStreamingCost: pricingEstimate.poolPricingDetails.activeStreamingCost || 0,
      stoppedInstanceCost: pricingEstimate.poolPricingDetails.stoppedInstanceCost || 0,
      totalInstanceHours: pricingEstimate.poolPricingDetails.totalInstanceHours || 0
    };
  } else if (isPool && config.poolUsagePattern) {
    // Fallback to calculating locally if API data isn't available
    poolCosts = calculatePoolCosts(
      config.poolUsagePattern, 
      baseHourlyCost, 
      userCount,
      licenseType
    );
  }
  
  // Ensure we have valid numbers for display   
  const poolOptimizedMonthlyCost = isPool ? (poolCosts.totalMonthlyCost || 0) : 0;
  
  // Calculate savings (only for pool)
  
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
                  <div className="space-y-4 my-8">
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
                        <span className="text-sm font-medium">{Math.round(poolCosts.totalInstanceHours || 0)}</span>
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

