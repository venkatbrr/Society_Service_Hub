import { Platform } from 'react-native';
import { supabase } from './supabase';

export type WebPushResult =
  | 'subscribed'
  | 'unsupported'
  | 'permission-default'
  | 'denied'
  | 'error';

export function isWebPushSupported(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  );
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Idempotent. Safe to call on app launch when user is signed in.
 * Re-subscribing is cheap and self-heals endpoints rotated by the browser.
 */
export async function ensureWebPushSubscription(userId: string): Promise<WebPushResult> {
  if (!isWebPushSupported()) {
    return 'unsupported';
  }

  if (Notification.permission === 'denied') {
    return 'denied';
  }

  // Do not trigger prompt without user gesture — return permission-default so caller knows
  if (Notification.permission === 'default') {
    return 'permission-default';
  }

  const vapidPublicKey = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    console.warn('[WebPush] Missing EXPO_PUBLIC_VAPID_PUBLIC_KEY in environment');
    return 'error';
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
      });
    }


    const subJson = sub.toJSON();
    if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
      console.warn('[WebPush] Subscription missing required keys/endpoint:', subJson);
      return 'error';
    }

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: subJson.endpoint,
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        last_seen_at: new Date().toISOString(),
        failure_count: 0,
      },
      { onConflict: 'endpoint' }
    );

    if (error) {
      console.error('[WebPush] Failed to save push subscription to DB:', error);
      return 'error';
    }

    return 'subscribed';
  } catch (err) {
    console.error('[WebPush] Error during push subscription:', err);
    return 'error';
  }
}

/**
 * Called on sign-out: unsubscribe locally AND delete the DB row.
 */
export async function removeWebPushSubscription(): Promise<void> {
  if (!isWebPushSupported()) return;

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => {});
      if (endpoint) {
        const { error } = await supabase
          .from('push_subscriptions')
          .delete()
          .eq('endpoint', endpoint);
        if (error) {
          console.warn('[WebPush] Could not delete push_subscriptions row on sign out:', error.message);
        }
      }
    }
  } catch (err) {
    console.warn('[WebPush] Error removing subscription on sign out:', err);
  }
}
