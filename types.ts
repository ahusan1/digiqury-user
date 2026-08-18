export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'user';
  created_at: string;
  phone?: string;
  is_blocked?: boolean;
  
  // Seller & KYC fields
  seller_status?: 'none' | 'pending' | 'approved' | 'rejected';
  store_name?: string;
  payment_info?: string;
  wallet_balance?: number;
  wallet_frozen?: boolean;
  wallet_freeze_reason?: string;
  full_name?: string;
  contact_email?: string;
  phone_number?: string;
  address?: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
  document_link?: string;
}

export interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  original_price: number;
  category: string;
  format: string;
  resolution: string;
  preview_image: string;
  preview_images?: string[]; // Multiple preview images
  file_url: string;
  is_enabled: boolean;
  created_at: string;
  views?: number;
  seller_id?: string;
  is_verified?: boolean;
  is_featured?: boolean;
  featured_until?: string;
  ad_impressions?: number;
  ad_clicks?: number;
  rejection_reason?: string;
  reviewed_at?: string;
  reviewed_by?: string;
  average_rating?: number;
  review_count?: number;
  rating_1_count?: number;
  rating_2_count?: number;
  rating_3_count?: number;
  rating_4_count?: number;
  rating_5_count?: number;
  seller?: {
    id?: string;
    name?: string;
    store_name?: string;
  };
}

export interface Review {
  id: string;
  product_id: string;
  user_id: string;
  rating: number;
  title?: string;
  comment?: string;
  images?: string[];
  helpful_count?: number;
  not_helpful_count?: number;
  created_at: string;
  updated_at: string;
  user?: {
    id: string;
    name: string;
  };
}

export interface AppSetting {
  key: string;
  value: string;
  updated_at?: string;
}

export interface Order {
  id: string;
  user_id: string;
  product_id: string;
  payment_id: string;
  status: string;
  created_at: string;
  unit_price: number;
  final_price: number;
  discount_amount: number;
  coupon_code: string | null;
  license_active?: boolean;
  download_limit?: number | null;
  download_count?: number;
  payout_status?: 'pending' | 'released';
  seller_earnings?: number;
}

export interface Withdrawal {
  id: string;
  seller_id: string;
  amount: number;
  status: 'pending' | 'completed' | 'rejected';
  payment_ref?: string;
  created_at: string;
  seller?: {
    name: string;
    payment_info: string;
  };
}

export interface AccountDeletionRequest {
  id: string;
  user_id: string;
  role: 'user' | 'seller';
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}
