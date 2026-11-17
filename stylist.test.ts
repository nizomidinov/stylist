import { describe, expect, it } from 'vitest'
import {
  generateOutfits, hardViolations, planTrip, summarizeHours, wardrobeAdvice, UNKNOWN_WEATHER,
  type StylistContext, type StylistItem, type WeatherSummary, type HourPoint
} from '../../supabase/functions/_shared/stylist.ts'

const wardrobe: StylistItem[] = [
  { id: 't1', name: 'Белая футболка', category: 'Верх', type: 'футболка', color: 'белый', season: 'Весна, лето, осень', warmth: 1, formality: 1, style: 'кэжуал' },
  { id: 't2', name: 'Голубая рубашка', category: 'Верх', type: 'рубашка', color: 'голубой', season: 'Все сезоны', warmth: 2, formality: 3, style: 'классика' },
  { id: 't3', name: 'Серый свитер', category: 'Верх', type: 'свитер', color: 'серый', season: 'Осень, зима, весна', warmth: 4, formality: 2, style: 'минимализм' },
  { id: 't4', name: 'Бежевый кардиган', category: 'Верх', type: 'кардиган', color: 'бежевый', season: 'Осень, зима, весна', warmth: 3, formality: 2, style: 'минимализм' },
  { id: 'b1', name: 'Синие джинсы', category: 'Низ', type: 'джинсы', color: 'деним', season: 'Все сезоны', warmth: 3, formality: 2, style: 'кэжуал' },
  { id: 'b2', name: 'Чёрные брюки', category: 'Низ', type: 'брюки', color: 'чёрный', season: 'Все сезоны', warmth: 3, formality: 4, style: 'классика' },
  { id: 'b3', name: 'Льняные шорты', category: 'Низ', type: 'шорты', color: 'бежевый', season: 'Лето', warmth: 1, formality: 1, style: 'кэжуал' },
  { id: 'd1', name: 'Чёрное платье миди', category: 'Платье', type: 'платье', color: 'чёрный', season: 'Все сезоны', warmth: 2, formality: 4, style: 'классика' },
  { id: 's1', name: 'Белые кеды', category: 'Обувь', type: 'кеды', color: 'белый', season: 'Весна, лето, осень', warmth: 2, formality: 1, heelHeight: 'нет' },
  { id: 's2', name: 'Туфли на шпильке', category: 'Обувь', type: 'туфли', color: 'чёрный', season: 'Все сезоны', warmth: 2, formality: 4, heelHeight: 'высокий', tags: ['натирает'] },
  { id: 's3', name: 'Босоножки', category: 'Обувь', type: 'босоножки', color: 'бежевый', season: 'Лето', warmth: 1, formality: 3, heelHeight: 'низкий' },
  { id: 's4', name: 'Ботинки челси', category: 'Обувь', type: 'ботинки челси', color: 'чёрный', season: 'Осень, зима, весна', warmth: 4, formality: 3, heelHeight: 'низкий' },
  { id: 'o1', name: 'Тренч', category: 'Верхняя одежда', type: 'тренч', color: 'бежевый', season: 'Весна, осень', warmth: 3, formality: 3, windProtection: true, rainProtection: true },
  { id: 'o2', name: 'Пуховик', category: 'Верхняя одежда', type: 'пуховик', color: 'чёрный', season: 'Зима', warmth: 5, formality: 2, windProtection: true, rainProtection: false },
  { id: 'a1', name: 'Шёлковый платок', category: 'Аксессуар', type: 'платок', color: 'бордовый', season: 'Все сезоны', warmth: 1, formality: 3 }
]

const weather = (feelsMin: number, feelsMax: number, extra: Partial<WeatherSummary> = {}): WeatherSummary => ({
  known: true, source: 'forecast', tempMin: feelsMin + 2, tempMax: feelsMax + 2, feelsMin, feelsMax,
  precipProbMax: 10, precipSum: 0, windMax: 3, gustMax: 6, snow: false, ...extra
})
const profile = { styles: ['Минимализм', 'Классика'], likedColors: 'бежевый', dislikedColors: 'розовый' }

const scenarios: Omit<StylistContext, 'mode'>[] = [
  { weather: weather(25, 30), event: { kind: 'Прогулка', outside: 'На улице', walking: true, durationHours: 4 }, profile },
  { weather: weather(-15, -10, { snow: true, precipSum: 3, precipProbMax: 90 }), event: { kind: 'Работа', outside: 'Смешанно', walking: false, durationHours: 9 }, profile },
  { weather: weather(8, 13, { precipProbMax: 80, precipSum: 4, windMax: 9 }), event: { kind: 'Учёба', outside: 'Смешанно', walking: true, durationHours: 6 }, profile },
  { weather: weather(14, 18), event: { kind: 'Свидание', outside: 'В помещении', walking: false, durationHours: 3 }, profile },
  { weather: weather(2, 6), event: { kind: 'Собеседование', outside: 'В помещении', walking: false, durationHours: 1.5 }, profile },
  { weather: weather(18, 24), event: { kind: 'Вечеринка', outside: 'В помещении', walking: false, durationHours: 5 }, profile },
  { weather: weather(10, 20), event: { kind: 'Мероприятие', outside: 'Смешанно', walking: true, durationHours: 8 }, profile },
  { weather: weather(-3, 1, { precipSum: 1, precipProbMax: 50 }), event: { kind: 'Прогулка', outside: 'На улице', walking: true, durationHours: 3 }, profile },
  { weather: weather(20, 26, { precipProbMax: 70, precipSum: 2 }), event: { kind: 'Спорт', outside: 'На улице', walking: true, durationHours: 2 }, profile },
  { weather: UNKNOWN_WEATHER, event: { kind: 'Другое', outside: 'Смешанно', walking: false, durationHours: 2 }, profile }
]

