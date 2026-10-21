import { api } from '../api'

// PushManager expects the VAPID applicationServerKey as raw bytes.
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

export async function isPushEnabled(): Promise<boolean> {
  return (await getPushSubscription()) !== null
}

export async function subscribePush(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('unsupported')
  }
  const { public_key } = await api.push.vapidKey()
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(public_key) as BufferSource,
  })
  const json = subscription.toJSON()
  await api.push.subscribe({
    endpoint: subscription.endpoint,
    keys: json.keys ?? {},
  })
}

export async function unsubscribePush(): Promise<void> {
  const subscription = await getPushSubscription()
  if (!subscription) return
  await api.push.unsubscribe(subscription.endpoint)
  await subscription.unsubscribe()
}
