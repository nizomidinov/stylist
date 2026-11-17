// Справочник для собственного распознавания вещей (без внешних ИИ-сервисов).
// Модель CLIP сравнивает фото с текстовыми описаниями (prompt, на английском — так модель обучена),
// а атрибуты (теплота, сезон, формальность, стиль, каблук, защита) берутся из справочника по типу.
import type { Category } from '../../types'

export type Gender = 'm' | 'f' | 'n' | 'pl'
export type TypeInfo = {
  type: string
  category: Category
  prompt: string
  gender: Gender
  warmth: number
  formality: number
  season: string
  style: string
  heel?: 'нет' | 'низкий' | 'средний' | 'высокий'
  /** Для обуви: определять высоту каблука по фото. */
  detectHeel?: boolean
  wind?: boolean
  rain?: boolean
}

const ALL = 'Все сезоны', WARM = 'Весна, лето, осень', COLD = 'Осень, зима, весна', MID = 'Весна, осень'

export const TYPES: TypeInfo[] = [
  // Верх
  { type: 'футболка', category: 'Верх', prompt: 't-shirt', gender: 'f', warmth: 1, formality: 1, season: WARM, style: 'Кэжуал' },
  { type: 'топ', category: 'Верх', prompt: 'tank top or camisole', gender: 'm', warmth: 1, formality: 2, season: 'Лето', style: 'Кэжуал' },
  { type: 'рубашка', category: 'Верх', prompt: 'button-up shirt with collar', gender: 'f', warmth: 2, formality: 3, season: ALL, style: 'Классика' },
  { type: 'блуза', category: 'Верх', prompt: 'women blouse', gender: 'f', warmth: 2, formality: 3, season: ALL, style: 'Романтичный' },
  { type: 'лонгслив', category: 'Верх', prompt: 'long sleeve t-shirt', gender: 'm', warmth: 2, formality: 1, season: MID, style: 'Кэжуал' },
  { type: 'свитер', category: 'Верх', prompt: 'knitted wool sweater', gender: 'm', warmth: 4, formality: 2, season: COLD, style: 'Минимализм' },
  { type: 'кардиган', category: 'Верх', prompt: 'knitted cardigan with buttons', gender: 'm', warmth: 3, formality: 2, season: COLD, style: 'Минимализм' },
  { type: 'худи', category: 'Верх', prompt: 'hoodie with hood', gender: 'n', warmth: 3, formality: 1, season: COLD, style: 'Спортивный' },
  { type: 'свитшот', category: 'Верх', prompt: 'crewneck sweatshirt', gender: 'm', warmth: 3, formality: 1, season: COLD, style: 'Стрит' },
  { type: 'жакет', category: 'Верх', prompt: 'tailored blazer', gender: 'm', warmth: 2, formality: 4, season: ALL, style: 'Классика' },
  { type: 'жилет', category: 'Верх', prompt: 'sleeveless vest', gender: 'm', warmth: 2, formality: 3, season: MID, style: 'Классика' },
  // Низ
  { type: 'джинсы', category: 'Низ', prompt: 'denim jeans', gender: 'pl', warmth: 3, formality: 2, season: ALL, style: 'Кэжуал' },
  { type: 'брюки', category: 'Низ', prompt: 'tailored trousers', gender: 'pl', warmth: 3, formality: 4, season: ALL, style: 'Классика' },
  { type: 'юбка', category: 'Низ', prompt: 'skirt', gender: 'f', warmth: 2, formality: 3, season: WARM, style: 'Романтичный' },
  { type: 'шорты', category: 'Низ', prompt: 'shorts', gender: 'pl', warmth: 1, formality: 1, season: 'Лето', style: 'Кэжуал' },
  { type: 'леггинсы', category: 'Низ', prompt: 'leggings', gender: 'pl', warmth: 2, formality: 1, season: ALL, style: 'Спортивный' },
  { type: 'спортивные брюки', category: 'Низ', prompt: 'jogger sweatpants', gender: 'pl', warmth: 3, formality: 1, season: COLD, style: 'Спортивный' },
  // Платья
  { type: 'платье', category: 'Платье', prompt: 'dress', gender: 'n', warmth: 2, formality: 3, season: WARM, style: 'Романтичный' },
  { type: 'вечернее платье', category: 'Платье', prompt: 'long evening gown', gender: 'n', warmth: 2, formality: 5, season: ALL, style: 'Вечерний' },
  { type: 'сарафан', category: 'Платье', prompt: 'summer sundress with straps', gender: 'm', warmth: 1, formality: 2, season: 'Лето', style: 'Романтичный' },
  { type: 'трикотажное платье', category: 'Платье', prompt: 'knitted sweater dress', gender: 'n', warmth: 3, formality: 2, season: COLD, style: 'Минимализм' },
  { type: 'комбинезон', category: 'Платье', prompt: 'jumpsuit', gender: 'm', warmth: 2, formality: 2, season: ALL, style: 'Кэжуал' },
  // Верхняя одежда
  { type: 'пальто', category: 'Верхняя одежда', prompt: 'long wool coat', gender: 'n', warmth: 4, formality: 4, season: COLD, style: 'Классика', wind: true },
  { type: 'тренч', category: 'Верхняя одежда', prompt: 'trench coat with belt', gender: 'm', warmth: 3, formality: 3, season: MID, style: 'Классика', wind: true, rain: true },
  { type: 'куртка', category: 'Верхняя одежда', prompt: 'short jacket', gender: 'f', warmth: 3, formality: 2, season: MID, style: 'Кэжуал', wind: true },
  { type: 'косуха', category: 'Верхняя одежда', prompt: 'leather biker jacket', gender: 'f', warmth: 3, formality: 2, season: MID, style: 'Стрит', wind: true },
  { type: 'джинсовая куртка', category: 'Верхняя одежда', prompt: 'denim jacket', gender: 'f', warmth: 2, formality: 1, season: WARM, style: 'Кэжуал' },
  { type: 'пуховик', category: 'Верхняя одежда', prompt: 'quilted puffer down jacket', gender: 'm', warmth: 5, formality: 1, season: 'Зима', style: 'Кэжуал', wind: true },
  { type: 'парка', category: 'Верхняя одежда', prompt: 'winter parka with fur hood', gender: 'f', warmth: 5, formality: 1, season: 'Зима', style: 'Кэжуал', wind: true, rain: true },
  { type: 'плащ', category: 'Верхняя одежда', prompt: 'raincoat', gender: 'm', warmth: 2, formality: 2, season: MID, style: 'Минимализм', wind: true, rain: true },
  { type: 'шуба', category: 'Верхняя одежда', prompt: 'fur coat', gender: 'f', warmth: 5, formality: 4, season: 'Зима', style: 'Олд мани', wind: true },
  // Обувь
  { type: 'кроссовки', category: 'Обувь', prompt: 'running sneakers', gender: 'pl', warmth: 2, formality: 1, season: WARM, style: 'Спортивный', heel: 'нет' },
  { type: 'кеды', category: 'Обувь', prompt: 'canvas sneakers', gender: 'pl', warmth: 2, formality: 1, season: WARM, style: 'Кэжуал', heel: 'нет' },
  { type: 'лоферы', category: 'Обувь', prompt: 'leather loafers', gender: 'pl', warmth: 2, formality: 3, season: WARM, style: 'Олд мани', heel: 'нет' },
  { type: 'балетки', category: 'Обувь', prompt: 'ballet flats', gender: 'pl', warmth: 1, formality: 3, season: 'Весна, лето, осень', style: 'Романтичный', heel: 'нет' },
  { type: 'туфли', category: 'Обувь', prompt: 'high heel pumps', gender: 'pl', warmth: 2, formality: 4, season: ALL, style: 'Классика', heel: 'высокий', detectHeel: true },
  { type: 'босоножки', category: 'Обувь', prompt: 'heeled strappy sandals', gender: 'pl', warmth: 1, formality: 3, season: 'Лето', style: 'Романтичный', heel: 'средний', detectHeel: true },
  { type: 'сандалии', category: 'Обувь', prompt: 'flat sandals', gender: 'pl', warmth: 1, formality: 1, season: 'Лето', style: 'Кэжуал', heel: 'нет' },
  { type: 'ботильоны', category: 'Обувь', prompt: 'heeled ankle boots', gender: 'pl', warmth: 3, formality: 3, season: MID, style: 'Классика', heel: 'средний', detectHeel: true },
  { type: 'ботинки', category: 'Обувь', prompt: 'lace-up boots', gender: 'pl', warmth: 4, formality: 2, season: COLD, style: 'Кэжуал', heel: 'низкий' },
  { type: 'челси', category: 'Обувь', prompt: 'chelsea boots', gender: 'pl', warmth: 3, formality: 3, season: MID, style: 'Минимализм', heel: 'низкий' },
  { type: 'сапоги', category: 'Обувь', prompt: 'knee-high boots', gender: 'pl', warmth: 4, formality: 3, season: COLD, style: 'Классика', heel: 'низкий', detectHeel: true },
  { type: 'угги', category: 'Обувь', prompt: 'sheepskin ugg boots', gender: 'pl', warmth: 5, formality: 1, season: 'Зима', style: 'Кэжуал', heel: 'нет' },
  // Аксессуары
  { type: 'сумка', category: 'Аксессуар', prompt: 'handbag', gender: 'f', warmth: 1, formality: 3, season: ALL, style: 'Минимализм' },
  { type: 'шарф', category: 'Аксессуар', prompt: 'scarf', gender: 'm', warmth: 3, formality: 2, season: COLD, style: 'Минимализм' },
  { type: 'шапка', category: 'Аксессуар', prompt: 'knitted beanie hat', gender: 'f', warmth: 4, formality: 1, season: 'Зима', style: 'Кэжуал' },
  { type: 'кепка', category: 'Аксессуар', prompt: 'baseball cap', gender: 'f', warmth: 1, formality: 1, season: WARM, style: 'Спортивный' },
  { type: 'ремень', category: 'Аксессуар', prompt: 'leather belt', gender: 'm', warmth: 1, formality: 3, season: ALL, style: 'Классика' },
  { type: 'очки', category: 'Аксессуар', prompt: 'sunglasses', gender: 'pl', warmth: 1, formality: 2, season: WARM, style: 'Кэжуал' },
  { type: 'украшение', category: 'Аксессуар', prompt: 'jewelry necklace or earrings', gender: 'n', warmth: 1, formality: 4, season: ALL, style: 'Вечерний' }
]

