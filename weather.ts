// Погода: Open-Meteo (ТЗ, задача 12).
// Точность: модель не фиксируем — Open-Meteo сам выбирает лучшую для региона (best_match:
// ICON/ECMWF/GFS и региональные модели высокого разрешения). Город храним с координатами,
// чтобы не «перескакивать» на одноимённый населённый пункт. Ветер — в м/с, как привычно в РФ.

import {
  summarizeHours, UNKNOWN_WEATHER,
  type HourPoint, type WeatherSummary
} from '../../supabase/functions/_shared/stylist.ts'

export type Place = {
  name: string
  label: string
  latitude: number
  longitude: number
  timezone?: string
}

export type DayPoint = {
  date: string
  tempMin: number
  tempMax: number
  feelsMin: number
  feelsMax: number
  precipitationSum: number
  precipitationProbabilityMax: number | null
  windMax: number
  gustMax: number
  code: number
  snowfall: number
}

export type Forecast = {
  place: Place
  fetchedAt: number
  current: {
    time: string
    temperature: number
    feelsLike: number
    humidity: number
    wind: number
    gusts: number
    precipitation: number
    code: number
    isDay: boolean
  }
  hours: HourPoint[]
  days: DayPoint[]
}

const FORECAST_TTL = 30 * 60 * 1000
const FORECAST_DAYS = 16
const memory = new Map<string, Forecast>()
const inflight = new Map<string, Promise<Forecast>>()

/** Текущая дата в часовом поясе устройства, YYYY-MM-DD. Не кешировать в константу — после полуночи она устареет. */
export const todayISO = () => new Date().toLocaleDateString('en-CA')
export const addDays = (iso: string, days: number) => {
  const date = new Date(iso + 'T12:00:00')
  date.setDate(date.getDate() + days)
  return date.toLocaleDateString('en-CA')
}

function storageGet<T>(key: string): T | null {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : null } catch { return null }
}
function storageSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* переполнено или недоступно — работаем без кеша */ }
}

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')

const CITY_ALIASES: Record<string, string> = {
  'питер': 'Санкт-Петербург', 'петербург': 'Санкт-Петербург', 'спб': 'Санкт-Петербург', 'с пб': 'Санкт-Петербург',
  'saint petersburg': 'Санкт-Петербург', 'st petersburg': 'Санкт-Петербург', 'мск': 'Москва', 'екб': 'Екатеринбург',
  'нск': 'Новосибирск', 'нн': 'Нижний Новгород', 'нижний': 'Нижний Новгород'
}
export const normalizeCityQuery = (value: string) => CITY_ALIASES[normalize(value)] ?? value.trim().replace(/\s+/g, ' ')

type GeoResult = { id: number; name: string; latitude: number; longitude: number; timezone?: string; country?: string; admin1?: string; population?: number }

export function placeLabel(place: { name: string; admin1?: string; country?: string }) {
  const parts = [place.name, place.admin1, place.country].filter(Boolean) as string[]
  return parts.filter((part, index) => parts.findIndex(other => normalize(other) === normalize(part)) === index).join(', ')
}

export async function searchPlaces(query: string, count = 7, signal?: AbortSignal): Promise<Place[]> {
  const term = normalizeCityQuery(query)
  if (term.length < 2) return []
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  url.search = new URLSearchParams({ name: term, count: String(count), language: 'ru', format: 'json' }).toString()
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error('Не удалось найти город')
  const data = await response.json() as { results?: GeoResult[] }
  return (data.results ?? []).map(place => ({
    name: place.name, label: placeLabel(place), latitude: place.latitude, longitude: place.longitude, timezone: place.timezone
  }))
}

/** Находит место по тексту: точное совпадение имени, иначе самый крупный город. Результат кешируется. */
export async function resolvePlace(query: string, signal?: AbortSignal): Promise<Place | null> {
  const term = normalizeCityQuery(query)
  if (!term) return null
  const key = `muse-geo:${normalize(term)}`
  const cached = storageGet<Place>(key)
  if (cached) return cached
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  url.search = new URLSearchParams({ name: term, count: '10', language: 'ru', format: 'json' }).toString()
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error('Не удалось найти город')
  const data = await response.json() as { results?: GeoResult[] }
  const results = data.results ?? []
  if (!results.length) return null
  const exact = results.filter(place => normalize(place.name) === normalize(term))
  const pool = exact.length ? exact : results
  const best = [...pool].sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0]
  const place = { name: best.name, label: placeLabel(best), latitude: best.latitude, longitude: best.longitude, timezone: best.timezone }
  storageSet(key, place)
  return place
}

const forecastKey = (place: Place) => `muse-forecast:${place.latitude.toFixed(2)},${place.longitude.toFixed(2)}`

