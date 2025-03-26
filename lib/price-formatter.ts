/**
 * Standardizes price display and value handling throughout the application
 */

/**
 * Formats a price for API storage - ensures consistent number of decimal places
 * @param price The price to format
 * @returns A number with exactly 2 decimal places
 */
export function formatPriceForStorage(price: number): number {
  return Math.round(price * 100) / 100;
}

/**
 * Formats a price for display in the UI
 * @param price The price to format
 * @param includeUnit Whether to include the "/mo" unit
 * @returns A string with the formatted price
 */
export function formatPriceForDisplay(price: number, includeUnit: boolean = true): string {
  // Format with exactly 2 decimal places and add dollar sign
  const formattedPrice = `$${price.toFixed(2)}`;
  
  // Add unit if requested
  return includeUnit ? `${formattedPrice}/mo` : formattedPrice;
}

/**
 * Formats an hourly price for display in the UI
 * @param price The hourly price to format
 * @returns A string with the formatted hourly price
 */
export function formatHourlyPriceForDisplay(price: number): string {
  return `$${price.toFixed(3)}/hr`;
}

/**
 * Ensures pricing values are consistent between all components
 * @param rawPrice The raw price value
 */
export function getStandardizedPricing(rawPrice: number) {
  const price = formatPriceForStorage(rawPrice);
  
  return {
    price,
    displayPrice: formatPriceForDisplay(price),
    numericPrice: price // For calculations
  };
}
