import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bell, CalendarDays, CheckCircle2, Cloud, Home, Luggage, Menu, Settings, Shirt, UploadCloud, UserRound } from 'lucide-react'
import type { User } from '@supabase/supabase-js'

import type { EventItem, Feedback, Item, Outfit, OutfitMode, Profile, SavedOutfit, Trip, WeatherSummary } from './types'
import { supabase } from './lib/supabase'
import { deleteAccount, outfitKey, toStylistItem, toStylistProfile } from './lib/ai'
import { deleteItemPhotos } from './lib/photos'
import { setAnalyticsUser, track } from './lib/analytics'
import { addDays, eventWeather, formatSummary, resolvePlace, todayISO, tripWeather, weatherDescription } from './lib/weather'
import { generateOutfits as generateByRules, planTrip, weatherChangedSignificantly, type StylistEvent } from '../supabase/functions/_shared/stylist.ts'
import { useForecast } from './hooks/useForecast'
import { buildPreferences } from './lib/learning'
import { useUploadQueue } from './hooks/useUploadQueue'
import { PhotoProvider } from './components/ui'
import { AuthScreen } from './components/AuthScreen'
import { BatchUpload } from './components/BatchUpload'
import { ItemForm } from './components/ItemForm'
import { EventModal } from './components/EventModal'
import { TripForm } from './components/TripForm'
import { OutfitFlow } from './components/OutfitFlow'
import { QuickProfile } from './components/QuickProfile'
import type { ComfortAnswer } from './components/FeedbackPrompt'
import { Today, type WeatherAlert } from './pages/Today'
import { CalendarPage } from './pages/CalendarPage'
import { Wardrobe } from './pages/Wardrobe'
import { TripsPage } from './pages/TripsPage'
import { itemCheckId } from './lib/constants'
import { ProfilePage } from './pages/ProfilePage'

type Tab = 'today' | 'calendar' | 'wardrobe' | 'trips' | 'profile'
type Table = 'wardrobe_items' | 'events' | 'trips' | 'feedback'
type DraftEvent = EventItem | Omit<EventItem, 'id'>

const nav: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: 'today', label: 'Сегодня', icon: Home },
  { id: 'calendar', label: 'Календарь', icon: CalendarDays },
  { id: 'wardrobe', label: 'Гардероб', icon: Shirt },
  { id: 'trips', label: 'Чемодан', icon: Luggage },
  { id: 'profile', label: 'Профиль', icon: UserRound }
]

const profileDefault: Profile = { city: '', styles: [], likedColors: '', dislikedColors: '' }
const uid = () => Math.random().toString(36).slice(2, 10)
const nowHHMM = () => new Date().toTimeString().slice(0, 5)
const TRIP_EVENT: Record<string, string> = { 'Отдых': 'Прогулка', 'Работа': 'Работа', 'Учёба': 'Учёба', 'Событие': 'Мероприятие' }

