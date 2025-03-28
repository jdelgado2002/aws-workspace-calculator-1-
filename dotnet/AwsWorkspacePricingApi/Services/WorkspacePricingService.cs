using System.Text.Json;
using System.Net.Http.Headers;
using System.IO.Compression;
using AwsWorkspacePricingApi.Models;
using Amazon;
using Amazon.Pricing;
using Amazon.Pricing.Model;
using Amazon.Runtime;

namespace AwsWorkspacePricingApi.Services
{
    public class WorkspacePricingService
    {
        private readonly ILogger<WorkspacePricingService> _logger;
        private readonly HttpClient _httpClient;
        private readonly IAmazonPricing _pricingClient;
        private bool _useAwsSdk;

        public WorkspacePricingService(ILogger<WorkspacePricingService> logger, IHttpClientFactory httpClientFactory, IAmazonPricing pricingClient = null)
        {
            _logger = logger;
            _httpClient = httpClientFactory.CreateClient("AwsPricing");

            // Configure client to handle gzip compression
            _httpClient.DefaultRequestHeaders.AcceptEncoding.Add(new StringWithQualityHeaderValue("gzip"));
            _httpClient.DefaultRequestHeaders.AcceptEncoding.Add(new StringWithQualityHeaderValue("deflate"));

            // Accept JSON responses
            _httpClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            // Initialize AWS Pricing client if not provided (for testing purposes)
            _pricingClient = pricingClient ?? new AmazonPricingClient(new AnonymousAWSCredentials(), new AmazonPricingConfig
            {
                RegionEndpoint = RegionEndpoint.USEast1 // Pricing API is only available in us-east-1
            });

            // Start with SDK disabled since we're having authentication issues
            _useAwsSdk = false;

            _logger.LogInformation("Using public pricing API for calculations due to potential authentication limits.");
        }

        public async Task<WorkspaceCalculationResponse> CalculatePricing(WorkspaceCalculationRequest request)
        {
            _logger.LogInformation($"Calculating pricing for bundle: {request.BundleId} in region: {request.Region}");

            try
            {
                // Get the original region name from AWS region code
                string originalRegionName = GetOriginalRegionName(request.Region);

                // Use license information from the request
                string apiLicense = request.License?.ToLowerInvariant() == "bring-your-own-license" ?
                    "Bring Your Own License" : "Included";

                // Get bundle name from bundle ID
                string bundleName = GetBundleName(request.BundleId);

                // Fetch pricing data from AWS API
                var pricingResult = await FetchAwsPricingData(originalRegionName, bundleName, request);

                if (pricingResult != null)
                {
                    return pricingResult;
                }

                // Calculate estimated pricing as fallback
                return CalculateEstimatedPricing(request, bundleName, apiLicense);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error calculating WorkSpace pricing");

                // Provide fallback pricing if calculation fails
                return FallbackPricingEstimate(request);
            }
        }

