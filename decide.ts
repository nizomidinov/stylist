// Превращает оценки модели (сходство фото с описаниями) в карточку вещи. Чистая функция — покрыта тестами.
import { HEELS, MATERIALS, NOT_CLOTHING, TYPES, itemName } from './catalog'
import type { ClothingAnalysis } from '../ai'

export type VisionScores = {
  /** Вероятности по TYPES + NOT_CLOTHING (в этом порядке), сумма = 1. */
  types: number[]
  materials: number[]
  heels: number[]
  colors: string[]
}

export type LocalAnalysis = ClothingAnalysis & { confidence: number; alternatives: string[] }

export function softmax(logits: number[]) {
  const max = Math.max(...logits)
  const exps = logits.map(value => Math.exp(value - max))
  const sum = exps.reduce((a, b) => a + b, 0)
  return exps.map(value => value / sum)
}

export class NotClothingError extends Error {
  constructor() { super('На фото не удалось найти вещь. Сфотографируй её целиком на ровном фоне.') }
}

export function decide(scores: VisionScores): LocalAnalysis {
  const clothing = scores.types.slice(0, TYPES.length)
  const notClothing = scores.types.slice(TYPES.length).reduce((a, b) => a + b, 0)
  const ranked = clothing.map((p, index) => ({ p, index })).sort((a, b) => b.p - a.p)
  if (notClothing > ranked[0].p * 1.5 && notClothing > 0.4) throw new NotClothingError()

  // Категорию выбираем по сумме вероятностей её типов — так устойчивее, чем по одному лучшему типу.
  const byCategory = new Map<string, number>()
  clothing.forEach((p, index) => byCategory.set(TYPES[index].category, (byCategory.get(TYPES[index].category) ?? 0) + p))
  const category = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const best = ranked.find(entry => TYPES[entry.index].category === category)!
  const info = TYPES[best.index]

  const material = pickConfident(scores.materials, 0.35)
  const materialInfo = material !== null ? MATERIALS[material] : undefined
  let heel = info.heel
  if (info.detectHeel && scores.heels.length) {
    const h = pickConfident(scores.heels, 0.4)
    if (h !== null) heel = HEELS[h].name
  }
  const warmth = Math.min(5, Math.max(1, info.warmth + (materialInfo && info.category !== 'Обувь' ? materialInfo.warmthDelta : 0)))
  const colors = scores.colors.length ? scores.colors : []

  return {
    name: itemName(info, colors[0]),
    category: info.category,
    type: info.type,
    colors,
    color: colors.join(', ') || 'не указан',
    season: info.season,
    warmth,
    material: materialInfo?.name ?? (info.type === 'джинсы' || info.type === 'джинсовая куртка' ? 'деним' : undefined),
    formality: info.formality,
    style: info.style,
    heelHeight: info.category === 'Обувь' ? heel ?? 'нет' : undefined,
    windProtection: info.category === 'Верхняя одежда' ? Boolean(info.wind) : undefined,
    rainProtection: info.category === 'Верхняя одежда' ? Boolean(info.rain) : undefined,
    confidence: Math.round((byCategory.get(category) ?? 0) * 100) / 100,
    alternatives: ranked.slice(0, 3).map(entry => TYPES[entry.index].type)
  }
}

function pickConfident(probabilities: number[], threshold: number) {
  if (!probabilities.length) return null
  let index = 0
  probabilities.forEach((p, i) => { if (p > probabilities[index]) index = i })
  return probabilities[index] >= threshold ? index : null
}

export { NOT_CLOTHING }
