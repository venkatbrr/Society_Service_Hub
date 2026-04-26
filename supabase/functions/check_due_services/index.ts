// Edge Function: check_due_services
// Fallback cron trigger for notify_due_services() since pg_cron is unavailable
// on the current Supabase plan.
//
// Schedule this function via Supabase Dashboard → Edge Functions → Schedule
// at cron expression: "30 3 * * *" (3:30 UTC = 9:00 AM IST daily)
//
// NOTE: This function uses the service-role key stored as an environment secret
// named SUPABASE_SERVICE_ROLE_KEY. Configure it in the Dashboard if not set.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (_req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase.rpc('notify_due_services');

  if (error) {
    console.error('notify_due_services error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  console.log(`notify_due_services completed. Notifications created: ${data}`);
  return new Response(
    JSON.stringify({ notifications_created: data }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
