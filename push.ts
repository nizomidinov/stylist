// Web Push (ТЗ, задача 19). На iPhone работает только у PWA, добавленной на главный экран (iOS 16.4+).
import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - base64.length % 4) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)))
}

/** Возвращает текст ошибки или null, если подписка оформлена. */
export async function enablePush(userId: string): Promise<string | null> {
  if (!pushSupported()) {
    return isIos() && !isStandalone()
      ? 'На iPhone уведомления работают, только если добавить приложение на главный экран: «Поделиться» → «На экран „Домой“».'
      : 'Этот браузер не поддерживает уведомления.'
  }
  if (!VAPID_PUBLIC_KEY) return 'Push-уведомления ещё не настроены на сервере (нет VITE_VAPID_PUBLIC_KEY).'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'Уведомления запрещены в настройках браузера.'
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
    ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) })
  const { error } = await supabase.from('push_subscriptions').upsert({ endpoint: subscription.endpoint, user_id: userId, subscription: subscription.toJSON() })
  return error ? 'Не удалось сохранить подписку на уведомления' : null
}

export async function disablePush() {
  if (!pushSupported()) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
  await subscription.unsubscribe()
}
