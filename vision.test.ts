import { describe, expect, it } from 'vitest'
import { COLORS, NOT_CLOTHING, TYPES, dominantColors, itemName, nearestColor } from './catalog'
import { NotClothingError, decide, softmax } from './decide'
import { buildPreferences } from '../learning'
import { generateOutfits, type StylistItem } from '../../../supabase/functions/_shared/stylist.ts'
import type { Feedback, Item } from '../../types'

/** Оценки, где у указанного типа максимальная вероятность. */
function scoresFor(type: string, strength = 6, extra: Partial<{ materials: number[]; heels: number[]; colors: string[] }> = {}) {
  const logits = [...TYPES, ...NOT_CLOTHING].map((entry, index) => index < TYPES.length && (entry as typeof TYPES[number]).type === type ? strength : 0)
  return { types: softmax(logits), materials: extra.materials ?? softmax([0, 0, 0, 0, 0, 0, 0, 0, 0]), heels: extra.heels ?? [], colors: extra.colors ?? ['чёрный'] }
}

describe('распознавание: решение по оценкам модели', () => {
  it('джинсы → Низ, деним, название по цвету', () => {
    const r = decide(scoresFor('джинсы', 6, { colors: ['синий'] }))
    expect(r).toMatchObject({ category: 'Низ', type: 'джинсы', name: 'Синие джинсы', material: 'деним', warmth: 3, formality: 2 })
    expect(r.heelHeight).toBeUndefined()
  })

  it('пуховик → верхняя одежда, зима, теплота 5, защита от ветра', () => {
    const r = decide(scoresFor('пуховик', 6, { colors: ['чёрный'] }))
    expect(r).toMatchObject({ category: 'Верхняя одежда', season: 'Зима', warmth: 5, windProtection: true, rainProtection: false, name: 'Чёрный пуховик' })
  })

  it('каблук определяется для туфель', () => {
    const heels = softmax([0, 0, 0, 5]) // высокий
    expect(decide(scoresFor('туфли', 6, { heels })).heelHeight).toBe('высокий')
    expect(decide(scoresFor('туфли', 6, { heels: softmax([5, 0, 0, 0]) })).heelHeight).toBe('нет')
  })

  it('шерсть добавляет теплоты верху', () => {
    const materials = softmax([0, 6, 0, 0, 0, 0, 0, 0, 0])
    expect(decide(scoresFor('кардиган', 6, { materials })).warmth).toBe(4)
  })

  it('категория по сумме вероятностей типов', () => {
    // Чуть больше «платья», но три типа обуви вместе сильнее.
    const logits = [...TYPES, ...NOT_CLOTHING].map((entry, i) => {
      const t = (entry as typeof TYPES[number]).type
      if (i >= TYPES.length) return 0
      return t === 'платье' ? 4.2 : ['туфли', 'ботильоны', 'босоножки'].includes(t) ? 4 : 0
    })
    const r = decide({ types: softmax(logits), materials: [], heels: [], colors: ['бежевый'] })
    expect(r.category).toBe('Обувь')
  })

  it('не вещь — понятная ошибка', () => {
    const logits = [...TYPES, ...NOT_CLOTHING].map((_, i) => i === TYPES.length ? 8 : 0)
    expect(() => decide({ types: softmax(logits), materials: [], heels: [], colors: [] })).toThrow(NotClothingError)
  })

  it('низкая уверенность видна в confidence', () => {
    const flat = decide({ types: softmax([...TYPES, ...NOT_CLOTHING].map(() => 0)), materials: [], heels: [], colors: [] })
    expect(flat.confidence).toBeLessThan(0.6)
  })
})

