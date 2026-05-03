const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing supabaseUrl or supabaseKey");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'societyservicehub@gmail.com',
    password: 'password123'
  });
  
  if (authError) {
    console.error("Auth error:", authError.message);
    return;
  }
  
  console.log("Logged in as:", authData.user.id);
  
  const { data: providers, error: providerError } = await supabase.from('service_providers').select('*').limit(1);
  if (providerError || !providers?.length) {
    console.log("Error fetching providers", providerError);
    return;
  }
  
  const provider = providers[0];
  console.log("Rating provider:", provider.id);
  
  const { data, error } = await supabase.from('ratings').upsert({
    user_id: authData.user.id,
    provider_id: provider.id,
    rating: 5,
    review_text: 'Test review',
    fraud_status: 'pass',
    fraud_rules_triggered: []
  }, { onConflict: 'user_id,provider_id' });
  
  if (error) {
    console.error("Upsert error:", error);
  } else {
    console.log("Upsert result:", data);
  }
}

run();
