using System.Text.Json;
using System.IO.Compression;

namespace AwsWorkspacePricingApi.Utilities
{
    public class PricingDataFetcher
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<PricingDataFetcher> _logger;
        private readonly Dictionary<string, string> _cache = new();
        private readonly string _cacheDirectory;

        public PricingDataFetcher(HttpClient httpClient, ILogger<PricingDataFetcher> logger)
        {
            _httpClient = httpClient;
            _logger = logger;

            // Create cache directory in temp folder
            _cacheDirectory = Path.Combine(Path.GetTempPath(), "AwsWorkspacePricingCache");
            Directory.CreateDirectory(_cacheDirectory);

            _logger.LogInformation($"Pricing data cache directory: {_cacheDirectory}");
        }

        public async Task<JsonDocument?> FetchJson(string url, bool useCache = true)
        {
            try
            {
                string cacheKey = GetCacheKey(url);
                string cacheFilePath = Path.Combine(_cacheDirectory, cacheKey);

                // Try to get from cache first
                if (useCache && File.Exists(cacheFilePath))
                {
                    _logger.LogInformation($"Using cached data for {url}");
                    string cachedJson = await File.ReadAllTextAsync(cacheFilePath);
                    return JsonDocument.Parse(cachedJson);
                }

                // Fetch from API
                _logger.LogInformation($"Fetching data from {url}");
                var response = await _httpClient.GetAsync(url);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning($"Failed to fetch data from {url}, status: {response.StatusCode}");
                    return null;
                }

                string jsonContent;

                // Handle gzip compression
                if (response.Content.Headers.ContentEncoding.Contains("gzip"))
                {
                    using var stream = await response.Content.ReadAsStreamAsync();
                    using var gzipStream = new GZipStream(stream, CompressionMode.Decompress);
                    using var reader = new StreamReader(gzipStream);
                    jsonContent = await reader.ReadToEndAsync();
                }
                else
                {
                    jsonContent = await response.Content.ReadAsStringAsync();
                }

                // Validate it's proper JSON
                var jsonDocument = JsonDocument.Parse(jsonContent);

                // Cache the result
                await File.WriteAllTextAsync(cacheFilePath, jsonContent);

                return jsonDocument;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error fetching or parsing JSON from {url}");
                return null;
            }
        }

        private string GetCacheKey(string url)
        {
            // Create a safe filename from the URL
            return Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(url))
                .Replace('/', '_')
                .Replace('+', '-')
                .Replace('=', '~') + ".json";
        }
    }
}