/** Почасовой прогноз на 16 дней с кешем на 30 минут (память + localStorage). */
export async function getForecast(place: Place, options: { force?: boolean; signal?: AbortSignal } = {}): Promise<Forecast> {
  const key = forecastKey(place)
  if (!options.force) {
    const cached = memory.get(key) ?? storageGet<Forecast>(key)
    if (cached && Date.now() - cached.fetchedAt < FORECAST_TTL) {
      memory.set(key, cached)
      return { ...cached, place }
    }
    const pending = inflight.get(key)
    if (pending) return pending
  }
  const request = (async () => {
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.search = new URLSearchParams({
      latitude: String(place.latitude),
      longitude: String(place.longitude),
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_gusts_10m',
      hourly: 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m',
      daily: 'temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,weather_code,snowfall_sum',
      wind_speed_unit: 'ms',
      timezone: 'auto',
      forecast_days: String(FORECAST_DAYS)
    }).toString()
    const response = await fetch(url, { signal: options.signal })
    if (!response.ok) throw new Error('Не удалось получить прогноз погоды')
    const data = await response.json()
    const h = data.hourly, d = data.daily, c = data.current
    const forecast: Forecast = {
      place: { ...place, timezone: data.timezone ?? place.timezone },
      fetchedAt: Date.now(),
      current: {
        time: c.time, temperature: c.temperature_2m, feelsLike: c.apparent_temperature, humidity: c.relative_humidity_2m,
        wind: c.wind_speed_10m, gusts: c.wind_gusts_10m, precipitation: c.precipitation, code: c.weather_code, isDay: c.is_day === 1
      },
      hours: (h.time as string[]).map((time, i) => ({
        time,
        temperature: h.temperature_2m[i],
        feelsLike: h.apparent_temperature[i],
        precipitationProbability: h.precipitation_probability?.[i] ?? null,
        precipitation: h.precipitation?.[i] ?? 0,
        windSpeed: h.wind_speed_10m[i],
        windGusts: h.wind_gusts_10m?.[i] ?? h.wind_speed_10m[i],
        code: h.weather_code[i]
      })).filter(hour => hour.temperature != null),
      days: (d.time as string[]).map((date, i) => ({
        date,
        tempMin: d.temperature_2m_min[i], tempMax: d.temperature_2m_max[i],
        feelsMin: d.apparent_temperature_min[i], feelsMax: d.apparent_temperature_max[i],
        precipitationSum: d.precipitation_sum[i] ?? 0,
        precipitationProbabilityMax: d.precipitation_probability_max?.[i] ?? null,
        windMax: d.wind_speed_10m_max[i], gustMax: d.wind_gusts_10m_max?.[i] ?? d.wind_speed_10m_max[i],
        code: d.weather_code[i], snowfall: d.snowfall_sum?.[i] ?? 0
      })).filter(day => day.tempMax != null)
    }
    memory.set(key, forecast)
    storageSet(key, forecast)
    return forecast
  })()
  inflight.set(key, request)
  try { return await request } finally { inflight.delete(key) }
}

/** Последняя дата, на которую есть почасовой прогноз. */
export const forecastHorizon = (forecast: Forecast) => forecast.hours[forecast.hours.length - 1]?.time.slice(0, 10) ?? ''

/** Сводка погоды на интервал события «с и до». Вне горизонта — known: false. */
export function eventWeather(forecast: Forecast | null, date: string, start: string, end: string): WeatherSummary {
  if (!forecast) return UNKNOWN_WEATHER
  return summarizeHours(forecast.hours, date, start, end)
}

/** Часы интервала события — для показа «по часам». */
export function eventHours(forecast: Forecast | null, date: string, start: string, end: string) {
  if (!forecast) return []
  const from = `${date}T${start.slice(0, 2)}:00`, to = `${date}T${end}`
  return forecast.hours.filter(hour => hour.time >= from && hour.time <= to)
}

const SNOW_CODES = [71, 73, 75, 77, 85, 86]

export function daySummary(day: DayPoint): WeatherSummary {
  return {
    known: true, source: 'forecast', tempMin: day.tempMin, tempMax: day.tempMax, feelsMin: day.feelsMin, feelsMax: day.feelsMax,
    precipProbMax: day.precipitationProbabilityMax ?? (day.precipitationSum > 0.5 ? 70 : 10),
    precipSum: day.precipitationSum, windMax: day.windMax, gustMax: day.gustMax,
    snow: SNOW_CODES.includes(day.code) || day.snowfall > 0
  }
}

/**
 * Погода по дням поездки: прогноз, если даты в пределах 16 дней,
 * иначе — климатическая норма (среднее за те же даты прошлых 3 лет, архив Open-Meteo).
 */
export async function tripWeather(place: Place, from: string, to: string): Promise<{ date: string; weather: WeatherSummary }[]> {
  const dates: string[] = []
  for (let date = from; date <= to && dates.length < 31; date = addDays(date, 1)) dates.push(date)
  const result = new Map<string, WeatherSummary>()
  try {
    const forecast = await getForecast(place)
    for (const day of forecast.days) if (dates.includes(day.date)) result.set(day.date, daySummary(day))
  } catch { /* прогноз недоступен — попробуем климат */ }
  const missing = dates.filter(date => !result.has(date))
  if (missing.length) {
    const climate = await climateNormals(place, missing).catch(() => new Map<string, WeatherSummary>())
    for (const date of missing) result.set(date, climate.get(date) ?? UNKNOWN_WEATHER)
  }
  return dates.map(date => ({ date, weather: result.get(date)! }))
}

