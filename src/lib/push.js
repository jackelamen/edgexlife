/*
  Web Push subscription management.

  The VAPID keypair below is EdgeX Life's own — generated specifically for
  this app rather than reusing Pulse's, so this client never needs to know
  a Pulse secret and vice versa. Only the PUBLIC half goes here (public
  keys are meant to be public — pushManager.subscribe() sends it to the
  push service as-is). The PRIVATE half lives only as an Edge Function
  secret (LIFE_VAPID_PRIVATE_KEY) on life-send-reminders, which is the one
  thing about this feature that had to be set up outside the app itself.
*/
const VAPID_PUBLIC_KEY = 'BBkB6NCwtRk0jjiaKl3u8NgkmiEt_N1cswFbLO8qXBnpxmCBUSuzuzD35pcsDFuNA_npCdF6Zjq9wDAt6b2yMW8'

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

/** Current permission state without prompting — for rendering the right button. */
export function notificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission // 'default' | 'granted' | 'denied'
}

/**
 * Requests permission (if needed), subscribes this browser to push, and
 * returns the raw PushSubscription for the caller to persist. Throws if
 * the user denies permission or the browser doesn't support push at all —
 * callers should catch and surface that rather than fail silently.
 */
export async function subscribeToPush() {
  if (!pushSupported()) throw new Error('Push notifications are not supported in this browser')

  if (Notification.permission === 'default') {
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') throw new Error('Notification permission was not granted')
  } else if (Notification.permission === 'denied') {
    throw new Error('Notifications are blocked for this site in browser settings')
  }

  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  if (existing) return existing

  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })
}

export async function unsubscribeFromPush() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  if (!existing) return null
  await existing.unsubscribe()
  return existing
}

/** Serializes a browser PushSubscription into the flat shape push_subscriptions expects. */
export function subscriptionToRow(sub) {
  const json = sub.toJSON()
  return {
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    user_agent: navigator.userAgent,
  }
}
