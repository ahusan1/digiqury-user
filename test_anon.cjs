const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ymgyekgmonqhehmnskcw.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltZ3lla2dtb25xaGVobW5za2N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NTA0MjQsImV4cCI6MjA4NzUyNjQyNH0.1KjMMPJaU849XJ0w3NjsUKSBugjjNAR_mGyu7wJCURw';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  const { data, error } = await supabase
    .from('categories')
    .select('name, icon_url')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
    
  console.log('Result:', data);
  console.log('Error:', error);
}
check();
