// Общие константы и помощники интерфейса.
import type { Category, EventItem, Item, NotificationSettings, OutfitMode } from '../types'
import { COMFORT_TAGS } from '../../supabase/functions/_shared/stylist.ts'
import { todayISO } from './weather'

export const CATEGORIES: Category[] = ['Верх', 'Низ', 'Платье', 'Верхняя одежда', 'Обувь', 'Аксессуар']
export const SEASONS = ['Все сезоны', 'Весна, лето, осень', 'Осень, зима, весна', 'Весна, осень', 'Лето', 'Зима']
export const STYLES = ['Кэжуал', 'Классика', 'Олд мани', 'Романтичный', 'Минимализм', 'Спортивный', 'Стрит', 'Готический', 'Бохо', 'Вечерний']
/** Старые записи хранили метки в тексте заметки через «; ». */
export function splitNote(item?: Item) {
  if (!item) return { tags: [] as string[], text: '' }
  if (item.tags) return { tags: item.tags, text: item.note }
  const parts = (item.note || '').split(';').map(part => part.trim()).filter(Boolean)
  return { tags: parts.filter(part => (COMFORT_TAGS as readonly string[]).includes(part)), text: parts.filter(part => !(COMFORT_TAGS as readonly string[]).includes(part)).join('; ') }
}

export const EVENT_KINDS = ['Учёба', 'Работа', 'Свидание', 'Прогулка', 'Вечеринка', 'Мероприятие', 'Собеседование', 'Спорт', 'Другое']
export const MODES: { id: OutfitMode; label: string }[] = [
  { id: 'красота', label: 'Максимум красоты' }, { id: 'баланс', label: 'Баланс' }, { id: 'комфорт', label: 'Максимум комфорта' }
]

export const durationHours = (start: string, end: string) => {
  const [sh, sm] = start.split(':').map(Number), [eh, em] = end.split(':').map(Number)
  return Math.max(0.5, (eh * 60 + em - sh * 60 - sm) / 60)
}

/** Быстрые шаблоны «в одно касание» (ТЗ, задача 13). */
export function quickTemplates(): { label: string; event: Omit<EventItem, 'id'> }[] {
  const now = new Date()
  const hour = Math.min(20, Math.max(7, now.getHours() + (now.getMinutes() > 30 ? 1 : 0)))
  const at = (h: number) => `${String(Math.min(23, h)).padStart(2, '0')}:00`
  const date = todayISO()
  const base = { date, place: '', comment: '', walking: false, outside: 'Смешанно' }
  return [
    { label: 'Сегодня на учёбу', event: { ...base, title: 'Учёба', kind: 'Учёба', start: at(Math.max(hour, 9)), end: at(Math.max(hour, 9) + 6), walking: true } },
    { label: 'Сегодня на работу', event: { ...base, title: 'Работа', kind: 'Работа', start: at(Math.max(hour, 9)), end: at(Math.max(hour, 9) + 9) } },
    { label: 'Прогулка', event: { ...base, title: 'Прогулка', kind: 'Прогулка', start: at(hour), end: at(hour + 3), outside: 'На улице', walking: true } },
    { label: 'Свидание вечером', event: { ...base, title: 'Свидание', kind: 'Свидание', start: at(Math.max(hour, 19)), end: at(Math.max(hour, 19) + 3) } }
  ]
}

/** Подсказка города по часовому поясу устройства (автоопределение без запроса геолокации). */
export function guessCityFromTimezone() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const map: Record<string, string> = {
    'Europe/Moscow': 'Москва', 'Europe/Kaliningrad': 'Калининград', 'Europe/Samara': 'Самара', 'Europe/Volgograd': 'Волгоград',
    'Europe/Saratov': 'Саратов', 'Europe/Ulyanovsk': 'Ульяновск', 'Europe/Astrakhan': 'Астрахань', 'Europe/Kirov': 'Киров',
    'Asia/Yekaterinburg': 'Екатеринбург', 'Asia/Omsk': 'Омск', 'Asia/Novosibirsk': 'Новосибирск', 'Asia/Barnaul': 'Барнаул',
    'Asia/Tomsk': 'Томск', 'Asia/Novokuznetsk': 'Новокузнецк', 'Asia/Krasnoyarsk': 'Красноярск', 'Asia/Irkutsk': 'Иркутск',
    'Asia/Chita': 'Чита', 'Asia/Yakutsk': 'Якутск', 'Asia/Vladivostok': 'Владивосток', 'Asia/Magadan': 'Магадан',
    'Asia/Kamchatka': 'Петропавловск-Камчатский', 'Asia/Sakhalin': 'Южно-Сахалинск', 'Europe/Minsk': 'Минск',
    'Asia/Almaty': 'Алматы', 'Asia/Tashkent': 'Ташкент', 'Asia/Bishkek': 'Бишкек', 'Asia/Dushanbe': 'Душанбе', 'Asia/Tbilisi': 'Тбилиси',
    'Asia/Yerevan': 'Ереван', 'Asia/Baku': 'Баку'
  }
  return map[tz] ?? ''
}
export const DEFAULT_NOTIFICATIONS: NotificationSettings = { events: true, weather: true, eveningTime: '20:00', hoursBefore: 2 }
export const itemCheckId = (itemId: string) => `item-${itemId}`
