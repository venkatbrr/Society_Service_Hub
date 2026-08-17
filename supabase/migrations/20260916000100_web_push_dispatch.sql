-- Web Push Dispatch Trigger via pg_net
-- When notifications are inserted, fires a statement-level trigger to dispatch
-- them in a single batch to the send-web-push Edge Function.

CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'web_push_endpoint_url') THEN
    PERFORM vault.create_secret(
      'https://mbzvcaoulawdugfearmj.supabase.co/functions/v1/send-web-push',
      'web_push_endpoint_url',
      'Edge Function URL for web push dispatch'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'web_push_dispatch_secret') THEN
    PERFORM vault.create_secret(
      'a8dd7a3f3e40a7605e98c6ddfb7d75ab2595787fa8ace1e8d1b211ec81b07647',
      'web_push_dispatch_secret',
      'Shared secret for web push dispatch'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.dispatch_web_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids    UUID[];
  v_url    TEXT;
  v_secret TEXT;
BEGIN
  SELECT array_agg(id) INTO v_ids FROM inserted;
  IF v_ids IS NULL OR array_length(v_ids, 1) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'web_push_endpoint_url';
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'web_push_dispatch_secret';

  -- Missing config must never break the write that triggered it: the in-app
  -- notification row is the source of truth, push is best-effort on top.
  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'dispatch_web_push: missing vault config, skipping push';
    RETURN NULL;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-dispatch-secret', v_secret
      ),
      body    := jsonb_build_object('notification_ids', to_jsonb(v_ids)),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'dispatch_web_push failed to post to net.http_post: %', SQLERRM;
  END;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_notifications_dispatch_push ON public.notifications;
CREATE TRIGGER on_notifications_dispatch_push
  AFTER INSERT ON public.notifications
  REFERENCING NEW TABLE AS inserted
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.dispatch_web_push();

NOTIFY pgrst, 'reload schema';
