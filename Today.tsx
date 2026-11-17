// Экран «Сегодня» (ТЗ, задача 20): погода по часам, события дня с образами, быстрый подбор.
import { AlertTriangle, ArrowRight, CalendarDays, ChevronRight, Cloud, Plus, Shirt, Sparkles, Wind } from 'lucide-react'
import { OutfitCollage, PageHead } from '../components/ui'
import { quickTemplates } from '../lib/constants'
import { FeedbackPrompt, type ComfortAnswer } from '../components/FeedbackPrompt'
import type { EventItem, Item } from '../types'
import { todayISO, weatherDescription, weatherSymbol, type Forecast } from '../lib/weather'

export type WeatherAlert = { event: EventItem; text: string }

export function Today({ items, events, city, forecast, weatherLoading, weatherError, alerts, feedbackEvent, onNew, onOpen, onPick, onQuick, onWardrobe, onFeedback, onSkipFeedback }: {
  items: Item[]
  events: EventItem[]
  city: string
  forecast: Forecast | null
  weatherLoading: boolean
  weatherError: string
  alerts: WeatherAlert[]
  feedbackEvent: EventItem | null
  onNew: () => void
  onOpen: (event: EventItem) => void
  onPick: (event: EventItem) => void
  onQuick: (event: Omit<EventItem, 'id'>) => void
  onWardrobe: () => void
  onFeedback: (event: EventItem, answer: ComfortAnswer) => void
  onSkipFeedback: (event: EventItem) => void
}) {
  const today = todayISO()
  const now = forecast?.current.time.slice(0, 13) ?? ''
  const hours = forecast ? forecast.hours.filter(hour => hour.time.slice(0, 13) >= now && hour.time.slice(0, 10) <= today).slice(0, 18) : []
  const todayDay = forecast?.days.find(day => day.date === today)
  const byId = new Map(items.map(item => [item.id, item]))
  const locked = items.length < 10

  return (
    <div className="page">
      <PageHead
        eyebrow={new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}
        title="Твой день"
        desc="Погода, планы и образ — за один взгляд."
        action={<button className="btn primary" onClick={onNew}><Plus size={17} /> Новое событие</button>}
      />

      {alerts.map(alert => (
        <button key={alert.event.id} className="alert-banner" onClick={() => onPick(alert.event)}>
          <AlertTriangle size={18} />
          <span><b>{alert.text}</b><small>Нажми, чтобы обновить образ</small></span>
          <ChevronRight size={17} />
        </button>
      ))}

      {feedbackEvent && <FeedbackPrompt event={feedbackEvent} items={items} onAnswer={answer => onFeedback(feedbackEvent, answer)} onSkip={() => onSkipFeedback(feedbackEvent)} />}

      <div className="dashboard-grid">
        <section className="panel weather-panel">
          <div className="panel-title"><span>ПОГОДА · {forecast?.place.name ?? city}</span><Cloud size={17} /></div>
          {forecast ? (
            <>
              <div className="weather-reading">
                <span className="weather-icon">{weatherSymbol(forecast.current.code, forecast.current.isDay)}</span>
                <strong>{Math.round(forecast.current.temperature)}°</strong>
              </div>
              <b>{weatherDescription(forecast.current.code, forecast.current.isDay)}</b>
              <div className="weather-stats">
                <span>Ощущается {Math.round(forecast.current.feelsLike)}°</span>
                <span><Wind size={15} /> {Math.round(forecast.current.wind)} м/с{forecast.current.gusts > forecast.current.wind + 3 ? `, порывы ${Math.round(forecast.current.gusts)}` : ''}</span>
                <span>Влажность {Math.round(forecast.current.humidity)}%</span>
                {todayDay && <span>Днём {Math.round(todayDay.tempMin)}…{Math.round(todayDay.tempMax)}°</span>}
              </div>
              <div className="hour-strip">
                {hours.map(hour => (
                  <div key={hour.time}>
                    <span>{hour.time.slice(11, 16)}</span>
                    <span className="hour-icon">{weatherSymbol(hour.code)}</span>
                    <b>{Math.round(hour.temperature)}°</b>
                    <small>{hour.precipitationProbability ? `${hour.precipitationProbability}%` : ''}</small>
                  </div>
                ))}
              </div>
              <small>Обновлено {new Date(forecast.fetchedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} · Open-Meteo</small>
            </>
          ) : weatherLoading ? <p>Получаем погоду для {city}…</p> : (
            <><b>Погода недоступна</b><p>{weatherError || `Не удалось получить данные для ${city}`}</p></>
          )}
        </section>

        <section className="panel events-panel">
          <div className="panel-title"><span>СЕГОДНЯ В ПЛАНАХ</span></div>
          {events.length ? events.map(event => {
            const outfitItems = (event.outfit?.itemIds ?? []).map(id => byId.get(id)).filter((item): item is Item => Boolean(item))
            return (
              <div className="today-event-card" key={event.id}>
                <button className="today-event" onClick={() => onOpen(event)}>
                  <span className="event-time">{event.start}</span>
                  <span className="event-info"><b>{event.title || event.kind}</b><small>{event.kind} · до {event.end}{event.place ? ` · ${event.place}` : ''}</small></span>
                  <ChevronRight size={17} />
                </button>
                {outfitItems.length ? (
                  <button className="today-outfit" onClick={() => onPick(event)} title="Подобрать заново"><OutfitCollage items={outfitItems} compact /></button>
                ) : (
                  <button className="btn secondary" disabled={locked} onClick={() => onPick(event)}><Sparkles size={15} /> Подобрать образ</button>
                )}
              </div>
            )
          }) : (
            <div className="empty-inline">
              <CalendarDays size={22} />
              <span>На сегодня событий нет — выбери, куда идёшь:</span>
            </div>
          )}
          {!events.length && (
            <div className="quick-templates">
              {quickTemplates().map(template => (
                <button key={template.label} disabled={locked} onClick={() => onQuick(template.event)}><Sparkles size={14} /> {template.label}</button>
              ))}
            </div>
          )}
          {locked && <p className="form-hint">Подбор откроется, когда в гардеробе будет 10 вещей.</p>}
        </section>

        <section className="panel stat-panel">
          <span>ГАРДЕРОБ</span>
          <strong>{items.length}<small> вещей</small></strong>
          <div className="progress"><i style={{ width: `${Math.min(items.length / 10 * 100, 100)}%` }} /></div>
          <p>{locked ? `${items.length} из 10 — до первого подбора осталось ${10 - items.length}` : 'Подбор образов открыт'}</p>
          <button className="text-link" onClick={onWardrobe}>{locked ? 'Добавить вещи' : 'Открыть гардероб'} <ArrowRight size={15} /></button>
        </section>
      </div>

      <section className="quick-row">
        <div><span className="eyebrow">БЫСТРЫЕ ДЕЙСТВИЯ</span><h3>Что планируем?</h3></div>
        <button onClick={onNew}><CalendarDays /> Запланировать событие <ArrowRight /></button>
        <button onClick={onWardrobe}><Shirt /> Добавить вещи <ArrowRight /></button>
      </section>
    </div>
  )
}
