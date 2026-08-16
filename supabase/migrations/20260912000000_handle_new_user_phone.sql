-- Update handle_new_user trigger to populate profiles.phone_number for phone-authenticated users

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, app_role, email, phone_number)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    CASE
      WHEN lower(COALESCE(new.email, '')) = 'thewooru@gmail.com'
        THEN 'admin'::public.app_role_type
      ELSE 'resident'::public.app_role_type
    END,
    new.email,
    COALESCE(
      new.phone,
      new.raw_user_meta_data->>'phone_number',
      new.raw_user_meta_data->>'phone'
    )
  );
  RETURN new;
END;
$$;

NOTIFY pgrst, 'reload schema';
