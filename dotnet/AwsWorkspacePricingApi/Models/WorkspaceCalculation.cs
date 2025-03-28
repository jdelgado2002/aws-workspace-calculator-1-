using System.Text.Json.Serialization;

namespace AwsWorkspacePricingApi.Models
{
    public class WorkspaceCalculationRequest
    {
        public string Region { get; set; }
        public string BundleId { get; set; }
        public BundleSpecs BundleSpecs { get; set; }
        public string RootVolume { get; set; }
        public string UserVolume { get; set; }
        public string OperatingSystem { get; set; }
        public string RunningMode { get; set; }
        public int NumberOfWorkspaces { get; set; }
        public string BillingOption { get; set; }
        public PoolUsagePattern PoolUsagePattern { get; set; }
        public string License { get; set; }
        public long _lastUpdated { get; set; }
        public string PoolRegion { get; set; }
        public bool IsPoolCalculation { get; set; }
    }

    public class BundleSpecs
    {
        [JsonPropertyName("vCPU")]
        public int VCpu { get; set; }
        public int Memory { get; set; }
        public int Storage { get; set; }
        public string Graphics { get; set; }
    }

    public class PoolUsagePattern
    {
        public int WeekdayDaysCount { get; set; }
        public int WeekdayPeakHoursPerDay { get; set; }
        public int WeekdayOffPeakConcurrentUsers { get; set; }
        public int WeekdayPeakConcurrentUsers { get; set; }
        public int WeekendDaysCount { get; set; }
        public int WeekendPeakHoursPerDay { get; set; }
        public int WeekendOffPeakConcurrentUsers { get; set; }
        public int WeekendPeakConcurrentUsers { get; set; }
    }

    public class WorkspaceCalculationResponse
    {
        public decimal CostPerWorkspace { get; set; }
        public decimal TotalMonthlyCost { get; set; }
        public decimal AnnualEstimate { get; set; }
        public string BundleName { get; set; }
        public string BillingModel { get; set; }
        public decimal BaseCost { get; set; }
        public string PricingSource { get; set; }
        public string License { get; set; }
        public int Storage { get; set; }
        public int RootVolume { get; set; }
        public int UserVolume { get; set; }
        public OriginalConfig OriginalConfig { get; set; }
        public ApiConfig ApiConfig { get; set; }
        public bool VolumeSelectionHonored { get; set; }
    }

    public class OriginalConfig
    {
        public string RootVolume { get; set; }
        public string UserVolume { get; set; }
        public int BundleStorage { get; set; }
    }

    public class ApiConfig
    {
        public string RootVolume { get; set; }
        public string UserVolume { get; set; }
    }
}