        private async Task<WorkspaceCalculationResponse?> FetchAwsPricingData(
            string regionName, string bundleName, WorkspaceCalculationRequest request)
        {
            try
            {
                // Set defaults for unspecified fields
                if (string.IsNullOrEmpty(request.License))
                {
                    request.License = "included";
                    _logger.LogInformation("License not specified, using default: included");
                }

                // Determine API parameters
                string apiOperatingSystem = request.OperatingSystem == "windows" ? "Windows" : "Any";
                string apiLicense = request.License?.ToLowerInvariant() == "bring-your-own-license" ?
                    "Bring Your Own License" : "Included";
                string apiRunningMode = request.RunningMode == "always-on" ? "AlwaysOn" : "AutoStop";

                _logger.LogInformation("Using direct AWS calculator API for pricing data");

                // Continue with direct API call to public calculator endpoint
                var encodedRegion = Uri.EscapeDataString(regionName);

                string aggregationUrl = $"https://calculator.aws/pricing/2.0/meteredUnitMaps/workspaces/USD/current/workspaces-core-calc/{encodedRegion}/primary-selector-aggregations.json";
                _logger.LogInformation($"Fetching aggregation data from AWS calculator API: {aggregationUrl}");

                // Use a safe way to get the response and handle possible compression
                var aggregationResponse = await _httpClient.GetAsync(aggregationUrl);

                if (aggregationResponse.IsSuccessStatusCode)
                {
                    string aggregationJsonString;

                    // Check if the response is compressed
                    if (aggregationResponse.Content.Headers.ContentEncoding.Contains("gzip"))
                    {
                        using var responseStream = await aggregationResponse.Content.ReadAsStreamAsync();
                        using var decompressedStream = new GZipStream(responseStream, CompressionMode.Decompress);
                        using var reader = new StreamReader(decompressedStream);
                        aggregationJsonString = await reader.ReadToEndAsync();
                    }
                    else
                    {
                        aggregationJsonString = await aggregationResponse.Content.ReadAsStringAsync();
                    }

                    _logger.LogDebug($"Received aggregation data: {aggregationJsonString.Substring(0, Math.Min(100, aggregationJsonString.Length))}...");

                    try
                    {
                        var aggregationData = JsonDocument.Parse(aggregationJsonString);

                        if (aggregationData.RootElement.TryGetProperty("aggregations", out var aggregations))
                        {
                            // Find matching bundle, volumes, OS, license, and running mode
                            string? matchingBundleDescription = null;
                            string? matchingRootVolume = null;
                            string? matchingUserVolume = null;
                            bool hasMatch = false;

                            // Process aggregations to find matches
                            foreach (var item in aggregations.EnumerateArray())
                            {
                                if (!item.TryGetProperty("selectors", out var selectors))
                                    continue;

                                if (!selectors.TryGetProperty("Bundle Description", out var bundleDesc))
                                    continue;

                                string? bundleDescription = bundleDesc.GetString();

                                // Check if bundle description contains our bundle name
                                if (bundleDescription != null && bundleDescription.Contains(bundleName, StringComparison.OrdinalIgnoreCase))
                                {
                                    matchingBundleDescription = bundleDescription;

                                    // Find matching root and user volumes
                                    if (selectors.TryGetProperty("rootVolume", out var rootVolume))
                                    {
                                        string? rootVolumeStr = rootVolume.GetString();
                                        if (rootVolumeStr != null && rootVolumeStr.StartsWith(request.RootVolume))
                                        {
                                            matchingRootVolume = rootVolumeStr;
                                        }
                                    }

                                    if (selectors.TryGetProperty("userVolume", out var userVolume))
                                    {
                                        string? userVolumeStr = userVolume.GetString();
                                        if (userVolumeStr != null && userVolumeStr.StartsWith(request.UserVolume))
                                        {
                                            matchingUserVolume = userVolumeStr;
                                        }
                                    }

                                    if (matchingRootVolume != null && matchingUserVolume != null)
                                    {
                                        hasMatch = true;
                                        break;
                                    }
                                }
                            }

                            if (hasMatch && matchingBundleDescription != null && matchingRootVolume != null && matchingUserVolume != null)
                            {
                                // Construct URL for pricing - this is still needed as the AWS SDK doesn't provide the detailed pricing we need
                                string pricingUrlParams = string.Join("/", new[]
                                {
                                    encodedRegion,
                                    Uri.EscapeDataString(matchingBundleDescription),
                                    Uri.EscapeDataString(matchingRootVolume),
                                    Uri.EscapeDataString(matchingUserVolume),
                                    Uri.EscapeDataString(apiOperatingSystem),
                                    Uri.EscapeDataString(apiLicense),
                                    Uri.EscapeDataString(apiRunningMode),
                                    Uri.EscapeDataString("WorkSpaces Core")
                                });

                                string pricingUrl = $"https://calculator.aws/pricing/2.0/meteredUnitMaps/workspaces/USD/current/workspaces-core-calc/{pricingUrlParams}/index.json";
                                _logger.LogInformation($"Fetching detailed pricing from AWS calculator API: {pricingUrl}");

                                var pricingResponse = await _httpClient.GetAsync(pricingUrl);

                                if (pricingResponse.IsSuccessStatusCode)
                                {
                                    string pricingJsonString;

                                    // Check if the response is compressed
                                    if (pricingResponse.Content.Headers.ContentEncoding.Contains("gzip"))
                                    {
                                        using var responseStream = await pricingResponse.Content.ReadAsStreamAsync();
                                        using var decompressedStream = new GZipStream(responseStream, CompressionMode.Decompress);
                                        using var reader = new StreamReader(decompressedStream);
                                        pricingJsonString = await reader.ReadToEndAsync();
                                    }
                                    else
                                    {
                                        pricingJsonString = await pricingResponse.Content.ReadAsStringAsync();
                                    }

                                    _logger.LogDebug($"Received pricing data: {pricingJsonString.Substring(0, Math.Min(100, pricingJsonString.Length))}...");

                                    try
                                    {
                                        var pricingData = JsonDocument.Parse(pricingJsonString);

                                        if (pricingData.RootElement.TryGetProperty("regions", out var regions) &&
                                            regions.TryGetProperty(regionName, out var region))
                                        {
                                            // Calculate total price from the pricing data
                                            decimal totalPrice = 0;
                                            foreach (var priceInfo in region.EnumerateObject())
                                            {
                                                if (priceInfo.Value.TryGetProperty("price", out var price))
                                                {
                                                    string? priceStr = price.GetString();
                                                    if (priceStr != null && decimal.TryParse(priceStr, out decimal priceValue))
                                                    {
                                                        totalPrice += priceValue;
                                                    }
                                                }
                                            }

                                            // Parse root and user volume sizes from the API
                                            int rootVolumeSize = ParseVolumeSize(matchingRootVolume);
                                            int userVolumeSize = ParseVolumeSize(matchingUserVolume);
                                            int totalStorage = rootVolumeSize + userVolumeSize;

                                            // Create the response
                                            var response = new WorkspaceCalculationResponse
                                            {
                                                CostPerWorkspace = totalPrice,
                                                TotalMonthlyCost = totalPrice * request.NumberOfWorkspaces,
                                                AnnualEstimate = totalPrice * request.NumberOfWorkspaces * 12,
                                                BundleName = bundleName,
                                                BillingModel = request.BillingOption == "monthly" ? "Monthly" : "Hourly",
                                                BaseCost = totalPrice,
                                                PricingSource = "aws-api",
                                                License = apiLicense,
                                                Storage = totalStorage,
                                                RootVolume = rootVolumeSize,
                                                UserVolume = userVolumeSize,
                                                OriginalConfig = new OriginalConfig
                                                {
                                                    RootVolume = request.RootVolume,
                                                    UserVolume = request.UserVolume,
                                                    BundleStorage = request.BundleSpecs.Storage
                                                },
                                                ApiConfig = new ApiConfig
                                                {
                                                    RootVolume = matchingRootVolume,
                                                    UserVolume = matchingUserVolume
                                                },
                                                VolumeSelectionHonored = request.RootVolume == rootVolumeSize.ToString() &&
                                                                        request.UserVolume == userVolumeSize.ToString()
                                            };

                                            return response;
                                        }
                                    }
                                    catch (JsonException jsonEx)
                                    {
                                        _logger.LogError(jsonEx, $"Failed to parse pricing JSON data for URL: {pricingUrl}");
                                        return null;
                                    }
                                }
                                else
                                {
                                    _logger.LogWarning($"Failed to fetch pricing data. Status code: {pricingResponse.StatusCode}");
                                    _logger.LogWarning($"Response content: {await pricingResponse.Content.ReadAsStringAsync()}");
                                }
                            }
                        }
                    }
                    catch (JsonException jsonEx)
                    {
                        _logger.LogError(jsonEx, $"Failed to parse aggregation JSON data for URL: {aggregationUrl}");
                        return null;
                    }
                }
                else
                {
                    _logger.LogWarning($"Failed to fetch aggregation data. Status code: {aggregationResponse.StatusCode}");
                    _logger.LogWarning($"Response content: {await aggregationResponse.Content.ReadAsStringAsync()}");
                }

                _logger.LogWarning("Could not find exact pricing from AWS API, falling back to estimated pricing");
                return null;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching AWS pricing data");
                return null;
            }
        }

