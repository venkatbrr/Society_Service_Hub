const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const email = 'test_resident_' + Date.now() + '@example.com';
  const { data: newData } = await supabase.auth.signUp({
    email, password: 'password123', options: { data: { full_name: 'Test' } }
  });
  const user = newData.user;
  
  const { data: communities } = await supabase.from('communities').select('*').limit(1);
  await supabase.from('profiles').update({ community_id: communities[0].id }).eq('id', user.id);
  
  const { data: providers } = await supabase.from('service_providers').select('*').eq('community_id', communities[0].id).limit(1);
  const provider = providers[0];
  
  console.log("Attempting insert...");
  await supabase.from('ratings').insert({
    user_id: user.id, provider_id: provider.id, rating: 5, fraud_status: 'pass'
  });
  
  console.log("Attempting upsert on existing...");
  const { data, error } = await supabase.from('ratings').upsert({
    user_id: user.id, provider_id: provider.id, rating: 4, fraud_status: 'pass'
  }, { onConflict: 'user_id,provider_id' });
  
  console.log("Upsert on existing error:", error ? error.message : "Success");
}
run();
