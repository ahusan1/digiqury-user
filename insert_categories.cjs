const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ymgyekgmonqhehmnskcw.supabase.co';
const supabaseServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltZ3lla2dtb25xaGVobW5za2N3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTk1MDQyNCwiZXhwIjoyMDg3NTI2NDI0fQ.CmYuwQMjxM-5gX_BPwBYqIau10aR2L6yvDYkVk3Gnlk';
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const DEFAULT_CATEGORIES = [
  { name: 'UI Kits', icon_url: 'https://cdn-icons-png.flaticon.com/128/9211/9211130.png', sort_order: 10 },
  { name: '3D Assets', icon_url: 'https://cdn-icons-png.flaticon.com/128/1162/1162456.png', sort_order: 20 },
  { name: 'Stickers', icon_url: 'https://cdn-icons-png.flaticon.com/128/4359/4359652.png', sort_order: 30 },
  { name: 'PNG Files', icon_url: 'https://cdn-icons-png.flaticon.com/128/1048/1048953.png', sort_order: 40 },
  { name: 'Mockups', icon_url: 'https://cdn-icons-png.flaticon.com/128/3003/3003280.png', sort_order: 50 },
  { name: 'Fonts', icon_url: 'https://cdn-icons-png.flaticon.com/128/3161/3161158.png', sort_order: 60 },
  { name: 'Icons', icon_url: 'https://cdn-icons-png.flaticon.com/128/7074/7074371.png', sort_order: 70 },
  { name: 'Templates', icon_url: 'https://cdn-icons-png.flaticon.com/128/2232/2232688.png', sort_order: 80 },
  { name: 'Books', icon_url: 'https://cdn-icons-png.flaticon.com/128/2436/2436702.png', sort_order: 90 }
];

async function insertCategories() {
  for (const cat of DEFAULT_CATEGORIES) {
    const { data, error } = await supabase.from('categories').insert(cat).select();
    if (error) {
      if (error.code === '23505') {
        console.log(`Category ${cat.name} already exists.`);
      } else {
        console.error(`Error inserting ${cat.name}:`, error.message);
      }
    } else {
      console.log(`Inserted ${cat.name}`);
    }
  }
}

insertCategories();
