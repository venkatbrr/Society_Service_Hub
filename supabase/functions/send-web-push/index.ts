// Supabase Edge Function: send-web-push
// Dispatches Web Push notifications to subscribed browser endpoints.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webPush from 'npm:web-push@3.6.7';

interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failure_count: number;
}

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: any;
}

// Keep in sync with app/notifications.tsx:89-187
function getNotificationUrl(type: string, data: any): string {
  if (type === 'provider_reported' && data?.provider_id) {
    return `/provider/${data.provider_id}`;
  }
  if (type === 'visit_rescheduled' && data?.visit_id) {
    return `/visits/${data.visit_id}`;
  }
  if (
    (type === 'drop_reported' ||
      type === 'drop_auto_hidden' ||
      type === 'drop_hidden_host' ||
      type === 'drop_hidden_buyer' ||
      type === 'drop_posted') &&
    data?.drop_id
  ) {
    return `/mcn/drops/${data.drop_id}`;
  }
  if (type === 'preorder_received' && data?.drop_id) {
    return `/mcn/drops/manage/${data.drop_id}`;
  }
  if (type === 'parent_corner_posted') {
    return `/mcn/parents`;
  }
  if (
    (type === 'listing_reported' || type === 'listing_auto_hidden') &&
    data?.listing_id
  ) {
    return `/mcn/listing/${data.listing_id}`;
  }
  if (
    (type === 'carpool_request' ||
      type === 'carpool_request_accepted' ||
      type === 'carpool_request_rejected' ||
      type === 'carpool_request_cancelled' ||
      type === 'carpool_cancelled' ||
      type === 'carpool_paused') &&
    data?.carpool_id
  ) {
    return `/mcn/carpools/${data.carpool_id}`;
  }
  if (
    (type === 'community_event_posted' || type === 'community_event_cancelled') &&
    data?.event_id
  ) {
    return `/events/${data.event_id}`;
  }
  if (type === 'new_visit' && data?.visit_id) {
    return `/visits/${data.visit_id}`;
  }
  if (
    type === 'community_approved' ||
    type === 'community_rejected' ||
    type === 'removed_from_community'
  ) {
    return '/community-select';
  }
  if (
    type === 'promoted_to_admin' ||
    type === 'promotion_approved' ||
    type === 'promotion_rejected' ||
    type === 'new_community_request' ||
    type === 'new_promotion_request' ||
    type === 'funds_access_requested'
  ) {
    return '/admin-redirect';
  }
  if (
    type === 'funds_access_approved' ||
    type === 'funds_access_rejected' ||
    type === 'community_lead_appointed' ||
    type === 'funds_access_revoked'
  ) {
    return '/(tabs)/community';
  }
  if (type === 'service_reminder' && data?.service_id) {
    return `/services/${data.service_id}`;
  }
  return '/network';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-dispatch-secret',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const expectedSecret = Deno.env.get('WEB_PUSH_DISPATCH_SECRET');
  const incomingSecret = req.headers.get('x-dispatch-secret');

  if (!expectedSecret || !incomingSecret || incomingSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') || Deno.env.get('EXPO_PUBLIC_VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:support@wooru.in';

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error('[send-web-push] Missing VAPID keys in environment');
    return new Response(
      JSON.stringify({ error: 'Server misconfigured: missing VAPID keys' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[send-web-push] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return new Response(
      JSON.stringify({ error: 'Server misconfigured: missing Supabase credentials' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json();
    const notificationIds: string[] = body.notification_ids || [];

    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, skipped: 0, pruned: 0, failed: 0, message: 'No notification IDs provided' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { data: notifications, error: notifError } = await supabase
      .from('notifications')
      .select('id, user_id, type, title, body, data')
      .in('id', notificationIds);

    if (notifError || !notifications || notifications.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, skipped: 0, pruned: 0, failed: 0, message: 'No notifications found' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const userIds = [...new Set(notifications.map((n: NotificationRow) => n.user_id))];
    const { data: subscriptions, error: subsError } = await supabase
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth, failure_count')
      .in('user_id', userIds);

    if (subsError || !subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({
          sent: 0,
          skipped: notifications.length,
          pruned: 0,
          failed: 0,
          message: 'No active push subscriptions for recipients',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Map user_id to subscriptions
    const subsByUser = new Map<string, PushSubscriptionRow[]>();
    for (const sub of subscriptions as PushSubscriptionRow[]) {
      const userSubs = subsByUser.get(sub.user_id) || [];
      userSubs.push(sub);
      subsByUser.set(sub.user_id, userSubs);
    }

    let sent = 0;
    let skipped = 0;
    let pruned = 0;
    let failed = 0;

    for (const notif of notifications as NotificationRow[]) {
      const userSubs = subsByUser.get(notif.user_id);
      if (!userSubs || userSubs.length === 0) {
        skipped++;
        continue;
      }

      const payload = JSON.stringify({
        title: notif.title || 'Wooru',
        body: notif.body || '',
        url: getNotificationUrl(notif.type, notif.data),
        tag: notif.id,
        type: notif.type,
      });

      for (const sub of userSubs) {
        try {
          await webPush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            payload,
            { TTL: 86400 }
          );
          sent++;

          // Reset failure count on success if needed
          if (sub.failure_count > 0) {
            await supabase
              .from('push_subscriptions')
              .update({ failure_count: 0, last_seen_at: new Date().toISOString() })
              .eq('id', sub.id);
          }
        } catch (pushErr: any) {
          const statusCode = pushErr?.statusCode || pushErr?.status;
          console.warn(`[send-web-push] Failed to push to endpoint ${sub.endpoint.slice(0, 30)}...:`, statusCode, pushErr?.message);

          if (statusCode === 404 || statusCode === 410) {
            // Permanent endpoint revocation - prune row
            await supabase.from('push_subscriptions').delete().eq('id', sub.id);
            pruned++;
          } else {
            const nextFailureCount = (sub.failure_count || 0) + 1;
            if (nextFailureCount > 10) {
              await supabase.from('push_subscriptions').delete().eq('id', sub.id);
              pruned++;
            } else {
              await supabase
                .from('push_subscriptions')
                .update({ failure_count: nextFailureCount })
                .eq('id', sub.id);
              failed++;
            }
          }
        }
      }
    }

    const summary = { sent, skipped, pruned, failed };
    console.log('[send-web-push] Completed dispatch batch:', JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[send-web-push] Unexpected error processing request:', err);
    return new Response(
      JSON.stringify({ error: err?.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