async function climateNormals(place: Place, dates: string[]) {
  const key = `muse-climate:${place.latitude.toFixed(1)},${place.longitude.toFixed(1)}:${dates[0]}:${dates[dates.length - 1]}`
  const cached = storageGet<[string, WeatherSummary][]>(key)
  if (cached) return new Map(cached)
  const back = (iso: string, years: number) => `${Number(iso.slice(0, 4)) - years}${iso.slice(4)}`.replace(/-02-29$/, '-02-28')
  const perYear = await Promise.all([1, 2, 3].map(async years => {
    const url = new URL('https://archive-api.open-meteo.com/v1/archive')
    url.search = new URLSearchParams({
      latitude: String(place.latitude), longitude: String(place.longitude),
      start_date: back(dates[0], years),
      end_date: back(dates[dates.length - 1], years),
      daily: 'temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,snowfall_sum,weather_code',
      wind_speed_unit: 'ms', timezone: 'auto'
    }).toString()
    const response = await fetch(url)
    if (!response.ok) throw new Error('climate')
    return (await response.json()).daily as Record<string, (number | string)[]>
  }))
  const map = new Map<string, WeatherSummary>()
  dates.forEach((date, i) => {
    const values = perYear.map(daily => ({
      tmax: Number(daily.temperature_2m_max[i]), tmin: Number(daily.temperature_2m_min[i]),
      fmax: Number(daily.apparent_temperature_max[i]), fmin: Number(daily.apparent_temperature_min[i]),
      precip: Number(daily.precipitation_sum[i]), wind: Number(daily.wind_speed_10m_max[i]),
      gust: Number(daily.wind_gusts_10m_max[i]), snow: Number(daily.snowfall_sum[i])
    })).filter(value => Number.isFinite(value.tmax))
    if (!values.length) return
    const avg = (fn: (v: typeof values[number]) => number) => Math.round(values.reduce((sum, v) => sum + fn(v), 0) / values.length * 10) / 10
    const rainyYears = values.filter(v => v.precip >= 1).length
    map.set(date, {
      known: true, source: 'climate',
      tempMin: avg(v => v.tmin), tempMax: avg(v => v.tmax), feelsMin: avg(v => v.fmin), feelsMax: avg(v => v.fmax),
      precipProbMax: Math.round(rainyYears / values.length * 100), precipSum: avg(v => v.precip),
      windMax: avg(v => v.wind), gustMax: avg(v => v.gust), snow: values.some(v => v.snow > 0)
    })
  })
  storageSet(key, [...map.entries()])
  return map
}

export function weatherDescription(code: number, isDay = true) {
  if (code === 0) return isDay ? 'Ясно' : 'Ясная ночь'
  if (code === 1) return 'Преимущественно ясно'
  if (code === 2) return 'Переменная облачность'
  if (code === 3) return 'Пасмурно'
  if ([45, 48].includes(code)) return 'Туман'
  if ([51, 53, 55].includes(code)) return 'Морось'
  if ([56, 57, 66, 67].includes(code)) return 'Ледяной дождь'
  if ([61, 63, 65].includes(code)) return 'Дождь'
  if ([80, 81, 82].includes(code)) return 'Ливень'
  if ([71, 73, 75, 77].includes(code)) return 'Снег'
  if ([85, 86].includes(code)) return 'Снегопад'
  if ([95, 96, 99].includes(code)) return 'Гроза'
  return 'Погодные условия'
}

export function weatherSymbol(code: number, isDay = true) {
  if (code === 0) return isDay ? '☀️' : '🌙'
  if (code <= 2) return isDay ? '🌤️' : '☁️'
  if (code === 3) return '☁️'
  if ([45, 48].includes(code)) return '🌫️'
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '🌧️'
  if (SNOW_CODES.includes(code)) return '❄️'
  if ([95, 96, 99].includes(code)) return '⛈️'
  return '🌡️'
}

/** Короткая сводка для подписи: «+3…+7°, ощущается до 0°, дождь 60%, ветер 8 м/с». */
export function formatSummary(w: WeatherSummary) {
  if (!w.known) return 'Прогноз пока неизвестен — уточним ближе к дате'
  const t = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value)}°`
  const parts = [Math.round(w.tempMin) === Math.round(w.tempMax) ? t(w.tempMin) : `${t(w.tempMin)}…${t(w.tempMax)}`]
  parts.push(`ощущается ${Math.round(w.feelsMin) === Math.round(w.feelsMax) ? t(w.feelsMin) : `${t(w.feelsMin)}…${t(w.feelsMax)}`}`)
  if (w.precipProbMax >= 30 || w.precipSum >= 0.3) parts.push(`${w.snow ? 'снег' : 'осадки'} ${Math.round(w.precipProbMax)}%`)
  parts.push(`ветер до ${Math.round(Math.max(w.windMax, 0))} м/с`)
  if (w.source === 'climate') parts.push('по климату, уточним ближе к дате')
  return parts.join(', ')
}