        private int ParseVolumeSize(string volumeString)
        {
            // Parse volume size from "XXX GB" format
            if (volumeString == null) return 0;

            string volumeSizeStr = volumeString.Replace(" GB", "").Trim();
            if (int.TryParse(volumeSizeStr, out int volumeSize))
            {
                return volumeSize;
            }

            return 0;
        }

        private WorkspaceCalculationResponse CalculateEstimatedPricing(
            WorkspaceCalculationRequest request,
            string bundleName,
            string license)
        {
            // Fallback pricing estimation based on bundle and specs
            decimal baseCost = EstimateBundlePrice(
                request.BundleId,
                request.OperatingSystem,
                request.RunningMode);

            // Default storage values - try to parse from request or use defaults
            int rootVolume = int.TryParse(request.RootVolume, out int rv) ? rv : 80;
            int userVolume = int.TryParse(request.UserVolume, out int uv) ? uv : 50;

            // Calculate total costs
            decimal costPerWorkspace = baseCost;
            decimal totalMonthlyCost = costPerWorkspace * request.NumberOfWorkspaces;
            decimal annualEstimate = totalMonthlyCost * 12;

            return new WorkspaceCalculationResponse
            {
                CostPerWorkspace = costPerWorkspace,
                TotalMonthlyCost = totalMonthlyCost,
                AnnualEstimate = annualEstimate,
                BundleName = bundleName,
                BillingModel = request.BillingOption == "monthly" ? "Monthly" : "Hourly",
                BaseCost = baseCost,
                PricingSource = "calculated",
                License = license,
                Storage = rootVolume + userVolume,
                RootVolume = rootVolume,
                UserVolume = userVolume,
                OriginalConfig = new OriginalConfig
                {
                    RootVolume = request.RootVolume,
                    UserVolume = request.UserVolume,
                    BundleStorage = request.BundleSpecs.Storage
                },
                ApiConfig = new ApiConfig
                {
                    RootVolume = $"{rootVolume} GB",
                    UserVolume = $"{userVolume} GB"
                },
                VolumeSelectionHonored = true
            };
        }

