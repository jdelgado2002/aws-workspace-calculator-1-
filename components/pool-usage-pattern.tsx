"use client"

import { useState } from "react"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { Clock, Users, Calendar, ChevronDown, ChevronUp, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { PoolUsagePattern } from "@/types/workspace"

interface PoolUsagePatternProps {
  value: PoolUsagePattern
  onChange: (value: Partial<PoolUsagePattern>) => void
  className?: string
}

const DEFAULT_USAGE_PATTERN: PoolUsagePattern = {
  // Weekday defaults (5 days, 8 peak hours per day, 80% utilization during peak)
  weekdayDaysCount: 5,
  weekdayPeakHoursPerDay: 8,
  weekdayOffPeakConcurrentUsers: 10,
  weekdayPeakConcurrentUsers: 80,
  
  // Weekend defaults (2 days, 4 peak hours per day, 40% utilization during peak)
  weekendDaysCount: 2,
  weekendPeakHoursPerDay: 4,
  weekendOffPeakConcurrentUsers: 5,
  weekendPeakConcurrentUsers: 40
}

export function PoolUsagePattern({ value = DEFAULT_USAGE_PATTERN, onChange, className }: PoolUsagePatternProps) {
  const [isWeekdayExpanded, setIsWeekdayExpanded] = useState(true)
  const [isWeekendExpanded, setIsWeekendExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState("weekday")

  // Helper function to create sliders with labels and tooltips
  const renderSlider = (
    label: string, 
    tooltip: string, 
    value: number, 
    onChange: (value: number) => void, 
    min: number, 
    max: number, 
    step: number,
    icon?: React.ReactNode,
    unit?: string
  ) => {
    return (
      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <Label className="text-sm">{label}</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-sm">
                  <p className="text-xs">{tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={value}
              onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
              className="w-16 h-8 text-center"
              min={min}
              max={max}
              step={step}
            />
            {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
          </div>
        </div>
        <Slider
          value={[value]}
          onValueChange={([newValue]) => onChange(newValue)}
          min={min}
          max={max}
          step={step}
          className="py-1"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{min}{unit}</span>
          <span>{max}{unit}</span>
        </div>
      </div>
    )
  }

  return (
    <Card className={cn("border border-muted shadow-sm", className)}>
      <CardContent className="pt-6">
        <div className="mb-4">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            Usage Pattern Configuration
          </h3>
          <p className="text-sm text-muted-foreground">
            Define how your users will utilize the WorkSpaces Pool to optimize costs.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="weekday" className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>Weekday Usage</span>
              <Badge variant="outline" className="ml-1 bg-blue-50 text-blue-600">
                {value.weekdayDaysCount} days
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="weekend" className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>Weekend Usage</span>
              <Badge variant="outline" className="ml-1 bg-blue-50 text-blue-600">
                {value.weekendDaysCount} days
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="weekday" className="space-y-4">
            <div className="bg-muted/40 rounded-md p-4 space-y-4">
              {renderSlider(
                "Days in week", 
                "Number of working days in a week (Monday to Friday).", 
                value.weekdayDaysCount, 
                (newValue) => onChange({ weekdayDaysCount: newValue }), 
                0, 7, 1,
                <Calendar className="h-4 w-4 text-blue-600" />,
                " days"
              )}
              
              {renderSlider(
                "Peak hours per day", 
                "Number of busy hours in a typical weekday.", 
                value.weekdayPeakHoursPerDay, 
                (newValue) => onChange({ weekdayPeakHoursPerDay: newValue }), 
                0, 24, 1,
                <Clock className="h-4 w-4 text-blue-600" />,
                " hrs"
              )}
              
              <div className="bg-blue-50 p-3 rounded border border-blue-100">
                <h4 className="text-sm font-medium text-blue-800 mb-2 flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-600" />
                  Concurrent User Estimates
                </h4>
                
                {renderSlider(
                  "Peak concurrent users", 
                  "Percentage of your max users (currently " + Math.ceil((value.weekdayPeakConcurrentUsers / 100) * 100) + 
                  " out of " + 100 + " users) that will need simultaneous access during peak hours on weekdays.", 
                  value.weekdayPeakConcurrentUsers, 
                  (newValue) => onChange({ weekdayPeakConcurrentUsers: newValue }), 
                  0, 100, 1,
                  undefined,
                  "%"
                )}
                
                {renderSlider(
                  "Off-peak concurrent users", 
                  "Average number of simultaneous users during off-peak hours on weekdays.", 
                  value.weekdayOffPeakConcurrentUsers, 
                  (newValue) => onChange({ weekdayOffPeakConcurrentUsers: newValue }), 
                  0, 100, 1,
                  undefined,
                  "%"
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="weekend" className="space-y-4">
            <div className="bg-muted/40 rounded-md p-4 space-y-4">
              {renderSlider(
                "Days in weekend", 
                "Number of weekend days (Saturday, Sunday).", 
                value.weekendDaysCount, 
                (newValue) => onChange({ weekendDaysCount: newValue }), 
                0, 7, 1,
                <Calendar className="h-4 w-4 text-blue-600" />,
                " days"
              )}
              
              {renderSlider(
                "Peak hours per day", 
                "Number of busy hours in a typical weekend day.", 
                value.weekendPeakHoursPerDay, 
                (newValue) => onChange({ weekendPeakHoursPerDay: newValue }), 
                0, 24, 1,
                <Clock className="h-4 w-4 text-blue-600" />,
                " hrs"
              )}
              
              <div className="bg-blue-50 p-3 rounded border border-blue-100">
                <h4 className="text-sm font-medium text-blue-800 mb-2 flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-600" />
                  Concurrent User Estimates
                </h4>
                
                {renderSlider(
                  "Peak concurrent users", 
                  "Percentage of your max users (currently " + Math.ceil((value.weekendPeakConcurrentUsers / 100) * 100) + 
                  " out of " + 100 + " users) that will need simultaneous access during peak hours on weekends.", 
                  value.weekendPeakConcurrentUsers, 
                  (newValue) => onChange({ weekendPeakConcurrentUsers: newValue }), 
                  0, 100, 1,
                  undefined,
                  "%"
                )}
                
                {renderSlider(
                  "Off-peak concurrent users", 
                  "Average number of simultaneous users during off-peak hours on weekends.", 
                  value.weekendOffPeakConcurrentUsers, 
                  (newValue) => onChange({ weekendOffPeakConcurrentUsers: newValue }), 
                  0, 100, 1,
                  undefined,
                  "%"
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="pt-4 flex justify-between text-sm text-muted-foreground">
          <span>💡 Tip: A usage-based Pool can save you money compared to dedicated WorkSpaces.</span>
        </div>
      </CardContent>
    </Card>
  )
}
