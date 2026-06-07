-- Drop old update and delete policies
DROP POLICY IF EXISTS "Assigned users can update their allowed transactions" ON public.event_transactions;
DROP POLICY IF EXISTS "Assigned users can delete their allowed transactions" ON public.event_transactions;

-- Create updated policies to allow creators OR fund treasurers/admins to update
CREATE POLICY "Assigned users can update their allowed transactions"
  ON public.event_transactions
  FOR UPDATE
  USING (
    (
      created_by = auth.uid()
      OR
      public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer')
    )
    AND public.is_user_approved(auth.uid())
    AND (
      (type = 'income' AND public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer', 'collector'))
      OR
      (type = 'expense' AND public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer'))
    )
  )
  WITH CHECK (
    (
      created_by = auth.uid()
      OR
      public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer')
    )
    AND public.is_user_approved(auth.uid())
    AND (
      (type = 'income' AND public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer', 'collector'))
      OR
      (type = 'expense' AND public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer'))
    )
  );

-- Create updated policies to allow creators OR fund treasurers/admins to delete
CREATE POLICY "Assigned users can delete their allowed transactions"
  ON public.event_transactions
  FOR DELETE
  USING (
    (
      created_by = auth.uid()
      OR
      public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer')
    )
    AND public.is_user_approved(auth.uid())
    AND (
      (type = 'income' AND public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer', 'collector'))
      OR
      (type = 'expense' AND public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer'))
    )
  );
