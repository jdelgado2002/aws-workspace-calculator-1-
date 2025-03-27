import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getRegionLabel(regionCode: string): string {
  // Map of AWS region codes to human-readable names
  const regionMap: Record<string, string> = {
    'us-east-1': 'US East (N. Virginia)',
    'us-east-2': 'US East (Ohio)',
    'us-west-1': 'US West (N. California)',
    'us-west-2': 'US West (Oregon)',
    'af-south-1': 'Africa (Cape Town)',
    'ap-east-1': 'Asia Pacific (Hong Kong)',
    'ap-south-1': 'Asia Pacific (Mumbai)',
    'ap-northeast-3': 'Asia Pacific (Osaka)',
    'ap-northeast-2': 'Asia Pacific (Seoul)',
    'ap-southeast-1': 'Asia Pacific (Singapore)',
    'ap-southeast-2': 'Asia Pacific (Sydney)',
    'ap-northeast-1': 'Asia Pacific (Tokyo)',
    'ca-central-1': 'Canada (Central)',
    'eu-central-1': 'Europe (Frankfurt)',
    'eu-west-1': 'Europe (Ireland)',
    'eu-west-2': 'Europe (London)',
    'eu-south-1': 'Europe (Milan)',
    'eu-west-3': 'Europe (Paris)',
    'eu-north-1': 'Europe (Stockholm)',
    'me-south-1': 'Middle East (Bahrain)',
    'sa-east-1': 'South America (São Paulo)',
    'us-gov-east-1': 'AWS GovCloud (US-East)',
    'us-gov-west-1': 'AWS GovCloud (US)',
  };

  // Return the friendly name if found, otherwise return the code
  return regionMap[regionCode] || regionCode;
}

// Add a function to get region code from full name
export function getRegionCode(regionName: string): string {
  // Create a reverse mapping of the region names to codes
  const regionMap: Record<string, string> = {
    'US East (N. Virginia)': 'us-east-1',
    'US East (Ohio)': 'us-east-2',
    'US West (N. California)': 'us-west-1',
    'US West (Oregon)': 'us-west-2',
    'Africa (Cape Town)': 'af-south-1',
    'Asia Pacific (Hong Kong)': 'ap-east-1',
    'Asia Pacific (Mumbai)': 'ap-south-1',
    'Asia Pacific (Osaka)': 'ap-northeast-3',
    'Asia Pacific (Seoul)': 'ap-northeast-2',
    'Asia Pacific (Singapore)': 'ap-southeast-1',
    'Asia Pacific (Sydney)': 'ap-southeast-2',
    'Asia Pacific (Tokyo)': 'ap-northeast-1',
    'Canada (Central)': 'ca-central-1',
    'Europe (Frankfurt)': 'eu-central-1',
    'EU (Ireland)': 'eu-west-1',
    'Europe (Ireland)': 'eu-west-1',
    'EU (London)': 'eu-west-2',
    'Europe (London)': 'eu-west-2',
    'Europe (Milan)': 'eu-south-1',
    'Europe (Paris)': 'eu-west-3',
    'Europe (Stockholm)': 'eu-north-1',
    'Middle East (Bahrain)': 'me-south-1',
    'South America (São Paulo)': 'sa-east-1',
    'South America (Sao Paulo)': 'sa-east-1',
    'AWS GovCloud (US-East)': 'us-gov-east-1',
    'AWS GovCloud (US)': 'us-gov-west-1',
  };

  // First try direct match
  if (regionMap[regionName]) {
    return regionMap[regionName];
  }

  // If no direct match, try case-insensitive search
  const lowerName = regionName.toLowerCase();
  for (const [name, code] of Object.entries(regionMap)) {
    if (name.toLowerCase() === lowerName) {
      return code;
    }
  }

  // If still no match, return the original string
  return regionName;
}
