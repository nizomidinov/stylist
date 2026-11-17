// Создание события за несколько касаний (ТЗ, задача 13) и карточка события (задача 18).
import { useEffect, useState } from 'react'
import { Check, Sparkles, Trash2, X } from 'lucide-react'
import { Chips, Field, Modal, OutfitCollage } from './ui'
import { EVENT_KINDS, quickTemplates } from '../lib/constants'
import type { EventItem, Item, Profile } from '../types'
import { eventWeather, formatSummary, type Forecast } from '../lib/weather'
import { forecastForPlace } from '../hooks/useForecast'

const uid = () => Math.random().toString(36).slice(2, 10)

export function EventModal({ event, defaultDate, profile, forecast, items, onClose, onSave, onDelete }: {
  event?: EventItem
  defaultDate: string
  profile: Profile
  forecast: Forecast | null
  items: Item[]
  onClose: () => void
  onSave: (event: EventItem, options: { pickOutfit: boolean }) => void
  onDelete: (id: string) => void
}) {
  const [draft, setDraft] = useState<EventItem>(() => event ?? {
    id: uid(), title: '', kind: 'Прогулка', date: defaultDate, start: '18:00', end: '20:00',
    place: '', outside: 'Смешанно', walking: false, comment: ''
  })
  const [weatherText, setWeatherText] = useState('')
  const set = (patch: Partial<EventItem>) => setDraft(previous => ({ ...previous, ...patch }))
  const valid = draft.date && draft.end > draft.start
  const outfitItems = (draft.outfit?.itemIds ?? []).map(id => items.find(item => item.id === id)).filter((item): item is Item => Boolean(item))

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(async () => {
      const source = await forecastForPlace(draft.place, forecast, profile.place)
      if (!cancelled) setWeatherText(formatSummary(eventWeather(source, draft.date, draft.start, draft.end)))
    }, 400)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [draft.place, draft.date, draft.start, draft.end, forecast, profile.place])

  const save = (pickOutfit: boolean) => onSave({ ...draft, title: draft.title.trim() || draft.kind }, { pickOutfit })

  return (
    <Modal title={event ? 'Событие' : 'Новое событие'} subtitle="Куда и когда идёшь — образ подстроится под погоду на всё время." onClose={onClose}>
      {!event && (
        <div className="quick-templates">
          {quickTemplates().map(template => (
            <button key={template.label} type="button" onClick={() => onSave({ ...template.event, id: uid() }, { pickOutfit: true })}>{template.label}</button>
          ))}
        </div>
      )}
      <div className="form-grid">
        <div className="field"><span>Тип события</span>
          <Chips options={EVENT_KINDS} value={draft.kind} onChange={value => set({ kind: value as string })} />
        </div>
        <Field label="Название · необязательно">
          <input value={draft.title} onChange={e => set({ title: e.target.value })} placeholder={draft.kind} />
        </Field>
        <Field label="Дата"><input type="date" value={draft.date} onChange={e => set({ date: e.target.value })} /></Field>
        <div className="two-fields">
          <Field label="С"><input type="time" value={draft.start} onChange={e => set({ start: e.target.value })} /></Field>
          <Field label="До"><input type="time" value={draft.end} onChange={e => set({ end: e.target.value })} /></Field>
        </div>
        <Field label="Место · необязательно">
          <input value={draft.place} onChange={e => set({ place: e.target.value })} placeholder={`По умолчанию — ${profile.city}`} />
        </Field>
        <div className="field"><span>Формат</span>
          <Chips options={['В помещении', 'На улице', 'Смешанно']} value={draft.outside} onChange={value => set({ outside: value as string })} />
        </div>
        <label className="check-option">
          <input type="checkbox" checked={draft.walking} onChange={e => set({ walking: e.target.checked })} />
          <span><b>Будет много ходьбы</b><small>Учтём удобство обуви</small></span>
        </label>
        <Field label="Комментарий · необязательно">
          <textarea rows={2} value={draft.comment ?? ''} onChange={e => set({ comment: e.target.value })} placeholder="Ужин в ресторане, потом прогулка" />
        </Field>
      </div>
      {weatherText && <p className="form-hint">🌤 {weatherText}</p>}
      {draft.end <= draft.start && <p className="validation">Время окончания должно быть позже начала.</p>}

      {draft.outfit && (
        <div className="event-outfit">
          <div className="panel-title"><span>ВЫБРАННЫЙ ОБРАЗ</span><button className="text-link" onClick={() => set({ outfit: undefined })}><X size={14} /> Убрать</button></div>
          <OutfitCollage items={outfitItems} compact />
          <small>{draft.outfit.title}</small>
        </div>
      )}

      <div className="modal-actions">
        {event && <button className="danger-text" onClick={() => { onDelete(event.id); onClose() }}><Trash2 size={15} /> Удалить</button>}
        <button className="btn secondary" disabled={!valid} onClick={() => save(false)}><Check size={16} /> Сохранить</button>
        <button className="btn primary" disabled={!valid} onClick={() => save(true)}><Sparkles size={16} /> {draft.outfit ? 'Обновить образ' : 'Сохранить и подобрать образ'}</button>
      </div>
    </Modal>
  )
}
