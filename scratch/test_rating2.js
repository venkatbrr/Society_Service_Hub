const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  // Let's sign up a new user so we know the password
  const email = 'test_resident_' + Date.now() + '@example.com';
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password: 'password123',
    options: {
      data: {
        full_name: 'Test Resident'
      }
    }
  });
  
  if (authError) {
    console.error("Signup error:", authError.message);
    return;
  }
  
  console.log("Logged in as:", authData.user.id);
  
  // We need to join a community first to be able to see providers
  // But wait, the app is open to anyone?
  // Let's fetch all communities
  const { data: communities } = await supabase.from('communities').select('*').limit(1);
  if (!communities || !communities.length) {
      console.log("No communities");
      return;
  }
  const community = communities[0];
  
  // Update user's community
  await supabase.from('profiles').update({ community_id: community.id }).eq('id', authData.user.id);
  
  const { data: providers, error: providerError } = await supabase.from('service_providers').select('*').eq('community_id', community.id).limit(1);
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
    console.error("Upsert error details:", JSON.stringify(error, null, 2));
  } else {
    console.log("Upsert result:", data);
  }
}

run();
