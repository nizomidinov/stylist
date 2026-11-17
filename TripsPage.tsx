// Чемодан в поездку (ТЗ, задача 17): погода по дням, список вещей по категориям, образы по дням, чек-лист.
import { Edit3, Lightbulb, Luggage, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { ItemPhoto, OutfitCollage, PageHead } from '../components/ui'
import type { Item, Trip } from '../types'
import { formatSummary } from '../lib/weather'
import { CATEGORIES, itemCheckId } from '../lib/constants'

const fmt = (iso: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }) => new Date(iso + 'T12:00:00').toLocaleDateString('ru-RU', options)

export function TripsPage({ trips, items, planning, onAdd, onEdit, onDelete, onToggle, onReplanDay, onRemoveItem, onReplan, onWardrobe }: {
  trips: Trip[]
  items: Item[]
  planning: string | null
  onAdd: () => void
  onEdit: (trip: Trip) => void
  onDelete: (trip: Trip) => void
  onToggle: (trip: Trip, checkId: string) => void
  onReplanDay: (trip: Trip, date: string) => void
  onRemoveItem: (trip: Trip, itemId: string) => void
  onReplan: (trip: Trip) => void
  onWardrobe: () => void
}) {
  const byId = new Map(items.map(item => [item.id, item]))
  const sorted = [...trips].sort((a, b) => a.from.localeCompare(b.from))

  return (
    <div className="page">
      <PageHead eyebrow="ПОЕЗДКИ" title="Чемодан без лишнего" desc="Меньше вещей — больше образов. Учитываем погоду в месте поездки."
        action={<button className="btn primary" onClick={onAdd}><Plus size={17} /> Новая поездка</button>} />

      {sorted.length === 0 ? (
        <div className="panel empty-trip">
          <Luggage size={34} />
          <h2>Поездок пока нет</h2>
          <p>Укажи город и даты — соберём список вещей из гардероба, образы на каждый день и чек-лист.</p>
          <button className="btn primary" onClick={onAdd}>Создать поездку</button>
        </div>
      ) : (
        <div className="trip-list">
          {sorted.map(trip => {
            const plan = trip.plan
            const packed = (plan?.itemIds ?? []).map(id => byId.get(id)).filter((item): item is Item => Boolean(item))
            const looks = plan?.days.filter(day => day.outfit).length ?? 0
            const checks = new Map(trip.checklist.map(check => [check.id, check]))
            const doneCount = trip.checklist.filter(check => check.done).length
            const customChecks = trip.checklist.filter(check => !check.id.startsWith('item-'))
            return (
              <section className="panel trip-card" key={trip.id}>
                <div className="trip-card-head">
                  <span className="eyebrow">{trip.kind.toUpperCase()}{trip.activities?.length ? ` · ${trip.activities.join(', ').toUpperCase()}` : ''}</span>
                  <div className="trip-actions">
                    <button className="row-edit" onClick={() => onEdit(trip)}><Edit3 size={16} /> Изменить</button>
                    <button className="row-delete" aria-label="Удалить поездку" onClick={() => onDelete(trip)}><Trash2 size={16} /></button>
                  </div>
                </div>
                <h2>{trip.city}</h2>
                <p>{fmt(trip.from)} — {fmt(trip.to)}</p>

                {planning === trip.id && <p className="form-hint" role="status">Собираем чемодан: смотрим погоду и подбираем образы…</p>}

                {plan && (
                  <>
                    <div className="trip-total"><b>{packed.length} вещей → {looks} {looks === 1 ? 'образ' : looks < 5 ? 'образа' : 'образов'}</b>
                      <button className="text-link" disabled={planning === trip.id} onClick={() => onReplan(trip)}><RefreshCw size={14} /> Пересобрать</button>
                    </div>

                    {plan.missing.length > 0 && (
                      <div className="advice-card">
                        <Lightbulb size={18} />
                        <div><b>Для этой поездки не хватает</b>{plan.missing.map(tip => <span key={tip}>{tip}</span>)}</div>
                        <button className="text-link" onClick={onWardrobe}>В гардероб</button>
                      </div>
                    )}

                    <h3 className="trip-subtitle">Что взять</h3>
                    {CATEGORIES.map(category => {
                      const list = packed.filter(item => item.category === category)
                      if (!list.length) return null
                      return (
                        <div className="pack-group" key={category}>
                          <span className="eyebrow">{category.toUpperCase()}</span>
                          <div className="pack-items">
                            {list.map(item => {
                              const check = checks.get(itemCheckId(item.id))
                              return (
                                <div className={`pack-item ${check?.done ? 'done' : ''}`} key={item.id}>
                                  <label>
                                    <input type="checkbox" checked={Boolean(check?.done)} onChange={() => onToggle(trip, itemCheckId(item.id))} />
                                    <ItemPhoto item={item} />
                                    <span>{item.name}</span>
                                  </label>
                                  <button aria-label={`Заменить «${item.name}»`} title="Не брать — заменить" onClick={() => onRemoveItem(trip, item.id)}><X size={14} /></button>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}

                    <h3 className="trip-subtitle">Образы по дням</h3>
                    <div className="trip-days">
                      {plan.days.map(day => {
                        const outfitItems = (day.outfit?.itemIds ?? []).map(id => byId.get(id)).filter((item): item is Item => Boolean(item))
                        return (
                          <div className="trip-day" key={day.date}>
                            <div className="trip-day-head">
                              <b>{fmt(day.date, { weekday: 'short', day: 'numeric', month: 'short' })}</b>
                              <button className="text-link" disabled={planning === trip.id} onClick={() => onReplanDay(trip, day.date)}><RefreshCw size={13} /> Другой</button>
                            </div>
                            <small>{formatSummary(day.weather)}</small>
                            {outfitItems.length ? <OutfitCollage items={outfitItems} compact /> : <small>Не удалось собрать образ</small>}
                            {day.outfit?.warnings.map((warning, i) => <small className="warning-line" key={i}>⚠ {warning.text}. {warning.fix}.</small>)}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}

                <h3 className="trip-subtitle">Чек-лист · {doneCount} из {trip.checklist.length}</h3>
                <div className="progress"><i style={{ width: `${trip.checklist.length ? doneCount / trip.checklist.length * 100 : 0}%` }} /></div>
                <div className="checklist">
                  {customChecks.map(check => (
                    <label key={check.id}><input type="checkbox" checked={check.done} onChange={() => onToggle(trip, check.id)} /><span>{check.label}</span></label>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
