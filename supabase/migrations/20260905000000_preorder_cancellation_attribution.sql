-- Migration: Add cancellation attribution and note to preorder orders
-- Allows hosts to cancel pre-orders with optional note and track cancellation attribution

ALTER TABLE public.mcn_preorder_orders
  ADD COLUMN IF NOT EXISTS cancelled_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_note TEXT;

-- Attribution is stamped by the database, never accepted from the client.
-- Deriving cancelled_by from auth.uid() ensures residents cannot forge host cancellations.
CREATE OR REPLACE FUNCTION public.stamp_mcn_preorder_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    NEW.cancelled_by := auth.uid();
    NEW.cancelled_at := now();
  ELSIF NEW.status <> 'cancelled' AND OLD.status = 'cancelled' THEN
    NEW.cancelled_by      := NULL;
    NEW.cancelled_at      := NULL;
    NEW.cancellation_note := NULL;
  ELSE
    -- No status transition: attribution is immutable.
    NEW.cancelled_by := OLD.cancelled_by;
    NEW.cancelled_at := OLD.cancelled_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mcn_preorder_stamp_cancellation ON public.mcn_preorder_orders;
CREATE TRIGGER trg_mcn_preorder_stamp_cancellation
BEFORE UPDATE ON public.mcn_preorder_orders
FOR EACH ROW EXECUTE FUNCTION public.stamp_mcn_preorder_cancellation();

NOTIFY pgrst, 'reload schema';
