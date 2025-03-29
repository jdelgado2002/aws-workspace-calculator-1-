// AWS regions with their codes and display names
export const regions = [
  { code: 'us-east-1', name: 'US East (N. Virginia)' },
  { code: 'us-east-2', name: 'US East (Ohio)' },
  { code: 'us-west-2', name: 'US West (Oregon)' },
  { code: 'ap-northeast-1', name: 'Asia Pacific (Tokyo)' },
  { code: 'ap-southeast-1', name: 'Asia Pacific (Singapore)' },
  { code: 'ap-southeast-2', name: 'Asia Pacific (Sydney)' },
  { code: 'ap-south-1', name: 'Asia Pacific (Mumbai)' },
  { code: 'ap-northeast-2', name: 'Asia Pacific (Seoul)' },
  { code: 'eu-central-1', name: 'EU (Frankfurt)' },
  { code: 'eu-west-1', name: 'EU (Ireland)' },
  { code: 'eu-west-2', name: 'EU (London)' },
  { code: 'ca-central-1', name: 'Canada (Central)' },
  { code: 'sa-east-1', name: 'South America (Sao Paulo)' },
  { code: 'us-gov-west-1', name: 'AWS GovCloud (US)' },
  { code: 'us-gov-east-1', name: 'AWS GovCloud (US-East)' }
] as const;

export type RegionCode = typeof regions[number]['code'];
