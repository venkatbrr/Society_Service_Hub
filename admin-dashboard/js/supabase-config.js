// Supabase configuration and client initialization
const SUPABASE_URL = 'https://mbzvcaoulawdugfearmj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__BJ8K0Ji5SGKOwW31p1ksQ_myM9uNWU';

// Initialize Supabase client
window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
