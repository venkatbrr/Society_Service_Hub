-- Drop the FK to auth.users
ALTER TABLE public.mcn_posts DROP CONSTRAINT IF EXISTS mcn_posts_user_id_fkey;

-- Add the FK to public.profiles
ALTER TABLE public.mcn_posts ADD CONSTRAINT mcn_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Notify PostgREST to reload the schema cache
NOTIFY pgrst, 'reload schema';
