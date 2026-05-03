const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'test_resident_1714717558661@example.com', // use a known one or create new
    password: 'password123'
  });
  
  if (authError) {
      // create new
      const email = 'test_resident_' + Date.now() + '@example.com';
      const { data: newData, error: newErr } = await supabase.auth.signUp({
        email, password: 'password123', options: { data: { full_name: 'Test' } }
      });
      if (newErr) return console.error(newErr);
      authData.user = newData.user;
  }
  
  const { data: communities } = await supabase.from('communities').select('*').limit(1);
  await supabase.from('profiles').update({ community_id: communities[0].id }).eq('id', authData.user.id);
  
  const { data: isApproved } = await supabase.rpc('is_user_approved', { p_user_id: authData.user.id });
  console.log('is_user_approved:', isApproved);
  
  const { data: profiles } = await supabase.from('profiles').select('community_id, removed_at').eq('id', authData.user.id);
  console.log('profile:', profiles[0]);
}
run();
