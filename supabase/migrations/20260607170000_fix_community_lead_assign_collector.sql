-- Drop old collector policies on fund_roles
DROP POLICY IF EXISTS "Treasurers can assign collectors" ON public.fund_roles;
DROP POLICY IF EXISTS "Treasurers can update collector roles" ON public.fund_roles;
DROP POLICY IF EXISTS "Treasurers can delete collectors" ON public.fund_roles;

-- Create updated policies allowing both admins and treasurers
CREATE POLICY "Admins and treasurers can assign collectors"
  ON public.fund_roles
  FOR INSERT
  WITH CHECK (
    role = 'collector'
    AND assigned_by = auth.uid()
    AND public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer')
    AND public.is_user_approved(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_id
        AND e.community_id = get_user_community_id()
    )
  );

CREATE POLICY "Admins and treasurers can update collector roles"
  ON public.fund_roles
  FOR UPDATE
  USING (
    public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer')
    AND public.is_user_approved(auth.uid())
  )
  WITH CHECK (
    role = 'collector'
    AND assigned_by = auth.uid()
    AND public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer')
    AND public.is_user_approved(auth.uid())
  );

CREATE POLICY "Admins and treasurers can delete collectors"
  ON public.fund_roles
  FOR DELETE
  USING (
    role = 'collector'
    AND public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer')
    AND public.is_user_approved(auth.uid())
  );
