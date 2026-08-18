const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ymgyekgmonqhehmnskcw.supabase.co';
const supabaseServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltZ3lla2dtb25xaGVobW5za2N3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTk1MDQyNCwiZXhwIjoyMDg3NTI2NDI0fQ.CmYuwQMjxM-5gX_BPwBYqIau10aR2L6yvDYkVk3Gnlk';
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function check() {
  const { data, error } = await supabase
    .from('categories')
    .select('name, icon_url')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
    
  console.log('Result:', data?.map(d => d.name));
}
check();