function App() {
  const [tab, setTab] = useState<Tab>('today')
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [dataReady, setDataReady] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [trips, setTrips] = useState<Trip[]>([])
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [profile, setProfile] = useState<Profile>(profileDefault)
  const { forecast, loading: weatherLoading, error: weatherError } = useForecast(profile.place, profile.city)

  const [eventEditor, setEventEditor] = useState<EventItem | null | false>(false)
  const [eventDate, setEventDate] = useState(todayISO())
  const [itemEditor, setItemEditor] = useState<Item | null | 'new'>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [tripEditor, setTripEditor] = useState<Trip | null | false>(false)
  const [planning, setPlanning] = useState<string | null>(null)
  const [flowEvent, setFlowEvent] = useState<DraftEvent | null>(null)
  const [toast, setToast] = useState('')
  const [month, setMonth] = useState(new Date())
  const [mobileNav, setMobileNav] = useState(false)
  const notify = (message: string) => setToast(message)

  // ------------------------------------------------------------------ загрузка данных

  useEffect(() => {
    let active = true
    const load = async (currentUser: User | null) => {
      if (!active) return
      setUser(currentUser)
      setAnalyticsUser(currentUser?.id ?? null)
      setDataReady(false)
      setItems([]); setEvents([]); setTrips([]); setFeedback([]); setProfile(profileDefault)
      if (!currentUser) { setDataReady(true); return }
      const [wardrobe, eventRows, tripRows, feedbackRows, profileRow] = await Promise.all([
        supabase.from('wardrobe_items').select('id,data').eq('user_id', currentUser.id),
        supabase.from('events').select('id,data').eq('user_id', currentUser.id),
        supabase.from('trips').select('id,data').eq('user_id', currentUser.id),
        supabase.from('feedback').select('id,data').eq('user_id', currentUser.id),
        supabase.from('profiles').select('data').eq('user_id', currentUser.id).maybeSingle()
      ])
      if (!active) return
      const error = wardrobe.error || eventRows.error || tripRows.error || profileRow.error
      if (error) {
        console.error('Supabase load error:', error)
        notify('Не удалось загрузить данные. Проверь подключение.')
      } else {
        setItems((wardrobe.data ?? []).map(row => row.data as Item).filter(item => !item.id.startsWith('demo-')).sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
        setEvents((eventRows.data ?? []).map(row => row.data as EventItem))
        setTrips((tripRows.data ?? []).map(row => row.data as Trip))
        setFeedback((feedbackRows.data ?? []).map(row => row.data as Feedback)) // таблицы может не быть до миграции — не критично
        const stored = profileRow.data?.data as Profile | undefined
        if (!stored) track('signup')
        // Старые профили: город был строкой, считаем онбординг пройденным.
        setProfile(stored ? { ...profileDefault, ...stored, onboarded: stored.onboarded ?? Boolean(stored.city) } : profileDefault)
      }
      setDataReady(true)
    }
    supabase.auth.getSession().then(({ data }) => { void load(data.session?.user ?? null); setAuthLoading(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_DELETED' as never) void load(session?.user ?? null)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  const saveRecord = useCallback(async (table: Table, id: string, data: unknown) => {
    if (!user) return
    const { error } = await supabase.from(table).upsert({ id, user_id: user.id, data, updated_at: new Date().toISOString() }, { onConflict: 'user_id,id' })
    if (error) { console.error(error); notify('Не удалось сохранить — проверь интернет') }
  }, [user])
  const deleteRecord = async (table: Table, id: string) => {
    if (!user) return
    const { error } = await supabase.from(table).delete().eq('user_id', user.id).eq('id', id)
    if (error) { console.error(error); notify('Не удалось удалить запись') }
  }

  // Профиль сохраняется с задержкой, чтобы не писать в базу на каждый символ.
  useEffect(() => {
    if (!user || !dataReady || profile === profileDefault) return
    const timer = window.setTimeout(async () => {
      const { error } = await supabase.from('profiles').upsert({ user_id: user.id, data: profile, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (error) { console.error(error); notify('Не удалось сохранить профиль') }
    }, 500)
    return () => window.clearTimeout(timer)
  }, [profile, user, dataReady])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 3200)
    return () => clearTimeout(timer)
  }, [toast])

  // ------------------------------------------------------------------ вещи

  const upsertItem = (item: Item) => {
    setItems(previous => previous.some(old => old.id === item.id) ? previous.map(old => old.id === item.id ? item : old) : [item, ...previous])
    void saveRecord('wardrobe_items', item.id, item)
  }

  const queue = useUploadQueue(user?.id ?? null, item => { upsertItem(item); track('items_uploaded', { count: 1 }) })

  // Порог 10 вещей: сразу после 10-й — первый образ на сегодня (ТЗ, задача 10).
  const previousCount = useRef<number | null>(null)
  useEffect(() => {
    if (!dataReady) return
    const before = previousCount.current
    previousCount.current = items.length
    if (before !== null && before < 10 && items.length >= 10) {
      track('threshold_10_reached', { items: items.length })
      notify('10 вещей! Собираем первый образ на сегодня')
      const start = `${String(Math.min(21, new Date().getHours() + 1)).padStart(2, '0')}:00`
      setUploadOpen(false)
      setFlowEvent({ title: 'Сегодня', kind: 'Другое', date: todayISO(), start, end: `${String(Math.min(23, Number(start.slice(0, 2)) + 4)).padStart(2, '0')}:00`, place: '', outside: 'Смешанно', walking: true, comment: '' })
    }
  }, [items.length, dataReady])

  /** Удаление вещи удаляет фото и убирает вещь из запланированных образов и чемоданов (задача 21). */
  const removeItem = async (item: Item) => {
    if (!confirm(`Удалить «${item.name}»? Фото тоже удалится.`)) return
    setItems(previous => previous.filter(old => old.id !== item.id))
    void deleteRecord('wardrobe_items', item.id)
    void deleteItemPhotos(item)
    let touched = 0
    const nextEvents = events.map(event => {
      if (!event.outfit?.itemIds.includes(item.id)) return event
      touched++
      const next = { ...event, outfit: undefined }
      void saveRecord('events', next.id, next)
      return next
    })
    const nextTrips = trips.map(trip => {
      if (!trip.plan?.itemIds.includes(item.id)) return trip
      touched++
      const next: Trip = {
        ...trip,
        checklist: trip.checklist.filter(check => check.id !== itemCheckId(item.id)),
        plan: { ...trip.plan, itemIds: trip.plan.itemIds.filter(id => id !== item.id), days: trip.plan.days.map(day => day.outfit?.itemIds.includes(item.id) ? { ...day, outfit: null } : day) }
      }
      void saveRecord('trips', next.id, next)
      return next
    })
    setEvents(nextEvents); setTrips(nextTrips)
    setItemEditor(null)
    notify(touched ? `Вещь удалена и убрана из ${touched} запланированных образов и чемоданов — их стоит обновить` : 'Вещь удалена')
  }

  // ------------------------------------------------------------------ события и образы

  const saveEvent = (event: EventItem, options: { pickOutfit: boolean }) => {
    const isNew = !events.some(item => item.id === event.id)
    setEvents(previous => isNew ? [...previous, event] : previous.map(item => item.id === event.id ? event : item))
    void saveRecord('events', event.id, event)
    if (isNew) track('event_created', { kind: event.kind })
    setEventEditor(false)
    if (options.pickOutfit) openFlow(event)
    else notify('Событие сохранено')
  }

  const removeEvent = (id: string) => {
    if (!confirm('Удалить это событие?')) return
    setEvents(previous => previous.filter(event => event.id !== id))
    void deleteRecord('events', id)
    notify('Событие удалено')
  }

  const openFlow = (event: DraftEvent) => {
    if (items.length < 10) {
      notify(`Подбор откроется после 10 вещей — сейчас ${items.length}`)
      setTab('wardrobe')
      return
    }
    setFlowEvent(event)
  }

  /** Образы последних дней — не предлагать одно и то же подряд. */
  const recentOutfits = useMemo(() => {
    const from = addDays(todayISO(), -3), to = addDays(todayISO(), 1)
    return events.filter(event => event.outfit && event.date >= from && event.date <= to).map(event => event.outfit!.itemIds)
  }, [events])

  /** Выученные предпочтения — пересчитываются при каждой новой реакции. */
  const preferences = useMemo(() => buildPreferences(feedback, items), [feedback, items])

  const recordFeedback = (entry: Omit<Feedback, 'id' | 'createdAt'>) => {
    const row: Feedback = { ...entry, id: uid(), createdAt: new Date().toISOString() }
    setFeedback(previous => [...previous, row])
    void saveRecord('feedback', row.id, row)
  }

  const chooseOutfit = (outfit: Outfit, weather: WeatherSummary, { take }: { take: boolean }) => {
    if (!flowEvent) return
    const saved: SavedOutfit = { ...outfit, chosenAt: new Date().toISOString(), weatherSnapshot: weather }
    const event: EventItem = 'id' in flowEvent ? { ...flowEvent, outfit: saved, weatherSnapshot: weather } : { ...flowEvent, id: uid(), outfit: saved, weatherSnapshot: weather }
    const isNew = !events.some(item => item.id === event.id)
    setEvents(previous => isNew ? [...previous, event] : previous.map(item => item.id === event.id ? event : item))
    void saveRecord('events', event.id, event)
    if (isNew) track('event_created', { kind: event.kind, adhoc: true })
    if (take) {
      track('outfit_take', { mode: outfit.mode, source: outfit.source })
      recordFeedback({ eventId: event.id, outfitId: outfit.id, itemIds: outfit.itemIds, action: 'take', mode: outfit.mode })
      outfit.itemIds.forEach(id => { const item = items.find(value => value.id === id); if (item) upsertItem({ ...item, likes: (item.likes ?? 0) + 1 }) })
    } else track('event_in_calendar', { withOutfit: true })
    setFlowEvent(null)
    notify(take ? 'Отличный выбор! Образ сохранён в событие' : `Образ сохранён в календарь на ${new Date(event.date + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`)
  }

  const outfitOther = (outfit: Outfit, action: 'take' | 'other', mode: OutfitMode) => {
    track('outfit_other', { mode })
    recordFeedback({ eventId: flowEvent && 'id' in flowEvent ? flowEvent.id : undefined, outfitId: outfit.id, itemIds: outfit.itemIds, action, mode })
  }

  // ------------------------------------------------------------------ «Было удобно?» после события (задача 16)

  const feedbackEvent = useMemo(() => {
    const today = todayISO(), now = nowHHMM(), from = addDays(today, -3)
    return events
      .filter(event => event.outfit && !event.feedbackDone && event.date >= from && (event.date < today || (event.date === today && event.end <= now)))
      .sort((a, b) => (b.date + b.end).localeCompare(a.date + a.end))[0] ?? null
  }, [events])

  const answerFeedback = (event: EventItem, answer: ComfortAnswer) => {
    const outfitItems = (event.outfit?.itemIds ?? []).map(id => items.find(item => item.id === id)).filter((item): item is Item => Boolean(item))
    recordFeedback({ eventId: event.id, outfitId: event.outfit!.id, itemIds: event.outfit!.itemIds, comfortable: answer.comfortable, problems: answer.problems, liked: answer.liked ?? undefined })
    track('feedback_comfort', { comfortable: answer.comfortable, problems: answer.problems, liked: answer.liked })
    // Жалобы снижают приоритет вещей в следующих подборах.
    const blame = (item: Item) => {
      if (answer.problems.some(p => p === 'натирало' || p === 'неудобно')) return item.category === 'Обувь'
      if (answer.problems.some(p => p === 'замёрзла' || p === 'промокла')) return item.category === 'Верхняя одежда' || item.category === 'Обувь'
      if (answer.problems.includes('жарко')) return item.warmth >= 3
      return false
    }
    for (const item of outfitItems) {
      let next = item
      if (!answer.comfortable && blame(item)) next = { ...next, complaints: (next.complaints ?? 0) + 1 }
      if (answer.liked) next = { ...next, likes: (next.likes ?? 0) + 1 }
      if (answer.tagShoes && item.category === 'Обувь' && !(item.tags ?? []).includes('натирает')) next = { ...next, tags: [...(next.tags ?? []), 'натирает'] }
      if (next !== item) upsertItem(next)
    }
    const done = { ...event, feedbackDone: true }
    setEvents(previous => previous.map(item => item.id === done.id ? done : item))
    void saveRecord('events', done.id, done)
    notify(answer.tagShoes ? 'Спасибо! Добавили метку «натирает» — учтём в подборе' : 'Спасибо! Учтём в следующих подборах')
  }

  const skipFeedback = (event: EventItem) => {
    const done = { ...event, feedbackDone: true }
    setEvents(previous => previous.map(item => item.id === done.id ? done : item))
    void saveRecord('events', done.id, done)
  }

  // ------------------------------------------------------------------ перепроверка погоды за 1–2 дня (задача 18)

  const weatherAlerts: WeatherAlert[] = useMemo(() => {
    if (!forecast || profile.notifications?.weather === false) return []
    const today = todayISO(), until = addDays(today, 2)
    return events
      .filter(event => event.outfit && event.date >= today && event.date <= until && (!event.place || event.place.toLocaleLowerCase('ru-RU') === forecast.place.name.toLocaleLowerCase('ru-RU')))
      .filter(event => !(event.date === today && event.start <= nowHHMM()))
      .flatMap(event => {
        const fresh = eventWeather(forecast, event.date, event.start, event.end)
        const before = event.outfit?.weatherSnapshot ?? event.weatherSnapshot
        if (!weatherChangedSignificantly(before, fresh)) return []
        const label = event.title || event.kind
        return [{ event, text: before?.known ? `Погода на «${label}» изменилась: ${formatSummary(fresh)}` : `Появился прогноз на «${label}»: ${formatSummary(fresh)}` }]
      })
  }, [events, forecast, profile.notifications?.weather])

  // ------------------------------------------------------------------ поездки (задача 17)

  const tripContext = (trip: Trip): Omit<StylistEvent, 'durationHours'> & { durationHours: number } => ({
    title: trip.city, kind: TRIP_EVENT[trip.kind] ?? 'Прогулка', outside: 'Смешанно',
    walking: trip.kind === 'Отдых' || (trip.activities ?? []).includes('Прогулки'), durationHours: 10,
    comment: (trip.activities ?? []).join(', ')
  })

  const withChecklist = (trip: Trip, itemIds: string[]): Trip['checklist'] => {
    const keep = trip.checklist.filter(check => !check.id.startsWith('item-') || itemIds.includes(check.id.slice(5)))
    const existing = new Set(keep.map(check => check.id))
    const added = itemIds.filter(id => !existing.has(itemCheckId(id))).map(id => ({ id: itemCheckId(id), label: items.find(item => item.id === id)?.name ?? 'Вещь', done: false }))
    return [...keep, ...added]
  }

  const planTripFor = async (trip: Trip): Promise<Trip> => {
    const place = trip.place ?? await resolvePlace(trip.city).catch(() => null)
    if (!place) { notify('Не нашли город поездки — выбери его из списка'); return trip }
    const days = await tripWeather(place, trip.from, trip.to)
    const available = items.filter(item => !(trip.excludedItemIds ?? []).includes(item.id)).map(toStylistItem)
    const plan = planTrip(available, days, { profile: toStylistProfile(profile), event: tripContext(trip), preferences })
    return { ...trip, place, checklist: withChecklist(trip, plan.itemIds), plan: { ...plan, generatedAt: new Date().toISOString() } }
  }

  const storeTrip = (trip: Trip) => {
    setTrips(previous => previous.some(item => item.id === trip.id) ? previous.map(item => item.id === trip.id ? trip : item) : [...previous, trip])
    void saveRecord('trips', trip.id, trip)
  }

  const saveTrip = async (trip: Trip) => {
    const isNew = !trips.some(item => item.id === trip.id)
    storeTrip(trip)
    setTripEditor(false)
    if (isNew) track('trip_created', { days: trip.plan?.days.length, kind: trip.kind })
    if (items.length < 10) { notify('Поездка сохранена. Образы соберём, когда в гардеробе будет 10 вещей'); return }
    setPlanning(trip.id)
    try { storeTrip(await planTripFor(trip)); notify('Чемодан собран') }
    catch { notify('Не удалось получить погоду — проверь интернет и нажми «Пересобрать»') }
    finally { setPlanning(null) }
  }

  const replanDay = (trip: Trip, date: string) => {
    const plan = trip.plan
    const day = plan?.days.find(d => d.date === date)
    if (!plan || !day) return
    const available = items.filter(item => !(trip.excludedItemIds ?? []).includes(item.id)).map(toStylistItem)
    const others = plan.days.filter(d => d.date !== date && d.outfit).map(d => d.outfit!.itemIds)
    const packed = new Set(others.flat())
    const result = generateByRules(available, { profile: toStylistProfile(profile), event: tripContext(trip), weather: day.weather, mode: 'баланс', recent: others, preferences }, 12)
    const current = day.outfit ? outfitKey(day.outfit.itemIds) : ''
    const next = result.outfits
      .filter(outfit => outfitKey(outfit.itemIds) !== current)
      .sort((a, b) => a.itemIds.filter(id => !packed.has(id)).length - b.itemIds.filter(id => !packed.has(id)).length)[0]
    if (!next) { notify('Других вариантов на этот день нет — добавь вещей'); return }
    const days = plan.days.map(d => d.date === date ? { ...d, outfit: next } : d)
    const itemIds = [...new Set(days.flatMap(d => d.outfit?.itemIds ?? []))]
    storeTrip({ ...trip, checklist: withChecklist(trip, itemIds), plan: { ...plan, days, itemIds } })
  }

  const removeTripItem = async (trip: Trip, itemId: string) => {
    const next = { ...trip, excludedItemIds: [...(trip.excludedItemIds ?? []), itemId] }
    setPlanning(trip.id)
    try { storeTrip(await planTripFor(next)); notify('Заменили вещь и пересобрали образы') } finally { setPlanning(null) }
  }

  const toggleCheck = (trip: Trip, checkId: string) => {
    const next = { ...trip, checklist: trip.checklist.map(check => check.id === checkId ? { ...check, done: !check.done } : check) }
    if (next.checklist.find(check => check.id === checkId)?.done) track('checklist_checked')
    storeTrip(next)
  }

  // ------------------------------------------------------------------ переходы из уведомлений

  useEffect(() => {
    if (!dataReady || !user) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('from') === 'push') track('notification_opened')
    const eventId = params.get('event'), tripId = params.get('trip')
    const event = eventId ? events.find(item => item.id === eventId) : null
    if (event) { setTab('calendar'); setEventDate(event.date); setEventEditor(event) }
    if (tripId) setTab('trips')
    if (eventId || tripId) window.history.replaceState(null, '', window.location.pathname)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataReady, user])

  const signOut = async () => { const { error } = await supabase.auth.signOut(); if (error) notify('Не удалось выйти') }
  const deleteAll = async () => {
    await deleteAccount()
    await supabase.auth.signOut().catch(() => undefined)
    notify('Все данные удалены')
  }

  // ------------------------------------------------------------------ разметка

  if (authLoading) return <div className="auth-page"><div className="auth-card">Загрузка…</div></div>
  if (!user) return <AuthScreen />
  if (!dataReady) return <div className="auth-page"><div className="auth-card">Загружаем твои данные…</div></div>

  const today = todayISO()
  const todayEvents = events.filter(event => event.date === today).sort((a, b) => a.start.localeCompare(b.start))
  const heading = nav.find(item => item.id === tab)?.label

  return (
    <PhotoProvider items={items}>
      <div className="shell">
        <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
          <button className="brand" onClick={() => setTab('today')}>
            <span className="brand-mark">m</span>
            <span>MUSE<span className="brand-dot">.</span><small>ИИ-СТИЛИСТ</small></span>
          </button>
          <div className="side-label">РАЗДЕЛЫ</div>
          <nav>
            {nav.map(item => (
              <button key={item.id} className={`nav-item ${tab === item.id ? 'selected' : ''}`} onClick={() => { setTab(item.id); setMobileNav(false) }}>
                <item.icon size={18} /><span>{item.label}</span>{tab === item.id && <i />}
              </button>
            ))}
          </nav>
          <div className="side-bottom">
            <div className="side-weather">
              <div className="weather-mini"><Cloud size={17} /><b>{forecast ? `${Math.round(forecast.current.temperature)}°` : weatherLoading ? '…' : '—'}</b></div>
              <span>{forecast?.place.name ?? profile.city}</span>
              <small>{forecast ? weatherDescription(forecast.current.code, forecast.current.isDay) : weatherError || 'Загружаем погоду…'}</small>
            </div>
            <button className="user-mini" onClick={() => setTab('profile')}>
              <span className="avatar">{(user.email ?? 'M').slice(0, 1).toUpperCase()}</span>
              <span><b>Мой профиль</b><small>{profile.city}</small></span>
              <Settings size={16} />
            </button>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <button className="mobile-menu" aria-label="Меню" onClick={() => setMobileNav(!mobileNav)}><Menu /></button>
            <div className="crumb">MUSE <span>/</span> <span>{heading?.toUpperCase()}</span></div>
            <div className="top-actions">
              {queue.active > 0 && <button className="upload-pill" onClick={() => setUploadOpen(true)}><UploadCloud size={15} /> {queue.active}</button>}
              <span className="date-now">{new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
              <button className="icon-btn" aria-label="Уведомления" onClick={() => setTab('profile')}><Bell size={18} /></button>
            </div>
          </header>

          <main className="content">
            {tab === 'today' && (
              <Today
                items={items} events={todayEvents} city={profile.city} forecast={forecast} weatherLoading={weatherLoading} weatherError={weatherError}
                alerts={weatherAlerts} feedbackEvent={feedbackEvent}
                onNew={() => { setEventDate(today); setEventEditor(null) }}
                onOpen={event => setEventEditor(event)}
                onPick={openFlow}
                onQuick={openFlow}
                onWardrobe={() => setTab('wardrobe')}
                onFeedback={answerFeedback}
                onSkipFeedback={skipFeedback}
              />
            )}
            {tab === 'calendar' && (
              <CalendarPage
                events={events} trips={trips} items={items} month={month} setMonth={setMonth}
                onAdd={date => { setEventDate(date); setEventEditor(null) }}
                onEdit={event => { setEventDate(event.date); setEventEditor(event) }}
                onDelete={removeEvent}
                onPick={openFlow}
                onTrip={() => setTab('trips')}
              />
            )}
            {tab === 'wardrobe' && (
              <Wardrobe
                items={items} dismissed={profile.dismissedAdvice ?? []} uploading={queue.active}
                onDismiss={id => setProfile({ ...profile, dismissedAdvice: [...(profile.dismissedAdvice ?? []), id] })}
                onAdd={() => setUploadOpen(true)}
                onSelect={setItemEditor}
              />
            )}
            {tab === 'trips' && (
              <TripsPage
                trips={trips} items={items} planning={planning}
                onAdd={() => setTripEditor(null)}
                onEdit={trip => setTripEditor(trip)}
                onDelete={trip => { if (confirm('Удалить поездку?')) { setTrips(previous => previous.filter(item => item.id !== trip.id)); void deleteRecord('trips', trip.id) } }}
                onToggle={toggleCheck}
                onReplanDay={replanDay}
                onRemoveItem={(trip, id) => { void removeTripItem(trip, id) }}
                onReplan={trip => { void saveTrip(trip) }}
                onWardrobe={() => setTab('wardrobe')}
              />
            )}
            {tab === 'profile' && (
              <ProfilePage profile={profile} setProfile={setProfile} userId={user.id} email={user.email ?? user.phone ?? ''} itemsCount={items.length} notify={notify} onSignOut={signOut} onDeleteAll={deleteAll} />
            )}
          </main>
          <footer className="footer"><span>MUSE · ИИ-СТИЛИСТ</span><span>СОБЕРИСЬ ЗА МИНУТУ — И БУДЬ В КОМФОРТЕ ВЕСЬ ДЕНЬ</span></footer>
        </div>

        <nav className="mobile-tabs">
          {nav.map(item => (
            <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}><item.icon size={19} /><span>{item.label}</span></button>
          ))}
        </nav>

        {!profile.onboarded && (
          <QuickProfile profile={profile} onDone={next => { setProfile(next); if (items.length < 10) { setTab('wardrobe'); setUploadOpen(true) } }} />
        )}
        {eventEditor !== false && (
          <EventModal event={eventEditor || undefined} defaultDate={eventDate} profile={profile} forecast={forecast} items={items}
            onClose={() => setEventEditor(false)} onSave={saveEvent} onDelete={removeEvent} />
        )}
        {uploadOpen && <BatchUpload queue={queue} itemsCount={items.length} onClose={() => setUploadOpen(false)} onManual={() => { setUploadOpen(false); setItemEditor('new') }} />}
        {itemEditor && (
          <ItemForm
            item={itemEditor === 'new' ? undefined : itemEditor}
            userId={user.id}
            onClose={() => setItemEditor(null)}
            onSave={item => { upsertItem(item); setItemEditor(null); notify('Карточка сохранена') }}
            onDelete={itemEditor === 'new' ? undefined : () => { void removeItem(itemEditor) }}
          />
        )}
        {tripEditor !== false && <TripForm trip={tripEditor || undefined} onClose={() => setTripEditor(false)} onSave={trip => { void saveTrip(trip) }} />}
        {flowEvent && (
          <OutfitFlow
            event={flowEvent} items={items} profile={profile} forecast={forecast} recent={recentOutfits} preferences={preferences}
            onClose={() => setFlowEvent(null)}
            onChoose={chooseOutfit}
            onFeedback={outfitOther}
            onWardrobe={() => { setFlowEvent(null); setTab('wardrobe') }}
          />
        )}
        {toast && <div className="toast" role="status"><CheckCircle2 size={17} />{toast}</div>}
      </div>
    </PhotoProvider>
  )
}

export default App
