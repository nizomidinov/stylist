import { supabase } from './supabase'
import {
  generateOutfits as generateByRules,
  type Outfit, type OutfitMode, type Preferences, type StylistEvent, type StylistItem, type StylistProfile, type WeatherSummary
} from '../../supabase/functions/_shared/stylist.ts'
import type { Item, Profile } from '../types'

export type ClothingAnalysis = {
  name: string; category: Item['category']; color: string; colors?: string[]; season: string; warmth: number;
  material?: string; style?: string; formality?: number; type?: string; heelHeight?: string;
  windProtection?: boolean; rainProtection?: boolean
  /** 0–1, насколько модель уверена в категории (только для распознавания на устройстве). */
  confidence?: number
}

export type OutfitResult = {
  outfits: Outfit[]
  missing: string[]
  generalNote?: string
  source: 'ai' | 'rules'
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    // Текст ошибки из тела ответа функции (403/429 и т. п.)
    const context = (error as { context?: Response }).context
    const message = context && typeof context.json === 'function' ? (await context.json().catch(() => null))?.error : null
    throw new Error(message || 'Не удалось связаться с ИИ-сервисом')
  }
  if (!data || data.error) throw new Error(data?.error || 'ИИ не вернул результат')
  return data as T
}

/**
 * Распознавание вещи. По умолчанию — собственная модель прямо на устройстве (фото никуда не уходит).
 * VITE_RECOGNITION=server — через Edge Function analyze-clothing (внешний ИИ, после юр. проверки).
 */
export async function recognizeClothing(image: string, onWhite = true): Promise<ClothingAnalysis> {
  if (import.meta.env.VITE_RECOGNITION === 'server') return invoke<ClothingAnalysis>('analyze-clothing', { image })
  const { recognizeLocally } = await import('./vision/recognize')
  return recognizeLocally(image, onWhite)
}
export function analyzeFigurePhoto(image: string) { return invoke<{ bodyType: string; confidence: number }>('analyze-figure', { image, consent: true }) }
export function deleteAccount() { return invoke<{ ok: true }>('delete-account', {}) }

export const toStylistItem = (item: Item): StylistItem => ({
  id: item.id, name: item.name, category: item.category, type: item.type, color: item.color, colors: item.colors,
  season: item.season, warmth: item.warmth, material: item.material, formality: item.formality, style: item.style,
  heelHeight: item.heelHeight, windProtection: item.windProtection, rainProtection: item.rainProtection,
  tags: item.tags, note: item.note, complaints: item.complaints, likes: item.likes
})

export const toStylistProfile = (profile: Profile): StylistProfile => ({
  styles: profile.styles, likedColors: profile.likedColors, dislikedColors: profile.dislikedColors, bodyType: profile.bodyType
})

export type OutfitRequest = {
  items: Item[]
  profile: Profile
  event: StylistEvent
  weather: WeatherSummary
  mode: OutfitMode
  recent?: string[][]
  exclude?: string[]
  preferences?: Preferences
}

/**
 * Подбор образов. По умолчанию — собственный стилист на устройстве: правила ТЗ + обучение на реакциях.
 * VITE_OUTFIT_AI=server — дополнительно языковая модель через Edge Function (при сбое — снова свой стилист).
 */
export async function generateOutfits(request: OutfitRequest): Promise<OutfitResult> {
  const items = request.items.map(toStylistItem)
  const profile = toStylistProfile(request.profile)
  try {
    if (import.meta.env.VITE_OUTFIT_AI !== 'server') throw new Error('local')
    return await invoke<OutfitResult>('generate-outfits', { ...request, items, profile })
  } catch (error) {
    if (error instanceof Error && error.message !== 'local') console.warn('generate-outfits недоступна, подбор на устройстве:', error)
    const exclude = new Set(request.exclude ?? [])
    const result = generateByRules(items, { profile, event: request.event, weather: request.weather, mode: request.mode, recent: request.recent, preferences: request.preferences }, 10)
    const outfits = result.outfits.filter(outfit => !exclude.has([...outfit.itemIds].sort().join('|'))).slice(0, 4)
    return { outfits, missing: result.missing, source: 'rules', generalNote: '' }
  }
}

export const outfitKey = (ids: string[]) => [...ids].sort().join('|')
