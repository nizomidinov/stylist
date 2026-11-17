// Календарь (ТЗ, задача 18): месяц и неделя, события с образами, поездки как период с образами по дням.
import { useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Edit3, Luggage, Plus, Sparkles, Trash2 } from 'lucide-react'
import { OutfitCollage, PageHead } from '../components/ui'
import type { EventItem, Item, Trip } from '../types'
import { addDays, formatSummary, todayISO } from '../lib/weather'

const fmt = (iso: string, options: Intl.DateTimeFormatOptions) => new Date(iso + 'T12:00:00').toLocaleDateString('ru-RU', options)

export function CalendarPage({ events, trips, items, month, setMonth, onAdd, onEdit, onDelete, onPick, onTrip }: {
  events: EventItem[]
  trips: Trip[]
  items: Item[]
  month: Date
  setMonth: (date: Date) => void
  onAdd: (date: string) => void
  onEdit: (event: EventItem) => void
  onDelete: (id: string) => void
  onPick: (event: EventItem) => void
  onTrip: () => void
}) {
  const today = todayISO()
  const [selected, setSelected] = useState(today)
  const [mode, setMode] = useState<'month' | 'week'>('month')
  const byId = new Map(items.map(item => [item.id, item]))
  const year = month.getFullYear(), monthIndex = month.getMonth()
  const offset = (new Date(year, monthIndex, 1).getDay() + 6) % 7
  const days = new Date(year, monthIndex + 1, 0).getDate()
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, index) => index - offset + 1)
  const sorted = [...events].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))

  const weekStart = new Date(selected + 'T12:00:00')
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
  const weekDates = Array.from({ length: 7 }, (_, index) => { const date = new Date(weekStart); date.setDate(date.getDate() + index); return date.toLocaleDateString('en-CA') })

  const dayEvents = sorted.filter(event => event.date === selected)
  const dayTrips = trips.filter(trip => selected >= trip.from && selected <= trip.to)

  const row = (event: EventItem) => {
    const outfitItems = (event.outfit?.itemIds ?? []).map(id => byId.get(id)).filter((item): item is Item => Boolean(item))
    return (
      <div className="event-row" key={event.id}>
        <div className="event-date-block"><b>{event.start}</b><small>{fmt(event.date, { day: 'numeric', month: 'short' })}</small></div>
        <div className="event-row-info">
          <b>{event.title || event.kind}</b>
          <span>{event.kind}{event.place ? ` · ${event.place}` : ''}</span>
          <small>{event.start}–{event.end}{event.walking ? ' · много ходьбы' : ''}</small>
          {event.outfit?.weatherSnapshot && <small>{formatSummary(event.outfit.weatherSnapshot)}</small>}
          {outfitItems.length > 0 ? <OutfitCollage items={outfitItems} compact /> : (
            <button className="text-link" onClick={() => onPick(event)}><Sparkles size={14} /> Подобрать образ</button>
          )}
        </div>
        <div className="row-actions">
          <button title="Подобрать образ" onClick={() => onPick(event)}><Sparkles size={16} /></button>
          <button title="Редактировать" onClick={() => onEdit(event)}><Edit3 size={16} /></button>
          <button title="Удалить" onClick={() => onDelete(event.id)}><Trash2 size={16} /></button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <PageHead eyebrow="ПЛАНИРОВАНИЕ" title="Календарь" desc="Запланируй событие на любую дату и сразу подбери образ — или сохрани без него."
        action={<button className="btn primary" onClick={() => onAdd(selected)}><Plus size={17} /> Событие</button>} />
      <div className="calendar-layout">
        <section className="panel calendar-panel">
          <div className="calendar-toolbar">
            <div><h2>{month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</h2><span>{events.length} событий · {trips.length} поездок</span></div>
            <div className="calendar-tools">
              <button className={mode === 'month' ? 'active' : ''} onClick={() => setMode('month')}>Месяц</button>
              <button className={mode === 'week' ? 'active' : ''} onClick={() => setMode('week')}>Неделя</button>
              <button className="square-btn" aria-label="Назад" onClick={() => mode === 'month' ? setMonth(new Date(year, monthIndex - 1, 1)) : setSelected(addDays(selected, -7))}><ChevronLeft /></button>
              <button className="square-btn" aria-label="Вперёд" onClick={() => mode === 'month' ? setMonth(new Date(year, monthIndex + 1, 1)) : setSelected(addDays(selected, 7))}><ChevronRight /></button>
            </div>
          </div>
          {mode === 'month' ? (
            <>
              <div className="calendar-grid weekday-row">{['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map(day => <span key={day}>{day}</span>)}</div>
              <div className="calendar-grid">
                {cells.map((day, index) => {
                  const valid = day > 0 && day <= days
                  const iso = valid ? `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : ''
                  const hasEvent = events.some(event => event.date === iso)
                  const hasOutfit = events.some(event => event.date === iso && event.outfit)
                  const hasTrip = trips.some(trip => iso >= trip.from && iso <= trip.to)
                  return (
                    <button key={index} disabled={!valid} className={`day-cell ${selected === iso ? 'chosen' : ''} ${iso === today ? 'is-today' : ''} ${hasTrip ? 'in-trip' : ''}`} onClick={() => setSelected(iso)}>
                      <span>{valid ? day : ''}</span>
                      {hasEvent && <i className={hasOutfit ? 'with-outfit' : ''} />}
                      {hasTrip && <b />}
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="week-view">
              {weekDates.map(date => {
                const list = sorted.filter(event => event.date === date)
                const trip = trips.find(t => date >= t.from && date <= t.to)
                return (
                  <div key={date} className={`week-day ${date === today ? 'is-today' : ''}`}>
                    <button className="week-day-head" onClick={() => setSelected(date)}>{fmt(date, { weekday: 'short', day: 'numeric', month: 'short' })}{trip ? ` · ✈ ${trip.city}` : ''}</button>
                    {list.length ? list.map(row) : <button className="text-link" onClick={() => onAdd(date)}><Plus size={14} /> Добавить</button>}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="panel selected-day">
          <div className="selected-date">
            <div className="eyebrow">ВЫБРАННАЯ ДАТА</div>
            <h2>{fmt(selected, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          </div>
          <button className="btn secondary full" onClick={() => onAdd(selected)}><Plus size={16} /> Новое событие на дату</button>
          {dayTrips.map(trip => {
            const day = trip.plan?.days.find(d => d.date === selected)
            const outfitItems = (day?.outfit?.itemIds ?? []).map(id => byId.get(id)).filter((item): item is Item => Boolean(item))
            return (
              <button key={trip.id} className="trip-day-in-calendar" onClick={onTrip}>
                <span><Luggage size={15} /> Поездка: {trip.city}</span>
                {day && <small>{formatSummary(day.weather)}</small>}
                {outfitItems.length > 0 && <OutfitCollage items={outfitItems} compact />}
              </button>
            )
          })}
          {dayEvents.length ? dayEvents.map(row) : !dayTrips.length && (
            <div className="empty-day"><CalendarDays size={26} /><b>Пока свободно</b><span>Добавь событие на эту дату.</span></div>
          )}
          <div className="calendar-legend"><span><i /> Событие</span><span><i className="with-outfit" /> С образом</span><span><b /> Поездка</span></div>
        </section>
      </div>
    </div>
  )
}
