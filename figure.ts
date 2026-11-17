// Тип фигуры по меркам — считается прямо на устройстве, никуда не отправляется.
// Пороговые соотношения — упрощённая версия распространённой методики (сравнение обхватов груди,
// талии и бёдер). Результат — подсказка для подбора силуэтов, а не оценка тела.
import { BODY_TYPES } from '../../supabase/functions/_shared/stylist.ts'
import type { Measurements } from '../types'

export { BODY_TYPES }
export const BODY_TYPE_NAMES = Object.keys(BODY_TYPES)

export function bodyTypeFromMeasurements(m: Measurements): string | null {
  const { bust, waist, hips } = m
  if (!bust || !waist || !hips) return null
  if ([bust, waist, hips].some(value => value < 40 || value > 200)) return null
  const bustHips = bust - hips
  const waistToBust = waist / bust
  const waistToHips = waist / hips
  const defined = Math.max(bust, hips) - waist >= 23 || (waistToBust <= 0.75 && waistToHips <= 0.75)

  if (waistToBust >= 0.9 && waistToHips >= 0.9 && waist >= Math.max(bust, hips) * 0.9) return 'Яблоко'
  if (Math.abs(bustHips) <= 5 && defined) return 'Песочные часы'
  if (hips - bust > 5 && hips - waist >= 18) return 'Груша'
  if (bust - hips > 5) return 'Перевёрнутый треугольник'
  if (hips - bust > 5) return 'Груша'
  return 'Прямоугольник'
}
