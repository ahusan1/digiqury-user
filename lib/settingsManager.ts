import { supabase } from './supabase.ts';
import { FeeSettings } from './earningsCalculator.ts';

/**
 * Fetch all admin settings from the database
 */
export async function fetchAdminSettings(): Promise<FeeSettings> {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('key, value');
    
    if (error) throw error;

    const settingsMap: Record<string, string> = {};
    data?.forEach(setting => {
      settingsMap[setting.key] = setting.value;
    });

    return {
      platformFeePercentage: parseFloat(settingsMap['platform_fee_percentage'] || '20'),
      sellerCommissionPercentage: parseFloat(settingsMap['seller_commission_percentage'] || '80'),
      taxPercentage: parseFloat(settingsMap['tax_percentage'] || '0'),
      paymentGatewayFeePercentage: parseFloat(settingsMap['payment_gateway_fee_percentage'] || '2.36'),
    };
  } catch (err) {
    console.error('Error fetching admin settings:', err);
    // Return defaults if fetch fails
    return {
      platformFeePercentage: 20,
      sellerCommissionPercentage: 80,
      taxPercentage: 0,
      paymentGatewayFeePercentage: 2.36,
    };
  }
}

/**
 * Get a single setting value by key
 */
export async function getSettingValue(key: string, defaultValue?: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    
    if (error) throw error;
    return data?.value || defaultValue || '';
  } catch (err) {
    console.error(`Error fetching setting ${key}:`, err);
    return defaultValue || '';
  }
}
