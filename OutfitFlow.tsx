// Подбор образов и экран результатов (ТЗ, задачи 12–16).
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarPlus, Check, CheckCircle2, Layers, RefreshCw, Shirt, Sparkles } from 'lucide-react'
import { Modal, OutfitCollage } from './ui'
import type { EventItem, Item, Outfit, OutfitMode, Profile, WeatherSummary } from '../types'
import type { Preferences } from '../../supabase/functions/_shared/stylist.ts'
import { generateOutfits, outfitKey, type OutfitResult } from '../lib/ai'
import { eventHours, eventWeather, formatSummary, todayISO, weatherSymbol, type Forecast } from '../lib/weather'
import { forecastForPlace } from '../hooks/useForecast'
import { track } from '../lib/analytics'
import { MODES, durationHours } from '../lib/constants'

type Props = {
  event: EventItem | Omit<EventItem, 'id'>
  items: Item[]
  profile: Profile
  forecast: Forecast | null
  recent: string[][]
  preferences?: Preferences
  onClose: () => void
  /** Сохранить выбранный образ в событие (создать событие, если его ещё нет). */
  onChoose: (outfit: Outfit, weather: WeatherSummary, options: { take: boolean }) => void
  onFeedback: (outfit: Outfit, action: 'take' | 'other', mode: OutfitMode) => void
  onWardrobe: () => void
}