        private WorkspaceCalculationResponse FallbackPricingEstimate(WorkspaceCalculationRequest request)
        {
            // Provide a default pricing estimate if all calculations fail
            decimal baseCost = 21; // Default to Value bundle
            decimal costPerWorkspace = baseCost;
            decimal totalMonthlyCost = costPerWorkspace * request.NumberOfWorkspaces;
            decimal annualEstimate = totalMonthlyCost * 12;

            return new WorkspaceCalculationResponse
            {
                CostPerWorkspace = costPerWorkspace,
                TotalMonthlyCost = totalMonthlyCost,
                AnnualEstimate = annualEstimate,
                BundleName = "Value (Default)",
                BillingModel = "Monthly",
                BaseCost = baseCost,
                PricingSource = "calculated",
                License = "Bring Your Own License",
                Storage = 130,
                RootVolume = 80,
                UserVolume = 50,
                OriginalConfig = new OriginalConfig
                {
                    RootVolume = request.RootVolume,
                    UserVolume = request.UserVolume,
                    BundleStorage = request.BundleSpecs?.Storage ?? 80
                },
                ApiConfig = new ApiConfig
                {
                    RootVolume = "80 GB",
                    UserVolume = "50 GB"
                },
                VolumeSelectionHonored = true
            };
        }