/** Если фото больше похоже на это — значит, на фото не вещь. */
export const NOT_CLOTHING = ['a person face selfie', 'a room interior', 'food on a plate', 'a cat or dog', 'a landscape', 'a text document or screenshot']

export const MATERIALS: { name: string; prompt: string; warmthDelta: number }[] = [
  { name: 'деним', prompt: 'denim fabric', warmthDelta: 0 },
  { name: 'шерсть', prompt: 'chunky wool knit fabric', warmthDelta: 1 },
  { name: 'кожа', prompt: 'smooth leather', warmthDelta: 0 },
  { name: 'хлопок', prompt: 'plain cotton jersey fabric', warmthDelta: 0 },
  { name: 'шёлк', prompt: 'shiny silk satin fabric', warmthDelta: 0 },
  { name: 'лён', prompt: 'linen fabric', warmthDelta: -1 },
  { name: 'пух', prompt: 'quilted puffy padding', warmthDelta: 1 },
  { name: 'замша', prompt: 'suede', warmthDelta: 0 },
  { name: 'синтетика', prompt: 'glossy nylon fabric', warmthDelta: 0 }
]

export const HEELS: { name: 'нет' | 'низкий' | 'средний' | 'высокий'; prompt: string }[] = [
  { name: 'нет', prompt: 'flat shoes with no heel' },
  { name: 'низкий', prompt: 'shoes with a low block heel' },
  { name: 'средний', prompt: 'shoes with a medium heel' },
  { name: 'высокий', prompt: 'shoes with a very high stiletto heel' }
]

