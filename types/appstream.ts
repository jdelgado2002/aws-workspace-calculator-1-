export interface AppStreamUsagePattern {
  weekdayDaysCount: number;
  weekdayPeakHoursPerDay: number;
  weekdayOffPeakConcurrentUsers: number;
  weekdayPeakConcurrentUsers: number;
  weekendDaysCount: number;
  weekendPeakHoursPerDay: number;
  weekendOffPeakConcurrentUsers: number;
  weekendPeakConcurrentUsers: number;
}
