'use client';

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Users, Clock } from "lucide-react";

interface AppStreamUsagePattern {
  weekdayDaysCount: number;
  weekdayPeakHoursPerDay: number;
  weekdayOffPeakConcurrentUsers: number;
  weekdayPeakConcurrentUsers: number;
  weekendDaysCount: number;
  weekendPeakHoursPerDay: number;
  weekendOffPeakConcurrentUsers: number;
  weekendPeakConcurrentUsers: number;
}

interface AppStreamUsagePatternProps {
  value: AppStreamUsagePattern;
  onChange: (updates: Partial<AppStreamUsagePattern>) => void;
}

export function AppStreamUsagePattern({ value, onChange }: AppStreamUsagePatternProps) {
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
              <Label className="text-sm">Peak Concurrent Users</Label>
              <div className="flex items-center space-x-2">
                <Input
                  type="number"
                  value={value.weekdayPeakConcurrentUsers}
                  onChange={(e) => onChange({ weekdayPeakConcurrentUsers: parseInt(e.target.value) || 0 })}
                  min={0}
                  max={100}
                  className="w-20"
                />
                <Slider
                  value={[value.weekdayPeakConcurrentUsers]}
                  onValueChange={(val) => onChange({ weekdayPeakConcurrentUsers: val[0] })}
                  min={0}
                  max={100}
                  step={1}
                  className="flex-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-sm">Off-peak Concurrent Users</Label>
              <div className="flex items-center space-x-2">
                <Input
                  type="number"
                  value={value.weekdayOffPeakConcurrentUsers}
                  onChange={(e) => onChange({ weekdayOffPeakConcurrentUsers: parseInt(e.target.value) || 0 })}
                  min={0}
                  max={100}
                  className="w-20"
                />
                <Slider
                  value={[value.weekdayOffPeakConcurrentUsers]}
                  onValueChange={(val) => onChange({ weekdayOffPeakConcurrentUsers: val[0] })}
                  min={0}
                  max={100}
                  step={1}
                  className="flex-1"
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Weekend section - similar structure to weekday */}
      <Card className="p-4">
        <h3 className="font-medium mb-4 flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Weekend Usage
        </h3>
        {/* Similar weekend inputs... */}
      </Card>
    </div>
  );
}