export const prompt = (subject: string) => `a product photo of ${subject} on a white background`

// ------------------------------------------------------------------ цвета (по пикселям)

export type ColorName = { name: string; rgb: [number, number, number]; adj?: [string, 'hard' | 'soft' | 'oy'] }

/** adj: основа прилагательного и тип окончания, чтобы назвать вещь «Синяя куртка», «Чёрные джинсы». */
export const COLORS: ColorName[] = [
  { name: 'чёрный', rgb: [28, 28, 30], adj: ['чёрн', 'hard'] },
  { name: 'белый', rgb: [244, 244, 242], adj: ['бел', 'hard'] },
  { name: 'молочный', rgb: [236, 226, 206], adj: ['молочн', 'hard'] },
  { name: 'серый', rgb: [128, 128, 130], adj: ['сер', 'hard'] },
  { name: 'бежевый', rgb: [205, 182, 150], adj: ['бежев', 'hard'] },
  { name: 'коричневый', rgb: [105, 70, 48], adj: ['коричнев', 'hard'] },
  { name: 'синий', rgb: [38, 58, 115], adj: ['син', 'soft'] },
  { name: 'голубой', rgb: [150, 188, 222], adj: ['голуб', 'oy'] },
  { name: 'зелёный', rgb: [55, 115, 70], adj: ['зелён', 'hard'] },
  { name: 'хаки', rgb: [118, 116, 78] },
  { name: 'красный', rgb: [185, 32, 42], adj: ['красн', 'hard'] },
  { name: 'бордовый', rgb: [105, 28, 42], adj: ['бордов', 'hard'] },
  { name: 'розовый', rgb: [232, 160, 178], adj: ['розов', 'hard'] },
  { name: 'фиолетовый', rgb: [112, 72, 148], adj: ['фиолетов', 'hard'] },
  { name: 'жёлтый', rgb: [232, 200, 64], adj: ['жёлт', 'hard'] },
  { name: 'оранжевый', rgb: [228, 118, 42], adj: ['оранжев', 'hard'] }
]

