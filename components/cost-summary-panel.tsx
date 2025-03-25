"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import type { WorkSpaceConfig, PricingEstimate } from "@/types/workspace"

interface CostSummaryPanelProps {
  config: WorkSpaceConfig
  pricingEstimate: PricingEstimate | null
  isLoading: boolean
}

export default function CostSummaryPanel({ config, pricingEstimate, isLoading }: CostSummaryPanelProps) {
  return (
    <Card className="shadow-sm h-full">
      <CardContent className="p-6">
        <div className="flex justify-between items-center mb-1">
          <h2 className="text-xl font-bold text-gray-900">Cost Summary</h2>
          {pricingEstimate?.pricingSource === "aws" && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 hover:bg-blue-100">
              AWS Pricing
            </Badge>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Estimated costs for {config.numberOfWorkspaces} WorkSpace{config.numberOfWorkspaces > 1 ? "s" : ""}
        </p>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="space-y-4 my-8">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
            <div className="space-y-4 mb-8">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
            <Skeleton className="h-20 w-full" />
          </div>
        ) : !pricingEstimate ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-gray-500">Select configuration options to see pricing estimates</p>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <div className="text-3xl font-bold text-orange-500">
                ${pricingEstimate.totalMonthlyCost.toFixed(2)}
                <span className="text-sm text-gray-500 font-normal">/month</span>
              </div>
              <div className="text-sm text-gray-600">${pricingEstimate.costPerWorkspace.toFixed(2)} per WorkSpace</div>
            </div>

            <div className="space-y-4 mb-8">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Bundle:</span>
                <span className="font-medium">{pricingEstimate.bundleName}</span>
              </div>

              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Billing model:</span>
                <span className="font-medium">{pricingEstimate.billingModel}</span>
              </div>

              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Base cost:</span>
                <span className="font-medium">${pricingEstimate.baseCost.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-4 mb-8">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="font-medium text-gray-800">Total monthly:</span>
                <span className="font-bold text-orange-500">${pricingEstimate.totalMonthlyCost.toFixed(2)}</span>
              </div>

              <div className="flex justify-between py-2">
                <span className="font-medium text-gray-800">Annual estimate:</span>
                <span className="font-bold">${pricingEstimate.annualEstimate.toFixed(2)}</span>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-md text-xs text-gray-600">
              This is an estimate based on your current configuration. Final charges may vary slightly depending on AWS
              billing cycles and actual usage.
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