        private string GetOriginalRegionName(string regionCode)
        {
            // Map AWS region codes to full region names
            Dictionary<string, string> regionMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                { "us-east-1", "US East (N. Virginia)" },
                { "us-east-2", "US East (Ohio)" },
                { "us-west-1", "US West (N. California)" },
                { "us-west-2", "US West (Oregon)" },
                { "eu-west-1", "EU (Ireland)" },
                { "eu-west-2", "EU (London)" },
                { "eu-west-3", "EU (Paris)" },
                { "eu-central-1", "EU (Frankfurt)" },
                { "ap-northeast-1", "Asia Pacific (Tokyo)" },
                { "ap-northeast-2", "Asia Pacific (Seoul)" },
                { "ap-northeast-3", "Asia Pacific (Osaka)" },
                { "ap-southeast-1", "Asia Pacific (Singapore)" },
                { "ap-southeast-2", "Asia Pacific (Sydney)" },
                { "ap-south-1", "Asia Pacific (Mumbai)" },
                { "sa-east-1", "South America (São Paulo)" },
                { "ca-central-1", "Canada (Central)" },
                { "us-gov-west-1", "AWS GovCloud (US)" },
                { "us-gov-east-1", "AWS GovCloud (US-East)" },
                { "il-central-1", "Israel (Tel Aviv)" }
            };

            return regionMap.TryGetValue(regionCode, out string regionName) ?
                regionName : "US West (Oregon)"; // Default to Oregon if not found
        }

        private string GetBundleName(string bundleId)
        {
            // Map bundle IDs to bundle names
            Dictionary<string, string> bundleMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                { "value", "Value" },
                { "standard", "Standard" },
                { "performance", "Performance" },
                { "power", "Power" },
                { "powerpro", "PowerPro" },
                { "graphics", "Graphics" },
                { "graphicspro", "GraphicsPro" },
                { "graphics-g4dn", "Graphics.g4dn" },
                { "graphicspro-g4dn", "GraphicsPro.g4dn" },
                { "general-16", "General Purpose (16 vCPU)" },
                { "general-32", "General Purpose (32 vCPU)" }
            };

            // Check each key against the bundleId
            foreach (var entry in bundleMap)
            {
                if (bundleId.Contains(entry.Key, StringComparison.OrdinalIgnoreCase))
                {
                    return entry.Value;
                }
            }

            return "Custom Bundle";
        }

        private decimal EstimateBundlePrice(string bundleId, string operatingSystem, string runningMode)
        {
            // Fallback pricing estimation based on bundle type and mode
            var bundleName = GetBundleName(bundleId);
            decimal price;

            if (runningMode == "auto-stop")
            {
                // For AutoStop, assume 160 hours per month (typical business usage)
                Dictionary<string, decimal> autoStopPrices = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase)
                {
                    { "Value", 0.26m * 160 },
                    { "Standard", 0.43m * 160 },
                    { "Performance", 0.57m * 160 },
                    { "Power", 0.82m * 160 },
                    { "PowerPro", 1.53m * 160 },
                    { "Graphics", 1.14m * 160 },
                    { "GraphicsPro", 2.30m * 160 },
                    { "Graphics.g4dn", 0.90m * 160 },
                    { "GraphicsPro.g4dn", 1.75m * 160 }
                };

                if (autoStopPrices.TryGetValue(bundleName, out decimal bundlePrice))
                {
                    price = bundlePrice;
                }
                else
                {
                    // Default price for custom bundles
                    price = 0.50m * 160;
                }
            }
            else
            {
                // Monthly AlwaysOn prices
                Dictionary<string, decimal> alwaysOnPrices = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase)
                {
                    { "Value", 21m },
                    { "Standard", 35m },
                    { "Performance", 60m },
                    { "Power", 80m },
                    { "PowerPro", 124m },
                    { "Graphics", 57m },
                    { "GraphicsPro", 85m },
                    { "Graphics.g4dn", 45m },
                    { "GraphicsPro.g4dn", 70m }
                };

                if (alwaysOnPrices.TryGetValue(bundleName, out decimal bundlePrice))
                {
                    price = bundlePrice;
                }
                else
                {
                    // Default price for custom bundles
                    price = 50m;
                }
            }

            // Adjust price for OS (Windows typically more expensive than BYOL)
            if (operatingSystem == "windows")
            {
                price *= 1.1m; // 10% premium for Windows
            }

            return price;
        }
    }
}
