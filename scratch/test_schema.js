const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: 'societyservicehub@gmail.com', // wait, admin doesn't work.
    password: 'password123'
  });
  
  // We can just try to fetch the table schema using postgrest or we can run a SQL function if any exists
  // But we have no way to run raw SQL.
  // Wait! We can use `npx supabase db query` ? No, we are connected to remote DB, not local.
  // BUT we can use `npx supabase db query` with --db-url if we had the password. We don't have the password.
  console.log("Just testing");
}
run();