export function OutfitFlow({ event, items, profile, forecast, recent, preferences, onClose, onChoose, onFeedback, onWardrobe }: Props) {
  const [mode, setMode] = useState<OutfitMode>('баланс')
  const [weather, setWeather] = useState<WeatherSummary | null>(null)
  const [hours, setHours] = useState<ReturnType<typeof eventHours>>([])
  const [result, setResult] = useState<OutfitResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [shown, setShown] = useState<string[]>([])
  const [replacing, setReplacing] = useState<string | null>(null)
  const byId = useMemo(() => new Map(items.map(item => [item.id, item])), [items])

  const stylistEvent = useMemo(() => ({
    title: event.title, kind: event.kind, outside: event.outside, walking: event.walking,
    durationHours: durationHours(event.start, event.end), comment: event.comment
  }), [event])

  // Погода на интервал события, по месту события (если указано) или по городу профиля.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const source = await forecastForPlace(event.place, forecast, profile.place)
      if (cancelled) return
      setWeather(eventWeather(source, event.date, event.start, event.end))
      setHours(eventHours(source, event.date, event.start, event.end))
    })()
    return () => { cancelled = true }
  }, [event.place, event.date, event.start, event.end, forecast, profile.place])

  const load = async (nextMode: OutfitMode, exclude: string[] = []) => {
    if (!weather) return
    setLoading(true); setError('')
    try {
      const data = await generateOutfits({ items, profile, event: stylistEvent, weather, mode: nextMode, recent, exclude, preferences })
      setResult(data)
      setShown(previous => [...new Set([...previous, ...data.outfits.map(outfit => outfitKey(outfit.itemIds))])])
      if (data.outfits.length) track('outfits_received', { mode: nextMode, count: data.outfits.length, source: data.source })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось подобрать образ')
    } finally { setLoading(false) }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (weather) void load(mode) }, [weather])

  const switchMode = (next: OutfitMode) => {
    setMode(next)
    track('outfit_mode', { mode: next })
    void load(next)
  }

  /** «Другой вариант»: заменить карточку новым образом, не повторяя показанные. */
  const another = async (outfit: Outfit) => {
    if (!weather || !result) return
    onFeedback(outfit, 'other', mode)
    setReplacing(outfit.id)
    try {
      const data = await generateOutfits({ items, profile, event: stylistEvent, weather, mode, recent, preferences, exclude: [...shown, ...result.outfits.map(o => outfitKey(o.itemIds))] })
      const fresh = data.outfits.find(candidate => !result.outfits.some(o => outfitKey(o.itemIds) === outfitKey(candidate.itemIds)))
      setResult({ ...result, outfits: fresh ? result.outfits.map(o => o.id === outfit.id ? fresh : o) : result.outfits.filter(o => o.id !== outfit.id), missing: fresh ? result.missing : data.missing })
      if (fresh) setShown(previous => [...previous, outfitKey(fresh.itemIds)])
    } finally { setReplacing(null) }
  }

  const title = loading && !result ? 'Подбираем образы' : result?.outfits.length ? 'Твои образы' : 'Подбор образов'
  const when = event.date === todayISO() ? 'сегодня' : new Date(event.date + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

  return (
    <Modal title={title} subtitle={`${event.title || event.kind} · ${when}, ${event.start}–${event.end}`} onClose={onClose} wide>
      <div className="outfit-weather">
        {weather ? (
          <>
            <b>{weather.known ? 'Погода на время события' : 'Погода'}</b>
            <span>{formatSummary(weather)}</span>
            {hours.length > 0 && (
              <div className="hour-strip">
                {hours.map(hour => (
                  <div key={hour.time}>
                    <span>{hour.time.slice(11, 16)}</span>
                    <span className="hour-icon">{weatherSymbol(hour.code)}</span>
                    <b>{Math.round(hour.temperature)}°</b>
                    <small>{hour.precipitationProbability == null ? '' : `${hour.precipitationProbability}%`}</small>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : <span>Получаем прогноз…</span>}
      </div>

      <div className="segmented mode-switch" role="tablist" aria-label="Режим подбора">
        {MODES.map(option => (
          <button key={option.id} role="tab" aria-selected={mode === option.id} className={mode === option.id ? 'active' : ''} disabled={loading} onClick={() => switchMode(option.id)}>{option.label}</button>
        ))}
      </div>

      {loading && (
        <div className="ai-loading-state" role="status" aria-live="polite">
          <div className="ai-loading-orbit"><Sparkles size={28} /></div>
          <strong>Собираем комплекты из твоего гардероба</strong>
          <p>Сопоставляем вещи, погоду на всё время события и твои заметки о комфорте.</p>
          <div className="ai-loading-track"><span /></div>
        </div>
      )}

      {!loading && error && <div className="ai-error-state" role="alert"><b>Подбор не выполнен</b><p>{error}</p><button className="btn primary" onClick={() => { void load(mode) }}>Попробовать ещё раз</button></div>}

      {!loading && result && (
        <>
          {result.source === 'rules' && result.outfits.length > 0 && <p className="form-hint">Подобрал встроенный стилист MUSE — учитывает погоду, твои заметки и прошлые выборы{result.generalNote ? `. ${result.generalNote}` : ''}.</p>}
          {result.source === 'ai' && result.generalNote && <p className="ai-general-note">{result.generalNote}</p>}
          {result.outfits.length === 0 && (
            <div className="ai-error-state">
              <b>Из этих вещей хороший образ не собрать</b>
              <p>Честно: для такой погоды и события в гардеробе не хватает вещей.</p>
            </div>
          )}
          <div className="ai-outfit-list">
            {result.outfits.map((outfit, index) => {
              const outfitItems = outfit.itemIds.map(id => byId.get(id)).filter((item): item is Item => Boolean(item))
              return (
                <article className="ai-outfit-card" key={outfit.id}>
                  <div className="ai-outfit-heading">
                    <div><span>ВАРИАНТ {index + 1}</span><h3>{outfit.title}</h3></div>
                    <div className="outfit-scores" aria-label="Оценки">
                      <span title="Красота">✦ {outfit.beauty.toFixed(1)}</span>
                      <span title="Комфорт">☁ {outfit.comfort.toFixed(1)}</span>
                    </div>
                  </div>
                  <OutfitCollage items={outfitItems} />
                  <div className="outfit-item-names">{outfitItems.map(item => item.name).join(' · ')}</div>
                  <p className="ai-outfit-explanation">{outfit.explanation}</p>
                  {outfit.layerTip && <div className="ai-comfort-note"><Layers size={15} /> {outfit.layerTip}</div>}
                  {outfit.warnings.length > 0 ? (
                    <div className="outfit-price">
                      <b><AlertTriangle size={15} /> Цена образа</b>
                      {outfit.warnings.map((warning, i) => <span key={i}>{warning.text}. <em>{warning.fix}.</em></span>)}
                    </div>
                  ) : <div className="ai-comfort-note"><CheckCircle2 size={15} /> {outfit.comfortNote}</div>}
                  <div className="outfit-actions">
                    <button className="btn primary" onClick={() => onChoose(outfit, weather!, { take: true })}><Check size={15} /> Беру</button>
                    <button className="btn secondary" disabled={replacing === outfit.id} onClick={() => { void another(outfit) }}><RefreshCw size={15} /> {replacing === outfit.id ? 'Ищем…' : 'Другой вариант'}</button>
                    <button className="btn secondary" onClick={() => onChoose(outfit, weather!, { take: false })}><CalendarPlus size={15} /> В календарь</button>
                  </div>
                </article>
              )
            })}
          </div>
          {result.missing.length > 0 && (
            <div className="advice-card">
              <Shirt size={18} />
              <div>
                <b>Чтобы образов было больше</b>
                {result.missing.map(tip => <span key={tip}>{tip}</span>)}
              </div>
              <button className="text-link" onClick={onWardrobe}>В гардероб</button>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
