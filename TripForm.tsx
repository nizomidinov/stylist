import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Chips, Field, Modal } from './ui'
import { CityPicker } from './CityPicker'
import type { Trip } from '../types'
import { todayISO, addDays } from '../lib/weather'

const uid = () => Math.random().toString(36).slice(2, 10)
const DEFAULT_CHECKLIST = ['Документы', 'Зарядное устройство', 'Косметичка', 'Средства ухода', 'Нижнее бельё', 'Пижама', 'Лекарства']

export function TripForm({ trip, onClose, onSave }: { trip?: Trip; onClose: () => void; onSave: (trip: Trip) => void }) {
  const [draft, setDraft] = useState<Trip>(() => trip ?? {
    id: uid(), city: '', from: addDays(todayISO(), 7), to: addDays(todayISO(), 10), kind: 'Отдых', activities: [],
    checklist: DEFAULT_CHECKLIST.map(label => ({ id: uid(), label, done: false }))
  })
  const [custom, setCustom] = useState('')
  const set = (patch: Partial<Trip>) => setDraft(previous => ({ ...previous, ...patch }))
  const addItem = () => {
    if (!custom.trim()) return
    set({ checklist: [...draft.checklist, { id: uid(), label: custom.trim(), done: false }] })
    setCustom('')
  }
  const tooLong = draft.to > addDays(draft.from, 30)

  return (
    <Modal title={trip ? 'Поездка' : 'Новая поездка'} subtitle="Город и даты — соберём чемодан и образы на каждый день." onClose={onClose}>
      <div className="form-grid">
        <Field label="Город">
          <CityPicker value={draft.city} onChange={place => set({ city: place.name, place })} placeholder="Казань" />
        </Field>
        <div className="two-fields">
          <Field label="С"><input type="date" value={draft.from} onChange={e => set({ from: e.target.value, to: e.target.value > draft.to ? e.target.value : draft.to })} /></Field>
          <Field label="По"><input type="date" min={draft.from} value={draft.to} onChange={e => set({ to: e.target.value })} /></Field>
        </div>
        <div className="field"><span>Тип поездки</span>
          <Chips options={['Отдых', 'Работа', 'Учёба', 'Событие']} value={draft.kind} onChange={value => set({ kind: value as string })} />
        </div>
        <div className="field"><span>Активности · необязательно</span>
          <Chips options={['Прогулки', 'Пляж', 'Ужин', 'Деловая встреча', 'Музеи', 'Спорт']} value={draft.activities ?? []} multiple onChange={value => set({ activities: value as string[] })} />
        </div>
        <div className="field">
          <span>Чек-лист сборов (вещи из гардероба добавятся сами)</span>
          <div className="trip-edit-checklist">
            {draft.checklist.map(item => (
              <div className="trip-edit-row" key={item.id}>
                <input type="checkbox" checked={item.done} onChange={e => set({ checklist: draft.checklist.map(old => old.id === item.id ? { ...old, done: e.target.checked } : old) })} />
                <input aria-label="Пункт" value={item.label} onChange={e => set({ checklist: draft.checklist.map(old => old.id === item.id ? { ...old, label: e.target.value } : old) })} />
                <button type="button" className="row-delete" aria-label="Удалить пункт" onClick={() => set({ checklist: draft.checklist.filter(old => old.id !== item.id) })}><X size={15} /></button>
              </div>
            ))}
          </div>
          <div className="add-check-row">
            <input value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }} placeholder="Свой пункт" />
            <button type="button" className="btn secondary" onClick={addItem}>Добавить</button>
          </div>
        </div>
      </div>
      {draft.to < draft.from && <p className="validation">Дата окончания раньше начала.</p>}
      {tooLong && <p className="validation">Поездки длиннее 31 дня пока не поддерживаются.</p>}
      <div className="modal-actions">
        <button className="btn secondary" onClick={onClose}>Отмена</button>
        <button className="btn primary" disabled={!draft.city.trim() || draft.to < draft.from || tooLong} onClick={() => onSave({ ...draft, city: draft.city.trim() })}>
          <Check size={16} /> {trip ? 'Сохранить и пересобрать' : 'Собрать чемодан'}
        </button>
      </div>
    </Modal>
  )
}
