-- Update handle_new_user to include flat_number during signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, app_role, email, flat_number)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    CASE
      WHEN lower(COALESCE(new.email, '')) = 'societyservicehub@gmail.com'
        THEN 'admin'::public.app_role_type
      ELSE 'resident'::public.app_role_type
    END,
    new.email,
    new.raw_user_meta_data->>'flat_number'
  );

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
