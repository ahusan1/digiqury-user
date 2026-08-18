/**
 * Comprehensive earnings calculator for transparent seller payouts
 * Calculates all deductions and final net payout
 */

export interface EarningsBreakdown {
  salePrice: number;
  tax: number;
  priceAfterTax: number;
  platformFee: number;
  paymentGatewayFee: number;
  totalDeductions: number;
  netEarnings: number;
  percentageBreakdown: {
    tax: number;
    platformFee: number;
    paymentGatewayFee: number;
    netEarnings: number;
  };
}

export interface FeeSettings {
  platformFeePercentage: number;
  sellerCommissionPercentage: number;
  taxPercentage: number;
  paymentGatewayFeePercentage: number;
}

/**
 * Calculate complete earnings breakdown for a sale
 * @param salePrice - Original sale price (seller's listed price)
 * @param settings - Fee settings from admin
 * @returns Detailed breakdown of all calculations
 */
export function calculateEarningsBreakdown(
  salePrice: number,
  settings: FeeSettings
): EarningsBreakdown {
  // Step 1: Calculate tax on sale price
  const tax = (salePrice * settings.taxPercentage) / 100;
  const priceAfterTax = salePrice + tax;

  // Step 2: Calculate platform fee on original sale price (before gateway fee)
  const platformFee = (salePrice * settings.platformFeePercentage) / 100;

  // Step 3: Calculate payment gateway fee on the sale price
  // Gateway fee is calculated on the base amount before platform fee
  const paymentGatewayFee = (salePrice * settings.paymentGatewayFeePercentage) / 100;

  // Step 4: Final net earnings = Sale Price - Platform Fee - Gateway Fee - Tax
  const totalDeductions = platformFee + paymentGatewayFee + tax;
  const netEarnings = salePrice - platformFee - paymentGatewayFee - tax;

  // Calculate percentages for breakdown
  const percentageBreakdown = {
    tax: settings.taxPercentage,
    platformFee: settings.platformFeePercentage,
    paymentGatewayFee: settings.paymentGatewayFeePercentage,
    netEarnings: ((netEarnings / salePrice) * 100),
  };

  return {
    salePrice: Math.round(salePrice * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    priceAfterTax: Math.round(priceAfterTax * 100) / 100,
    platformFee: Math.round(platformFee * 100) / 100,
    paymentGatewayFee: Math.round(paymentGatewayFee * 100) / 100,
    totalDeductions: Math.round(totalDeductions * 100) / 100,
    netEarnings: Math.round(netEarnings * 100) / 100,
    percentageBreakdown: {
      tax: Math.round(percentageBreakdown.tax * 100) / 100,
      platformFee: Math.round(percentageBreakdown.platformFee * 100) / 100,
      paymentGatewayFee: Math.round(percentageBreakdown.paymentGatewayFee * 100) / 100,
      netEarnings: Math.round(percentageBreakdown.netEarnings * 100) / 100,
    },
  };
}

/**
 * Get human-readable description of a fee deduction
 */
export function getFeeDescription(feeType: string, percentage: number, amount: number): string {
  const descriptions: Record<string, string> = {
    tax: `Tax (${percentage}%)`,
    platformFee: `Platform Fee (${percentage}%)`,
    paymentGatewayFee: `Payment Gateway Fee (${percentage}%)`,
  };
  return descriptions[feeType] || 'Deduction';
}
