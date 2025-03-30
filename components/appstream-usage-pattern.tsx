'use client';

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Users, Clock, AlertCircle } from "lucide-react";
import type { AppStreamUsagePattern } from "@/types/appstream";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface AppStreamUsagePatternProps {
  value: AppStreamUsagePattern;
  onChange: (updates: Partial<AppStreamUsagePattern>) => void;
  maxUsers: number; // Add maxUsers prop to limit concurrent users
}

export function AppStreamUsagePattern({ value, onChange, maxUsers = 100 }: AppStreamUsagePatternProps) {
  // Helper function to validate concurrent user input
  const validateConcurrentUsers = (inputValue: number): number => {
    return Math.min(Math.max(0, inputValue), maxUsers);
  };

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h3 className="font-medium mb-4 flex items-center gap-2">
          <Users className="h-4 w-4" />
          Weekday Usage
        </h3>
        <div className="space-y-4">
          <div>
            <Label className="text-sm">Days per Week</Label>
            <div className="flex items-center space-x-2">
              <Input
                type="number"
                value={value.weekdayDaysCount}
                onChange={(e) => onChange({ weekdayDaysCount: parseInt(e.target.value) || 0 })}
                min={0}
                max={7}
                className="w-20"
              />
              <Slider
                value={[value.weekdayDaysCount]}
                onValueChange={(val) => onChange({ weekdayDaysCount: val[0] })}
                min={0}
                max={7}
                step={1}
                className="flex-1"
              />
            </div>
          </div>

          <div>
            <Label className="text-sm">Peak Hours per Day</Label>
            <div className="flex items-center space-x-2">
              <Input
                type="number"
                value={value.weekdayPeakHoursPerDay}
                onChange={(e) => onChange({ weekdayPeakHoursPerDay: parseInt(e.target.value) || 0 })}
                min={0}
                max={24}
                className="w-20"
              />
              <Slider
                value={[value.weekdayPeakHoursPerDay]}
                onValueChange={(val) => onChange({ weekdayPeakHoursPerDay: val[0] })}
                min={0}
                max={24}
                step={1}
                className="flex-1"
              />
            </div>
          </div>

          {/* Concurrent users sliders */}
          <div className="space-y-4">
            <div>
              <div className="flex justify-between">
                <Label className="text-sm">Peak Concurrent Users</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="inline-flex items-center">
                      <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="w-[200px] text-xs">
                        Cannot exceed total user count of {maxUsers}. 
                        This represents the maximum number of users accessing the system simultaneously during peak hours.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex items-center space-x-2">
                <Input
                  type="number"
                  value={value.weekdayPeakConcurrentUsers}
                  onChange={(e) => {
                    const inputValue = parseInt(e.target.value) || 0;
                    onChange({ weekdayPeakConcurrentUsers: validateConcurrentUsers(inputValue) });
                  }}
                  min={0}
                  max={maxUsers}
                  className="w-20"
                />
                <Slider
                  value={[value.weekdayPeakConcurrentUsers]}
                  onValueChange={(val) => onChange({ weekdayPeakConcurrentUsers: validateConcurrentUsers(val[0]) })}
                  min={0}
                  max={maxUsers}
                  step={1}
                  className="flex-1"
                />
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {Math.round((value.weekdayPeakConcurrentUsers / maxUsers) * 100)}% of total users
              </div>
            </div>

            <div>
              <div className="flex justify-between">
                <Label className="text-sm">Off-peak Concurrent Users</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="inline-flex items-center">
                      <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="w-[200px] text-xs">
                        Cannot exceed total user count of {maxUsers}.
                        This represents users accessing the system during off-peak hours.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex items-center space-x-2">
                <Input
                  type="number"
                  value={value.weekdayOffPeakConcurrentUsers}
                  onChange={(e) => {
                    const inputValue = parseInt(e.target.value) || 0;
                    onChange({ weekdayOffPeakConcurrentUsers: validateConcurrentUsers(inputValue) });
                  }}
                  min={0}
                  max={maxUsers}
                  className="w-20"
                />
                <Slider
                  value={[value.weekdayOffPeakConcurrentUsers]}
                  onValueChange={(val) => onChange({ weekdayOffPeakConcurrentUsers: validateConcurrentUsers(val[0]) })}
                  min={0}
                  max={maxUsers}
                  step={1}
                  className="flex-1"
                />
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {Math.round((value.weekdayOffPeakConcurrentUsers / maxUsers) * 100)}% of total users
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Weekend section with complete implementation */}
      <Card className="p-4">
        <h3 className="font-medium mb-4 flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Weekend Usage
        </h3>
        <div className="space-y-4">
          <div>
            <Label className="text-sm">Days per Weekend</Label>
            <div className="flex items-center space-x-2">
              <Input
                type="number"
                value={value.weekendDaysCount}
                onChange={(e) => onChange({ weekendDaysCount: parseInt(e.target.value) || 0 })}
                min={0}
                max={7}
                className="w-20"
              />
              <Slider
                value={[value.weekendDaysCount]}
                onValueChange={(val) => onChange({ weekendDaysCount: val[0] })}
                min={0}
                max={7}
                step={1}
                className="flex-1"
              />
            </div>
          </div>

          <div>
            <Label className="text-sm">Peak Hours per Day</Label>
            <div className="flex items-center space-x-2">
              <Input
                type="number"
                value={value.weekendPeakHoursPerDay}
                onChange={(e) => onChange({ weekendPeakHoursPerDay: parseInt(e.target.value) || 0 })}
                min={0}
                max={24}
                className="w-20"
              />
              <Slider
                value={[value.weekendPeakHoursPerDay]}
                onValueChange={(val) => onChange({ weekendPeakHoursPerDay: val[0] })}
                min={0}
                max={24}
                step={1}
                className="flex-1"
              />
            </div>
          </div>

          {/* Concurrent users sliders */}
          <div className="space-y-4">
            <div>
              <div className="flex justify-between">
                <Label className="text-sm">Peak Concurrent Users</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="inline-flex items-center">
                      <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="w-[200px] text-xs">
                        Cannot exceed total user count of {maxUsers}.
                        This represents weekend peak usage.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex items-center space-x-2">
                <Input
                  type="number"
                  value={value.weekendPeakConcurrentUsers}
                  onChange={(e) => {
                    const inputValue = parseInt(e.target.value) || 0;
                    onChange({ weekendPeakConcurrentUsers: validateConcurrentUsers(inputValue) });
                  }}
                  min={0}
                  max={maxUsers}
                  className="w-20"
                />
                <Slider
                  value={[value.weekendPeakConcurrentUsers]}
                  onValueChange={(val) => onChange({ weekendPeakConcurrentUsers: validateConcurrentUsers(val[0]) })}
                  min={0}
                  max={maxUsers}
                  step={1}
                  className="flex-1"
                />
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {Math.round((value.weekendPeakConcurrentUsers / maxUsers) * 100)}% of total users
              </div>
            </div>

            <div>
              <div className="flex justify-between">
                <Label className="text-sm">Off-peak Concurrent Users</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="inline-flex items-center">
                      <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="w-[200px] text-xs">
                        Cannot exceed total user count of {maxUsers}.
                        This represents weekend off-peak usage.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex items-center space-x-2">
                <Input
                  type="number"
                  value={value.weekendOffPeakConcurrentUsers}
                  onChange={(e) => {
                    const inputValue = parseInt(e.target.value) || 0;
                    onChange({ weekendOffPeakConcurrentUsers: validateConcurrentUsers(inputValue) });
                  }}
                  min={0}
                  max={maxUsers}
                  className="w-20"
                />
                <Slider
                  value={[value.weekendOffPeakConcurrentUsers]}
                  onValueChange={(val) => onChange({ weekendOffPeakConcurrentUsers: validateConcurrentUsers(val[0]) })}
                  min={0}
                  max={maxUsers}
                  step={1}
                  className="flex-1"
                />
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {Math.round((value.weekendOffPeakConcurrentUsers / maxUsers) * 100)}% of total users
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Add a calculation summary if needed */}
      <Card className="p-4 bg-blue-50">
        <h3 className="font-medium mb-2 text-sm text-blue-800">Hours Calculation Preview</h3>
        <div className="text-xs space-y-1 text-blue-600">
          <div>
            <span>Weekday peak hours: </span>
            <span className="font-medium">{value.weekdayPeakHoursPerDay * value.weekdayDaysCount * 4.35} hours/month</span>
          </div>
          <div>
            <span>Weekday off-peak hours: </span>
            <span className="font-medium">{(24 * value.weekdayDaysCount - value.weekdayPeakHoursPerDay * value.weekdayDaysCount) * 4.35} hours/month</span>
          </div>
          <div>
            <span>Weekend peak hours: </span>
            <span className="font-medium">{value.weekendPeakHoursPerDay * value.weekendDaysCount * 4.35} hours/month</span>
          </div>
          <div>
            <span>Weekend off-peak hours: </span>
            <span className="font-medium">{(24 * value.weekendDaysCount - value.weekendPeakHoursPerDay * value.weekendDaysCount) * 4.35} hours/month</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
