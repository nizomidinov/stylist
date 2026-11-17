// Персональное обучение стилиста на реакциях пользовательницы (без внешних ИИ).
// Каждая реакция добавляет «очки» вещам, парам вещей и цветам; старые реакции постепенно забываются
// (вес уменьшается вдвое каждые 45 дней), поэтому вкусы могут меняться.
import { pairKey, type Preferences } from '../../supabase/functions/_shared/stylist.ts'
import type { Feedback, Item } from '../types'

const HALF_LIFE_DAYS = 45
const clamp = (value: number) => Math.max(-3, Math.min(3, Math.round(value * 100) / 100))

export function buildPreferences(feedback: Feedback[], items: Item[], now = Date.now()): Preferences {
  const byId = new Map(items.map(item => [item.id, item]))
  const itemScores: Record<string, number> = {}, pairs: Record<string, number> = {}, colors: Record<string, number> = {}
  const add = (target: Record<string, number>, key: string, value: number) => { target[key] = (target[key] ?? 0) + value }

  for (const entry of feedback) {
    const age = Math.max(0, (now - new Date(entry.createdAt).getTime()) / 864e5)
    const weight = 0.5 ** (age / HALF_LIFE_DAYS)
    let signal = 0
    if (entry.action === 'take') signal += 1
    if (entry.action === 'other') signal -= 0.5
    if (entry.liked === true) signal += 1
    if (entry.liked === false) signal -= 1
    if (entry.comfortable === false) signal -= 0.5
    if (!signal) continue
    const value = signal * weight
    const ids = entry.itemIds.filter(id => byId.has(id))
    for (const id of ids) {
      add(itemScores, id, value * 0.5)
      for (const color of (byId.get(id)!.colors?.length ? byId.get(id)!.colors! : byId.get(id)!.color.split(/,\s*/))) add(colors, color.toLocaleLowerCase('ru-RU'), value * 0.3)
    }
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) add(pairs, pairKey(ids[i], ids[j]), value)
  }
  const tidy = (record: Record<string, number>) => Object.fromEntries(Object.entries(record).map(([k, v]) => [k, clamp(v)]).filter(([, v]) => v !== 0))
  return { items: tidy(itemScores), pairs: tidy(pairs), colors: tidy(colors) }
}
