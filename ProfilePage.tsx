// Профиль: город, стили, цвета, тип фигуры, уведомления (задача 19), приватность (задача 21).
import { useState } from 'react'
import { Bell, LogOut, MessageSquareWarning, ShieldCheck, Trash2 } from 'lucide-react'
import { Chips, Field, PageHead, Toggle } from '../components/ui'
import { CityPicker } from '../components/CityPicker'
import { FigurePanel } from '../components/FigurePanel'
import { PrivacyPolicy } from '../components/PrivacyPolicy'
import { STYLES } from '../lib/constants'
import type { NotificationSettings, Profile } from '../types'
import { DEFAULT_NOTIFICATIONS } from '../lib/constants'
import { disablePush, enablePush, isIos, isStandalone } from '../lib/push'

const SUPPORT_URL = import.meta.env.VITE_SUPPORT_URL as string | undefined

export function ProfilePage({ profile, setProfile, userId, email, itemsCount, notify, onSignOut, onDeleteAll }: {
  profile: Profile
  setProfile: (profile: Profile) => void
  userId: string
  email: string
  itemsCount: number
  notify: (message: string) => void
  onSignOut: () => void
  onDeleteAll: () => Promise<void>
}) {
  const settings = { ...DEFAULT_NOTIFICATIONS, ...profile.notifications }
  const [policy, setPolicy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [pushMessage, setPushMessage] = useState('')
  const setSettings = (patch: Partial<NotificationSettings>) => setProfile({ ...profile, notifications: { ...settings, ...patch } })

  const turnOnPush = async () => {
    const error = await enablePush(userId)
    setPushMessage(error ?? 'Уведомления включены на этом устройстве.')
  }

  return (
    <div className="page">
      <PageHead eyebrow="НАСТРОЙКИ" title="Профиль" desc="Предпочтения для подбора, уведомления и данные." />
      <div className="profile-layout">
        <section className="panel profile-card">
          <div className="profile-avatar">{(email || profile.city).slice(0, 1).toUpperCase()}</div>
          <div><div className="eyebrow">{email}</div><h2>Мои предпочтения</h2><p>{itemsCount} вещей · {profile.place?.label ?? profile.city}</p></div>
          <div className="profile-fields">
            <Field label="Город"><CityPicker value={profile.place?.name ?? profile.city} onChange={place => setProfile({ ...profile, city: place.name, place })} /></Field>
            <div className="field"><span>Стили · до 3</span>
              <Chips options={STYLES.slice(0, 8)} value={profile.styles} multiple onChange={value => setProfile({ ...profile, styles: (value as string[]).slice(-3) })} />
            </div>
            <Field label="Любимые цвета"><input value={profile.likedColors} onChange={e => setProfile({ ...profile, likedColors: e.target.value })} placeholder="Молочный, серый" /></Field>
            <Field label="Цвета, которые не люблю"><input value={profile.dislikedColors} onChange={e => setProfile({ ...profile, dislikedColors: e.target.value })} /></Field>
          </div>
        </section>

        <FigurePanel profile={profile} setProfile={setProfile} />

        <section className="panel settings-card">
          <div className="panel-title"><span>УВЕДОМЛЕНИЯ</span><Bell size={17} /></div>
          <div className="setting-row"><div><b>Напоминания о событиях</b><small>Накануне вечером и за несколько часов</small></div><Toggle checked={settings.events} onChange={events => setSettings({ events })} label="Напоминания о событиях" /></div>
          <div className="setting-row"><div><b>Проверка погоды</b><small>Предложить обновить образ, если прогноз изменился</small></div><Toggle checked={settings.weather} onChange={weather => setSettings({ weather })} label="Проверка погоды" /></div>
          <div className="two-fields">
            <Field label="Вечером накануне в"><input type="time" value={settings.eveningTime} onChange={e => setSettings({ eveningTime: e.target.value })} /></Field>
            <Field label="И за (часов)"><select value={settings.hoursBefore} onChange={e => setSettings({ hoursBefore: Number(e.target.value) })}>{[1, 2, 3, 4].map(h => <option key={h} value={h}>{h}</option>)}</select></Field>
          </div>
          <div className="push-buttons">
            <button className="btn secondary" onClick={() => { void turnOnPush() }}>Включить на этом устройстве</button>
            <button className="text-link" onClick={() => { void disablePush().then(() => setPushMessage('Уведомления на этом устройстве выключены.')) }}>Выключить</button>
          </div>
          {isIos() && !isStandalone() && <p className="form-hint">На iPhone уведомления приходят, только если добавить приложение на главный экран: «Поделиться» → «На экран „Домой“».</p>}
          {pushMessage && <p className="form-hint" role="status">{pushMessage}</p>}
        </section>

        <section className="panel settings-card">
          <div className="panel-title"><span>ПРИВАТНОСТЬ И ДАННЫЕ</span><ShieldCheck size={17} /></div>
          <p className="form-hint">Фото хранятся в закрытом хранилище и доступны только тебе по временным ссылкам.</p>
          <button className="text-link" onClick={() => setPolicy(true)}>Политика конфиденциальности</button>
          {SUPPORT_URL && <a className="text-link" href={SUPPORT_URL} target="_blank" rel="noreferrer"><MessageSquareWarning size={15} /> Сообщить о проблеме</a>}
          <button className="btn secondary full" onClick={onSignOut}><LogOut size={15} /> Выйти из аккаунта</button>
          <details className="danger-zone">
            <summary><Trash2 size={15} /> Удалить все мои данные</summary>
            <p>Удалятся аккаунт, все фото, вещи, события, образы и поездки. Это нельзя отменить.</p>
            <Field label="Напиши УДАЛИТЬ для подтверждения"><input value={confirmDelete} onChange={e => setConfirmDelete(e.target.value)} /></Field>
            <button className="btn danger" disabled={confirmDelete.trim().toUpperCase() !== 'УДАЛИТЬ' || deleting} onClick={async () => {
              setDeleting(true)
              try { await onDeleteAll() } catch (error) { notify(error instanceof Error ? error.message : 'Не удалось удалить данные') } finally { setDeleting(false) }
            }}>{deleting ? 'Удаляем…' : 'Удалить навсегда'}</button>
          </details>
        </section>
      </div>
      {policy && <PrivacyPolicy onClose={() => setPolicy(false)} />}
    </div>
  )
}