describe('движок подбора образов', () => {
  for (const [index, scenario] of scenarios.entries()) {
    for (const mode of ['красота', 'баланс', 'комфорт'] as const) {
      it(`сценарий ${index + 1} (${scenario.event.kind}, ${mode}) — без нарушений правил`, () => {
        const ctx = { ...scenario, mode }
        const result = generateOutfits(wardrobe, ctx)
        expect(result.outfits.length + result.missing.length).toBeGreaterThan(0)
        for (const outfit of result.outfits) {
          const items = outfit.itemIds.map(id => wardrobe.find(item => item.id === id)!)
          expect(hardViolations(items, ctx)).toEqual([])
          expect(outfit.comfort).toBeGreaterThanOrEqual(1)
          expect(outfit.beauty).toBeLessThanOrEqual(5)
          if (scenario.event.walking && outfit.itemIds.includes('s2')) {
            expect(outfit.warnings.some(warning => warning.itemId === 's2')).toBe(true)
          }
        }
      })
    }
  }

  it('обувь «натирает» не предлагается в режиме комфорта при большой ходьбе', () => {
    const result = generateOutfits(wardrobe, { ...scenarios[6], mode: 'комфорт' })
    expect(result.outfits.some(outfit => outfit.itemIds.includes('s2'))).toBe(false)
  })

  it('в мороз нет босоножек и есть верхняя одежда', () => {
    const result = generateOutfits(wardrobe, { ...scenarios[1], mode: 'баланс' })
    expect(result.outfits.length).toBeGreaterThan(0)
    for (const outfit of result.outfits) {
      expect(outfit.itemIds).not.toContain('s3')
      expect(outfit.itemIds).toContain('o2')
    }
  })

  it('без обуви честно сообщает, чего не хватает', () => {
    const result = generateOutfits(wardrobe.filter(item => item.category !== 'Обувь'), { ...scenarios[3], mode: 'баланс' })
    expect(result.outfits).toHaveLength(0)
    expect(result.missing.join(' ')).toMatch(/обув/i)
  })

  it('«не ношу» никогда не попадает в образ', () => {
    const items = wardrobe.map(item => item.id === 'b1' ? { ...item, tags: ['не ношу'] } : item)
    for (const scenario of scenarios) {
      const result = generateOutfits(items, { ...scenario, mode: 'баланс' })
      expect(result.outfits.some(outfit => outfit.itemIds.includes('b1'))).toBe(false)
    }
  })

  it('отвергает невалидный набор', () => {
    const ctx = { ...scenarios[1], mode: 'баланс' as const }
    const items = ['t1', 'b3', 's3'].map(id => wardrobe.find(item => item.id === id)!)
    expect(hardViolations(items, ctx).length).toBeGreaterThan(0)
  })
})

describe('чемодан', () => {
  it('собирает образы на каждый день, переиспользуя вещи', () => {
    const days = ['2026-11-20', '2026-11-21', '2026-11-22'].map(date => ({ date, weather: weather(6, 11) }))
    const plan = planTrip(wardrobe, days, { profile, event: { kind: 'Прогулка', outside: 'Смешанно', walking: true, durationHours: 8 } })
    expect(plan.days.every(day => day.outfit)).toBe(true)
    const total = plan.days.reduce((sum, day) => sum + (day.outfit?.itemIds.length ?? 0), 0)
    expect(plan.itemIds.length).toBeLessThan(total)
  })
})

describe('погода и советы', () => {
  it('сводка по интервалу берёт только часы события', () => {
    const hours: HourPoint[] = Array.from({ length: 24 }, (_, hour) => ({
      time: `2026-11-12T${String(hour).padStart(2, '0')}:00`, temperature: hour, feelsLike: hour - 2,
      precipitationProbability: hour === 19 ? 80 : 0, precipitation: hour === 19 ? 1.2 : 0, windSpeed: 3, windGusts: 7, code: 3
    }))
    const summary = summarizeHours(hours, '2026-11-12', '18:00', '21:00')
    expect(summary).toMatchObject({ known: true, tempMin: 18, tempMax: 21, feelsMin: 16, feelsMax: 19, precipProbMax: 80, precipSum: 1.2 })
    expect(summarizeHours(hours, '2026-12-30', '10:00', '12:00').known).toBe(false)
  })

  it('советы зависят от состава гардероба', () => {
    const few = wardrobeAdvice(wardrobe.filter(item => item.category !== 'Верхняя одежда'))
    expect(few.some(advice => advice.id === 'no-outer')).toBe(true)
    const full = wardrobeAdvice(wardrobe)
    expect(full.some(advice => advice.id === 'no-outer')).toBe(false)
  })
})

import { bodyTypeFromMeasurements } from './figure'

describe('тип фигуры по меркам', () => {
  it.each([
    [{ bust: 90, waist: 65, hips: 92 }, 'Песочные часы'],
    [{ bust: 85, waist: 68, hips: 100 }, 'Груша'],
    [{ bust: 100, waist: 75, hips: 90 }, 'Перевёрнутый треугольник'],
    [{ bust: 90, waist: 85, hips: 92 }, 'Яблоко'],
    [{ bust: 88, waist: 75, hips: 90 }, 'Прямоугольник'],
    [{ bust: 88, hips: 90 }, null]
  ])('%o → %s', (m, expected) => expect(bodyTypeFromMeasurements(m)).toBe(expected))
})
