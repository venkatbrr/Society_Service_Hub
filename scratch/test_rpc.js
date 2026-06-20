const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://mbzvcaoulawdugfearmj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__BJ8K0Ji5SGKOwW31p1ksQ_myM9uNWU';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  const { data: profiles, error: pError } = await supabase
    .from('profiles')
    .select('id, full_name')
    .limit(5);

  if (pError) {
    console.error('Error fetching profiles:', pError);
    return;
  }

  console.log('Available profiles:', profiles);
  if (profiles.length === 0) {
    console.log('No profiles found!');
    return;
  }

  const testId = profiles[0].id;
  console.log('Testing RPC platform_get_resident_details for ID:', testId);
  const { data, error } = await supabase.rpc('platform_get_resident_details', {
    p_profile_id: testId
  });

  if (error) {
    console.error('RPC Error:', error);
  } else {
    console.log('RPC Success:', data);
  }
}

test();