describe('цвета и названия', () => {
  it('ближайший цвет палитры', () => {
    expect(nearestColor([20, 20, 20])).toBe('чёрный')
    expect(nearestColor([40, 60, 125])).toBe('синий')
    expect(nearestColor([210, 186, 152])).toBe('бежевый')
    expect(nearestColor([238, 238, 236])).toBe('белый')
    expect(nearestColor([180, 30, 40])).toBe('красный')
  })

  it('основные цвета по пикселям на белом фоне', () => {
    const w = 10, h = 10, data: number[] = []
    for (let i = 0; i < w * h; i++) {
      const rgb = i < 40 ? [255, 255, 255] : i < 80 ? [30, 30, 30] : [185, 32, 42]
      data.push(...rgb, 255)
    }
    expect(dominantColors(data, w, h, true)).toEqual(['чёрный', 'красный'])
  })

  it('белая вещь на белом фоне остаётся белой', () => {
    const data: number[] = []
    for (let i = 0; i < 100; i++) data.push(...(i < 50 ? [255, 255, 255] : [236, 236, 233]), 255)
    expect(dominantColors(data, 10, 10, true)).toEqual(['белый'])
  })

  it('согласование прилагательных', () => {
    const t = (type: string) => TYPES.find(item => item.type === type)!
    expect(itemName(t('куртка'), 'синий')).toBe('Синяя куртка')
    expect(itemName(t('пальто'), 'голубой')).toBe('Голубое пальто')
    expect(itemName(t('тренч'), 'бежевый')).toBe('Бежевый тренч')
    expect(itemName(t('кеды'), 'белый')).toBe('Белые кеды')
    expect(itemName(t('куртка'), 'хаки')).toBe('Куртка цвета хаки')
    expect(itemName(t('свитер'))).toBe('Свитер')
  })

  it('все цвета палитры есть в карточке вещи', () => {
    expect(COLORS.length).toBeGreaterThan(10)
  })
})

describe('обучение на реакциях', () => {
  const items: Item[] = ['a', 'b', 'c', 'd', 's1', 's2'].map(id => ({
    id, name: id, category: id.startsWith('s') ? 'Обувь' : id < 'c' ? 'Верх' : 'Низ', color: 'серый', season: 'Все сезоны',
    warmth: 2, image: '', note: '', createdAt: '2026-11-01T00:00:00Z', formality: 2
  }))
  const now = new Date('2026-11-12T00:00:00Z').getTime()
  const fb = (itemIds: string[], extra: Partial<Feedback>, daysAgo = 1): Feedback => ({ id: Math.random().toString(36), outfitId: itemIds.join('|'), itemIds, createdAt: new Date(now - daysAgo * 864e5).toISOString(), ...extra })

  it('«беру» и «понравился» поднимают пару, «другой» опускает', () => {
    const prefs = buildPreferences([fb(['a', 'c', 's1'], { action: 'take', liked: true }), fb(['b', 'd', 's2'], { action: 'other' })], items, now)
    expect(prefs.pairs!['a|c']).toBeGreaterThan(0)
    expect(prefs.pairs!['b|d']).toBeLessThan(0)
  })

  it('старые реакции весят меньше', () => {
    const fresh = buildPreferences([fb(['a', 'c'], { action: 'take' }, 1)], items, now).pairs!['a|c']
    const old = buildPreferences([fb(['a', 'c'], { action: 'take' }, 90)], items, now).pairs!['a|c']
    expect(old).toBeLessThan(fresh)
  })

  it('подбор начинает предпочитать выбранные сочетания', () => {
    const stylistItems: StylistItem[] = items.map(item => ({ ...item }))
    const ctx = { weather: { known: true, source: 'forecast' as const, tempMin: 20, tempMax: 22, feelsMin: 20, feelsMax: 22, precipProbMax: 0, precipSum: 0, windMax: 2, gustMax: 3, snow: false }, event: { kind: 'Прогулка', outside: 'Смешанно', walking: false, durationHours: 2 }, profile: { styles: [], likedColors: '', dislikedColors: '' }, mode: 'баланс' as const }
    const reactions = Array.from({ length: 3 }, () => fb(['b', 'd', 's2'], { action: 'take', liked: true }))
    const learned = generateOutfits(stylistItems, { ...ctx, preferences: buildPreferences(reactions, items, now) }).outfits[0]
    expect(learned.itemIds.sort()).toEqual(['b', 'd', 's2'])
  })
})
