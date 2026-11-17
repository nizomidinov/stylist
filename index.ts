// ИИ-распознавание вещи по фото (ТЗ, задача 8).
// Фото уходит внешнему провайдеру только при AI_PHOTO_PROCESSING_APPROVED=true (после проверки юристом).
// Ответ — строго JSON по схеме; дополнительно нормализуется, чтобы невалидный ответ не ломал приложение.
import {
  cacheGet, cachePut, chatJson, checkDailyLimit, corsHeaders, env, json, logUsage, requireUser, sha256
} from '../_shared/server.ts'

const CATEGORIES = ['Верх', 'Низ', 'Платье', 'Верхняя одежда', 'Обувь', 'Аксессуар']
const SEASONS = ['Все сезоны', 'Весна', 'Лето', 'Осень', 'Зима', 'Весна, лето, осень', 'Осень, зима, весна', 'Весна, осень']
const HEELS = ['нет', 'низкий', 'средний', 'высокий']
const STYLES = ['Кэжуал', 'Классика', 'Олд мани', 'Романтичный', 'Минимализм', 'Спортивный', 'Стрит', 'Готический', 'Бохо', 'Вечерний']

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['isClothing', 'name', 'category', 'type', 'colors', 'season', 'warmth', 'material', 'formality', 'style', 'heelHeight', 'windProtection', 'rainProtection'],
  properties: {
    isClothing: { type: 'boolean' },
    name: { type: 'string' },
    category: { type: 'string', enum: CATEGORIES },
    type: { type: 'string' },
    colors: { type: 'array', items: { type: 'string' } },
    season: { type: 'string', enum: SEASONS },
    warmth: { type: 'integer' },
    material: { type: 'string' },
    formality: { type: 'integer' },
    style: { type: 'string', enum: STYLES },
    heelHeight: { type: 'string', enum: HEELS },
    windProtection: { type: 'boolean' },
    rainProtection: { type: 'boolean' }
  }
}

type Raw = Record<string, unknown>
const pick = (value: unknown, allowed: string[], fallback: string) => typeof value === 'string' && allowed.includes(value) ? value : fallback
const int = (value: unknown, fallback: number) => Math.min(5, Math.max(1, Math.round(Number(value)) || fallback))
const text = (value: unknown, max = 60) => typeof value === 'string' ? value.trim().slice(0, max) : ''

function normalize(raw: Raw) {
  const category = pick(raw.category, CATEGORIES, 'Верх')
  const colors = Array.isArray(raw.colors) ? raw.colors.map(value => text(value, 30).toLocaleLowerCase('ru-RU')).filter(Boolean).slice(0, 4) : []
  return {
    name: text(raw.name) || 'Новая вещь',
    category,
    type: text(raw.type, 40).toLocaleLowerCase('ru-RU'),
    colors,
    color: colors.join(', ') || 'не указан',
    season: pick(raw.season, SEASONS, 'Все сезоны'),
    warmth: int(raw.warmth, 3),
    material: text(raw.material, 40),
    formality: int(raw.formality, 2),
    style: pick(raw.style, STYLES, ''),
    heelHeight: category === 'Обувь' ? pick(raw.heelHeight, HEELS, 'нет') : undefined,
    windProtection: category === 'Верхняя одежда' ? Boolean(raw.windProtection) : undefined,
    rainProtection: category === 'Верхняя одежда' ? Boolean(raw.rainProtection) : undefined
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const user = await requireUser(req)
  if (user instanceof Response) return user

  if (env('AI_PHOTO_PROCESSING_APPROVED') !== 'true') {
    return json({ error: 'Распознавание по фото пока выключено до юридической проверки. Заполни карточку вручную — это займёт несколько касаний.', disabled: true }, 403)
  }

  let image = ''
  try { image = (await req.json()).image ?? '' } catch { /* пусто */ }
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > 4_000_000) {
    return json({ error: 'Нужна фотография в формате JPEG/PNG до 3 МБ' }, 400)
  }

  // Одна и та же фотография распознаётся один раз.
  const cacheKey = 'recognition:' + await sha256(image)
  const cached = await cacheGet<ReturnType<typeof normalize>>(user.id, cacheKey)
  if (cached) { await logUsage(user.id, 'recognition', null, null, true); return json(cached) }

  const limit = await checkDailyLimit(user.id, 'recognition')
  if (!limit.allowed) return json({ error: `Дневной лимит распознаваний (${limit.limit}) исчерпан. Заполни карточку вручную или попробуй завтра.` }, 429)

  const model = env('OPENAI_VISION_MODEL', 'gpt-4o-mini')
  try {
    const { data, usage } = await chatJson<Raw>({
      model, schemaName: 'clothing', schema, temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: [
            'Ты распознаёшь ОДНУ вещь гардероба на фото и заполняешь карточку по-русски.',
            'category: Верх (футболки, рубашки, блузы, свитеры, кардиганы, топы, жакеты без утепления), Низ (джинсы, брюки, юбки, шорты), Платье (платья, комбинезоны), Верхняя одежда (пальто, куртки, тренчи, пуховики, плащи), Обувь, Аксессуар (сумки, шарфы, ремни, головные уборы, украшения).',
            'type — конкретный тип в нижнем регистре: «футболка», «джинсы», «ботильоны» и т. п. name — короткое название вида «Бежевый тренч».',
            'warmth: 1 — очень лёгкая (майка, сандалии), 3 — демисезон, 5 — зимняя (пуховик, зимние сапоги).',
            'formality: 1 — спорт/дом, 2 — повседневная, 3 — смарт-кэжуал, 4 — деловая, 5 — вечерняя.',
            'heelHeight — только для обуви; для остальных «нет». windProtection/rainProtection — только для верхней одежды, для остальных false.',
            'material — если видно, иначе пустая строка. Если на фото нет одежды — isClothing=false.',
            'Не описывай людей и тела, только вещь.'
          ].join('\n')
        },
        { role: 'user', content: [{ type: 'image_url', image_url: { url: image, detail: 'low' } }] }
      ]
    })
    await logUsage(user.id, 'recognition', model, usage)
    if (data.isClothing === false) return json({ error: 'На фото не удалось найти вещь. Сфотографируй её целиком на ровном фоне.' }, 422)
    const result = normalize(data)
    await cachePut(user.id, cacheKey, 'recognition', result)
    return json(result)
  } catch (error) {
    console.error('analyze-clothing failed', error)
    return json({ error: error instanceof Error ? error.message : 'Не удалось распознать вещь — заполни поля вручную' }, 502)
  }
})
