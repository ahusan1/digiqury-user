// Force Vite HMR reload
import { supabase, robustFetch } from './supabase.ts';

export interface ManagedCategory {
  name: string;
  img: string;
}

export const DEFAULT_CATEGORIES: ManagedCategory[] = [
  { name: 'UI Kits', img: 'https://cdn-icons-png.flaticon.com/128/9211/9211130.png' },
  { name: '3D Assets', img: 'https://cdn-icons-png.flaticon.com/128/1162/1162456.png' },
  { name: 'Stickers', img: 'https://cdn-icons-png.flaticon.com/128/4359/4359652.png' },
  { name: 'PNG Files', img: 'https://cdn-icons-png.flaticon.com/128/1048/1048953.png' },
  { name: 'Mockups', img: 'https://cdn-icons-png.flaticon.com/128/3003/3003280.png' },
  { name: 'Fonts', img: 'https://cdn-icons-png.flaticon.com/128/3161/3161158.png' },
  { name: 'Icons', img: 'https://cdn-icons-png.flaticon.com/128/7074/7074371.png' },
  { name: 'Templates', img: 'https://cdn-icons-png.flaticon.com/128/2232/2232688.png' },
  { name: 'Books', img: 'https://cdn-icons-png.flaticon.com/128/2436/2436702.png' }
];

const normalizeCategories = (raw: unknown): ManagedCategory[] => {
  if (!Array.isArray(raw)) return DEFAULT_CATEGORIES;

  const cleaned = raw
    .map((item: any) => ({
      name: String(item?.name || '').trim(),
      img: String(item?.img || '').trim()
    }))
    .filter((item: ManagedCategory) => item.name.length > 0 && item.img.length > 0);

  if (cleaned.length === 0) return DEFAULT_CATEGORIES;

  const seen = new Set<string>();
  return cleaned.filter((item) => {
    const key = item.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const parseCategoriesSetting = (value?: string | null): ManagedCategory[] => {
  if (!value) return DEFAULT_CATEGORIES;
  try {
    return normalizeCategories(JSON.parse(value));
  } catch {
    return DEFAULT_CATEGORIES;
  }
};

export const getManagedCategories = async (): Promise<ManagedCategory[]> => {
  const { data, error } = await robustFetch<any[]>(
    supabase
      .from('categories')
      .select('name, icon_url')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
  );

  if (error || !data) return DEFAULT_CATEGORIES;

  const mapped = data.map(c => ({
    name: c.name,
    img: c.icon_url
  }));

  return mapped.length > 0 ? mapped : DEFAULT_CATEGORIES;
};

export const getCategoryNames = (categories: ManagedCategory[]): string[] => categories.map((category) => category.name);
