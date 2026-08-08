// Supabase configuration and client initialization
//
// These placeholders are substituted at build time by build-admin.js from
// EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY, so the admin
// console follows whichever environment the deployment targets. This file has
// no bundler, so it can never read process.env at runtime — any future config
// must go through the same substitution.
const SUPABASE_URL = '__SUPABASE_URL__';
const SUPABASE_ANON_KEY = '__SUPABASE_ANON_KEY__';

// Initialize Supabase client
window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
