// Edge Function: verify-phone-otp
// Verifies MSG91 Widget access-token server-side, finds or creates the Supabase user,
// and mints a valid authenticated session for client-side hydration.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function extractIndian10Digit(rawPhone: string): string | null {
  const digits = (rawPhone || '').replace(/\D/g, '');
  const last10 = digits.length > 10 ? digits.slice(-10) : digits;
  if (/^[6-9]\d{9}$/.test(last10)) {
    return last10;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const rawPhone = body.phone || body.mobile || body.identifier;
    const accessToken = body.access_token || body['access-token'] || body.accessToken;

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: 'Missing access_token from MSG91 OTP widget verification.' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const msg91AuthKey = Deno.env.get('MSG91_AUTHKEY');
    if (!msg91AuthKey) {
      console.error('Server error: MSG91_AUTHKEY secret is not set in Supabase Edge Function environment.');
      return new Response(
        JSON.stringify({ error: 'Server auth provider is misconfigured (missing MSG91_AUTHKEY).' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Verify token with MSG91 API
    let msg91VerifiedPhone: string | null = null;
    try {
      const msg91Res = await fetch('https://control.msg91.com/api/v5/widget/verifyAccessToken', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authkey: msg91AuthKey,
        },
        body: JSON.stringify({
          'access-token': accessToken,
        }),
      });

      const msg91Json = await msg91Res.json().catch(() => ({}));
      if (msg91Json?.type !== 'success' && msg91Json?.status !== 'success') {
        console.warn('MSG91 verifyAccessToken failed:', msg91Json);
        return new Response(
          JSON.stringify({
            error: msg91Json?.message || 'Invalid or expired OTP access token from MSG91.',
          }),
          { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      msg91VerifiedPhone = msg91Json.mobile || msg91Json.phone || msg91Json.identifier || null;
    } catch (msg91Err: any) {
      console.error('Failed to communicate with MSG91 verifyAccessToken:', msg91Err);
      return new Response(
        JSON.stringify({ error: 'Failed to verify token with MSG91 server.' }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Resolve and canonicalize the phone number
    const targetPhoneCandidate = msg91VerifiedPhone || rawPhone;
    const clean10Digits = extractIndian10Digit(targetPhoneCandidate);

    if (!clean10Digits) {
      return new Response(
        JSON.stringify({ error: `Invalid Indian mobile number format (${targetPhoneCandidate}).` }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const formattedE164 = `+91${clean10Digits}`;
    const syntheticEmail = `phone_91${clean10Digits}@auth.wooru.in`;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase environment credentials missing.' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Find or create user
    const { error: createError } = await adminClient.auth.admin.createUser({
      email: syntheticEmail,
      phone: formattedE164,
      email_confirm: true,
      phone_confirm: true,
      user_metadata: {
        phone_number: clean10Digits,
        phone: formattedE164,
      },
    });

    if (createError && !createError.message?.toLowerCase().includes('already registered') && !createError.message?.toLowerCase().includes('already exists')) {
      console.warn('User create warning (attempting link generation anyway):', createError.message);
    }

    // Generate magiclink token for this synthetic email
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: syntheticEmail,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('Failed to generate authentication link:', linkError);
      return new Response(
        JSON.stringify({ error: 'Failed to mint user authentication link.' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const hashedToken = linkData.properties.hashed_token;

    // Exchange hashed_token with anon client to mint a valid session
    const { data: sessionData, error: verifyError } = await anonClient.auth.verifyOtp({
      token_hash: hashedToken,
      type: 'magiclink',
    });

    if (verifyError || !sessionData?.session) {
      console.error('Failed to verify magiclink token into session:', verifyError);
      return new Response(
        JSON.stringify({ error: 'Failed to establish user authentication session.' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        session: sessionData.session,
        user: sessionData.user,
        phone: clean10Digits,
      }),
      {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (err: any) {
    console.error('Unexpected error in verify-phone-otp:', err);
    return new Response(
      JSON.stringify({ error: err?.message || 'Unexpected server error during OTP verification.' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
