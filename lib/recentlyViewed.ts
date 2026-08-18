// Recently Viewed Products - localStorage based tracker
const KEY = 'vexora_recently_viewed';
const MAX = 12;

export interface RecentProduct {
  id: string;
  title: string;
  price: number;
  original_price: number;
  preview_image: string;
  category: string;
  viewed_at: number;
}

export const addRecentlyViewed = (product: {
  id: string;
  title: string;
  price: number;
  original_price: number;
  preview_image: string;
  category: string;
}) => {
  try {
    const existing = getRecentlyViewed();
    const filtered = existing.filter(p => p.id !== product.id);
    const updated = [{ ...product, viewed_at: Date.now() }, ...filtered].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(updated));
  } catch {}
};

export const getRecentlyViewed = (): RecentProduct[] => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const clearRecentlyViewed = () => {
  localStorage.removeItem(KEY);
};