const ENDINGS: Record<'hard' | 'soft' | 'oy', Record<Gender, string>> = {
  hard: { m: 'ый', f: 'ая', n: 'ое', pl: 'ые' },
  soft: { m: 'ий', f: 'яя', n: 'ее', pl: 'ие' },
  oy: { m: 'ой', f: 'ая', n: 'ое', pl: 'ые' }
}

const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase('ru-RU') + text.slice(1)

/** «Синяя куртка», «Чёрные джинсы», «Куртка цвета хаки». */
export function itemName(type: TypeInfo, colorName?: string) {
  const color = COLORS.find(item => item.name === colorName)
  if (!color) return capitalize(type.type)
  if (!color.adj) return `${capitalize(type.type)} цвета ${color.name}`
  const [stem, kind] = color.adj
  return `${capitalize(stem + ENDINGS[kind][type.gender])} ${type.type}`
}

function toLab([r, g, b]: [number, number, number]) {
  const lin = (c: number) => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92 }
  const [R, G, B] = [lin(r), lin(g), lin(b)]
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047)
  const y = f(R * 0.2126 + G * 0.7152 + B * 0.0722)
  const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}
const PALETTE_LAB = COLORS.map(color => ({ name: color.name, lab: toLab(color.rgb) }))

export function nearestColor(rgb: [number, number, number]) {
  const lab = toLab(rgb)
  let best = PALETTE_LAB[0], bestDistance = Infinity
  for (const color of PALETTE_LAB) {
    const d = (lab[0] - color.lab[0]) ** 2 * 0.7 + (lab[1] - color.lab[1]) ** 2 + (lab[2] - color.lab[2]) ** 2
    if (d < bestDistance) { bestDistance = d; best = color }
  }
  return best.name
}

/**
 * Основные цвета вещи по пикселям (RGBA). Фон — почти чистый белый (после удаления фона)
 * или края кадра (для оригинала): такие пиксели не учитываются.
 */
export function dominantColors(data: Uint8ClampedArray | number[], width: number, height: number, onWhite: boolean) {
  const counts = new Map<string, number>()
  let total = 0
  const x0 = onWhite ? 0 : Math.floor(width * 0.2), x1 = onWhite ? width : Math.ceil(width * 0.8)
  const y0 = onWhite ? 0 : Math.floor(height * 0.2), y1 = onWhite ? height : Math.ceil(height * 0.8)
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 20000)))
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * width + x) * 4
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3] ?? 255
      if (a < 128) continue
      if (onWhite && r >= 250 && g >= 250 && b >= 250) continue
      const name = nearestColor([r, g, b])
      counts.set(name, (counts.get(name) ?? 0) + 1)
      total++
    }
  }
  if (!total) return ['белый']
  const ranked = [...counts.entries()].map(([name, count]) => ({ name, share: count / total })).sort((a, b) => b.share - a.share)
  const result = [ranked[0].name]
  if (ranked[1] && ranked[1].share >= 0.2) result.push(ranked[1].name)
  return result
}
