// Тип фигуры: по меркам (на устройстве), вручную или по фото (бета, только после юр. проверки).
import { useRef, useState } from 'react'
import { Ruler } from 'lucide-react'
import { BODY_TYPES, BODY_TYPE_NAMES, bodyTypeFromMeasurements } from '../lib/figure'
import { analyzeFigurePhoto } from '../lib/ai'
import { compressImage } from '../lib/photos'
import type { Measurements, Profile } from '../types'
import { Chips } from './ui'

export function FigurePanel({ profile, setProfile }: { profile: Profile; setProfile: (profile: Profile) => void }) {
  const [m, setM] = useState<Measurements>(profile.measurements ?? {})
  const [message, setMessage] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const info = profile.bodyType ? BODY_TYPES[profile.bodyType] : undefined

  const calculate = () => {
    const type = bodyTypeFromMeasurements(m)
    if (!type) { setMessage('Укажи обхваты груди, талии и бёдер в сантиметрах.'); return }
    setProfile({ ...profile, measurements: m, bodyType: type })
    setMessage(`Готово: ${type}. Будем подбирать силуэты, которые подчеркнут пропорции.`)
  }

  const byPhoto = async (picked?: File) => {
    if (!picked) return
    setBusy(true); setMessage('Анализируем силуэт…')
    try {
      const image = await compressImage(picked, 768, 0.8)
      const result = await analyzeFigurePhoto(image)
      if (result.bodyType === 'Не удалось определить') setMessage('По фото определить не получилось. Попробуй фото в полный рост в облегающей одежде или используй мерки.')
      else { setProfile({ ...profile, bodyType: result.bodyType }); setMessage(`По фото: ${result.bodyType}. Фото не сохранялось.`) }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось определить по фото')
    } finally { setBusy(false) }
  }

  const number = (key: keyof Measurements) => (
    <label className="measure">
      <span>{({ bust: 'Грудь', waist: 'Талия', hips: 'Бёдра', height: 'Рост' } as const)[key]}</span>
      <input type="number" inputMode="numeric" min={40} max={220} value={m[key] ?? ''} onChange={event => setM({ ...m, [key]: event.target.value ? Number(event.target.value) : undefined })} placeholder="см" />
    </label>
  )

  return (
    <section className="panel figure-card">
      <div className="panel-title"><span>ТИП ФИГУРЫ</span><Ruler size={17} /></div>
      <p className="form-hint">Нужен только для подбора удачных силуэтов. Мы не оцениваем фигуру и не советуем что-то в ней менять.</p>
      <div className="measure-grid">{number('bust')}{number('waist')}{number('hips')}{number('height')}</div>
      <button className="btn secondary full" onClick={calculate}>Определить по меркам</button>
      <div className="field"><span>Или выбери сама</span>
        <Chips options={BODY_TYPE_NAMES} value={profile.bodyType} onChange={value => setProfile({ ...profile, bodyType: value as string })} />
      </div>
      {info && (
        <div className="figure-info">
          <b>{profile.bodyType}</b>
          <span>{info.description}</span>
          <ul>{info.tips.map(tip => <li key={tip}>{tip}</li>)}</ul>
          <button className="text-link" onClick={() => setProfile({ ...profile, bodyType: undefined })}>Не учитывать тип фигуры</button>
        </div>
      )}
      <details className="figure-photo">
        <summary>Определить по фото (бета)</summary>
        <p className="form-hint">Фото в полный рост отправляется ИИ-сервису только для определения типа и не сохраняется. Функция включится после юридической проверки.</p>
        <label className="check-option"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span>Согласна на однократную обработку фото</span></label>
        <button className="btn secondary" disabled={!consent || busy} onClick={() => file.current?.click()}>Выбрать фото</button>
        <input ref={file} type="file" accept="image/*" hidden onChange={event => { void byPhoto(event.target.files?.[0]); event.currentTarget.value = '' }} />
      </details>
      {message && <p className="form-hint" role="status">{message}</p>}
    </section>
  )
}
