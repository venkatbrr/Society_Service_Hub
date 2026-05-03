const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const email = 'test_resident_' + Date.now() + '@example.com';
  const { data: newData, error: newErr } = await supabase.auth.signUp({
    email, password: 'password123', options: { data: { full_name: 'Test' } }
  });
  if (newErr) return console.error(newErr);
  const user = newData.user;
  
  const { data: communities } = await supabase.from('communities').select('*').limit(1);
  await supabase.from('profiles').update({ community_id: communities[0].id }).eq('id', user.id);
  
  const { data: providers } = await supabase.from('service_providers').select('*').eq('community_id', communities[0].id).limit(1);
  const provider = providers[0];
  
  console.log("Attempting insert...");
  const { data: insertData, error: insertError } = await supabase.from('ratings').insert({
    user_id: user.id,
    provider_id: provider.id,
    rating: 5,
    review_text: 'Test insert',
    fraud_status: 'pass',
    fraud_rules_triggered: []
  });
  console.log("Insert error:", insertError ? insertError.message : "Success");
}
run();
