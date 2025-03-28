using Amazon.Runtime;
using Microsoft.Extensions.Configuration;

namespace AwsWorkspacePricingApi.Services
{
    public static class AwsCredentialsHelper
    {
        public static AWSCredentials GetAwsCredentials(IConfiguration configuration)
        {
            // First try to get from environment variables
            var accessKey = Environment.GetEnvironmentVariable("AWS_ACCESS_KEY_ID");
            var secretKey = Environment.GetEnvironmentVariable("AWS_SECRET_ACCESS_KEY");

            if (!string.IsNullOrEmpty(accessKey) && !string.IsNullOrEmpty(secretKey))
            {
                return new BasicAWSCredentials(accessKey, secretKey);
            }

            // Try from configuration
            if (configuration["AWS:AccessKeyId"] != null && configuration["AWS:SecretAccessKey"] != null)
            {
                return new BasicAWSCredentials(
                    configuration["AWS:AccessKeyId"],
                    configuration["AWS:SecretAccessKey"]);
            }

            // If a profile is specified, use it
            var profileName = configuration["AWS:Profile"];
            if (!string.IsNullOrEmpty(profileName))
            {
                return new StoredProfileAWSCredentials(profileName);
            }

            // Fallback to default
            return new StoredProfileAWSCredentials();
        }
    }
}
