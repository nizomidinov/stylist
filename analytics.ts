// События для метрик бета-теста (ТЗ, задача 22). Пишутся в таблицу analytics_events,
// сводка — во view analytics_summary (Supabase Dashboard → Table editor).
import { supabase } from './supabase'

export type AnalyticsEvent =
  | 'signup' | 'items_uploaded' | 'threshold_10_reached' | 'event_created' | 'outfits_received'
  | 'outfit_take' | 'outfit_other' | 'feedback_comfort' | 'event_in_calendar' | 'trip_created'
  | 'checklist_checked' | 'notification_opened' | 'account_deleted' | 'outfit_mode'

let userId: string | null = null
export const setAnalyticsUser = (id: string | null) => { userId = id }

export function track(name: AnalyticsEvent, props: Record<string, unknown> = {}) {
  if (!userId) return
  void supabase.from('analytics_events').insert({ user_id: userId, name, props }).then(({ error }) => {
    if (error && import.meta.env.DEV) console.warn('analytics', name, error.message)
  })
}
