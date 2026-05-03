const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: 'test_resident_' + Date.now() + '@example.com',
    password: 'password123'
  });
  
  // Just querying to check if business_id exists on ratings
  const { data, error } = await supabase.from('ratings').select('business_id').limit(1);
  console.log("Check business_id column:", error ? error.message : "Exists");
}
run();
