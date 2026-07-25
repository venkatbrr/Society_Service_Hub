const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('mcn_parent_corner')
    .select('id');
  
  if (error) {
    console.error('Query error:', error);
  } else {
    console.log('SUCCESS! mcn_parent_corner rows count:', data.length);
  }
}
run();
