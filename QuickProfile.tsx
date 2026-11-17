// Быстрый профиль после регистрации (ТЗ, задача 5): город (автоопределение с подтверждением), 1–3 стиля, цвета.
import { useEffect, useState } from 'react'
import { Chips, Field, Modal } from './ui'
import { CityPicker } from './CityPicker'
import { STYLES, guessCityFromTimezone } from '../lib/constants'
import { resolvePlace, type Place } from '../lib/weather'
import type { Profile } from '../types'

export function QuickProfile({ profile, onDone }: { profile: Profile; onDone: (profile: Profile) => void }) {
  const [draft, setDraft] = useState<Profile>(profile)
  const [guess, setGuess] = useState<Place | null>(null)
  const [confirmed, setConfirmed] = useState(Boolean(profile.place))

  useEffect(() => {
    if (profile.place) return
    const city = guessCityFromTimezone()
    if (city) void resolvePlace(city).then(place => setGuess(place)).catch(() => undefined)
  }, [profile.place])

  return (
    <Modal title="Пара вопросов — и начнём" subtitle="Меньше минуты. Всё можно поменять потом в профиле." onClose={() => onDone({ ...draft, onboarded: true })}>
      <div className="form-grid">
        {guess && !confirmed && (
          <div className="city-confirm">
            <span>Ты в городе <b>{guess.name}</b>?</span>
            <button className="btn primary" onClick={() => { setDraft({ ...draft, city: guess.name, place: guess }); setConfirmed(true) }}>Да</button>
            <button className="btn secondary" onClick={() => setGuess(null)}>Нет</button>
          </div>
        )}
        <Field label="Город">
          <CityPicker value={draft.place?.name ?? ''} onChange={place => { setDraft({ ...draft, city: place.name, place }); setConfirmed(true) }} />
        </Field>
        <div className="field"><span>Стили · выбери 1–3</span>
          <Chips options={STYLES.slice(0, 8)} value={draft.styles} multiple onChange={value => setDraft({ ...draft, styles: (value as string[]).slice(-3) })} />
        </div>
        <Field label="Любимые цвета · необязательно">
          <input value={draft.likedColors} onChange={e => setDraft({ ...draft, likedColors: e.target.value })} placeholder="Бежевый, молочный" />
        </Field>
        <Field label="Нелюбимые цвета · необязательно">
          <input value={draft.dislikedColors} onChange={e => setDraft({ ...draft, dislikedColors: e.target.value })} placeholder="Оранжевый" />
        </Field>
      </div>
      <div className="modal-actions">
        <button className="btn primary" disabled={!draft.place || !draft.styles.length} onClick={() => onDone({ ...draft, onboarded: true })}>Готово — загрузить вещи</button>
      </div>
    </Modal>
  )
}
