// Регистрация и вход (ТЗ, задача 4): почта (пароль или ссылка), телефон; согласие на обработку ПД и 18+.
import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import { PrivacyPolicy } from './PrivacyPolicy'

export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('register')
  const [method, setMethod] = useState<'email' | 'link' | 'phone'>('email')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [phonePending, setPhonePending] = useState(false)
  const [consent, setConsent] = useState(false)
  const [adult, setAdult] = useState(false)
  const [policy, setPolicy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const registering = mode === 'register'
  const agreements = { consent_personal_data_at: new Date().toISOString(), adult_confirmed: true, policy_version: 'draft-1' }
  const canSubmit = !registering || (consent && adult)

  const reset = () => { setError(''); setMessage(''); setPhonePending(false) }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setMessage('')
    if (!canSubmit) { setError('Подтверди согласие на обработку данных и что тебе есть 18 лет.'); return }
    setBusy(true)
    try {
      if (method === 'link') {
        const { error: authError } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { shouldCreateUser: registering, data: registering ? agreements : undefined, emailRedirectTo: window.location.origin }
        })
        if (authError) throw authError
        setMessage('Мы отправили ссылку для входа на почту. Открой её на этом устройстве.')
      } else if (registering) {
        if (method === 'email') {
          const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: agreements, emailRedirectTo: window.location.origin } })
          if (authError) throw authError
          if (!data.session) setMessage('Проверь почту и перейди по ссылке подтверждения, затем войди.')
        } else {
          const { data, error: authError } = await supabase.auth.signUp({ phone: phone.trim(), password, options: { channel: 'sms', data: agreements } })
          if (authError) throw authError
          if (data.user && !data.session) { setPhonePending(true); setMessage('Мы отправили SMS-код. Введи его ниже.') }
        }
      } else {
        const credentials = method === 'email' ? { email: email.trim(), password } : { phone: phone.trim(), password }
        const { error: authError } = await supabase.auth.signInWithPassword(credentials)
        if (authError) throw authError
      }
    } catch (e) {
      const text = e instanceof Error ? e.message : ''
      setError(/invalid login/i.test(text) ? 'Неверная почта/телефон или пароль' : /already registered/i.test(text) ? 'Такой аккаунт уже есть — войди' : text || 'Не удалось выполнить запрос')
    } finally { setBusy(false) }
  }

  const verifyPhone = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({ phone: phone.trim(), token: otp.trim(), type: 'sms' })
      if (verifyError) throw verifyError
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось подтвердить номер') }
    finally { setBusy(false) }
  }

  const resetPassword = async () => {
    setError(''); setMessage('')
    if (!email.trim()) { setError('Сначала введи адрес электронной почты.'); return }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
    if (resetError) setError(resetError.message)
    else setMessage('Если адрес зарегистрирован, на него придёт письмо для восстановления пароля.')
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-head">
          <div className="auth-brand">MUSE · ИИ-СТИЛИСТ</div>
          <h1>{registering ? 'Создать аккаунт' : 'С возвращением'}</h1>
          <p>Соберись за минуту — и будь в комфорте весь день.</p>
        </div>
        <div className="segmented">
          <button type="button" className={method === 'email' ? 'active' : ''} onClick={() => { setMethod('email'); reset() }}>Почта</button>
          <button type="button" className={method === 'link' ? 'active' : ''} onClick={() => { setMethod('link'); reset() }}>Ссылка на почту</button>
          <button type="button" className={method === 'phone' ? 'active' : ''} onClick={() => { setMethod('phone'); reset() }}>Телефон</button>
        </div>
        {phonePending ? (
          <form onSubmit={verifyPhone} className="auth-form">
            <label>Код из SMS<input value={otp} onChange={e => setOtp(e.target.value)} inputMode="numeric" autoComplete="one-time-code" required /></label>
            <button className="btn primary" disabled={busy}>{busy ? 'Проверяем…' : 'Подтвердить номер'}</button>
          </form>
        ) : (
          <form onSubmit={submit} className="auth-form">
            {method === 'phone'
              ? <label>Телефон с кодом страны<input type="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7…" required /></label>
              : <label>Электронная почта<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" required /></label>}
            {method !== 'link' && (
              <label>Пароль<input type="password" autoComplete={registering ? 'new-password' : 'current-password'} minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="Не менее 6 символов" required /></label>
            )}
            {registering && (
              <div className="auth-consents">
                <label className="check-option">
                  <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
                  <span>Я даю согласие на обработку персональных данных и принимаю <button type="button" className="inline-link" onClick={() => setPolicy(true)}>политику конфиденциальности</button></span>
                </label>
                <label className="check-option">
                  <input type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)} />
                  <span>Мне есть 18 лет</span>
                </label>
              </div>
            )}
            <button className="btn primary" disabled={busy || !canSubmit}>
              {busy ? 'Подожди…' : method === 'link' ? 'Получить ссылку' : registering ? 'Зарегистрироваться' : 'Войти'}
            </button>
            {!registering && method === 'email' && <button type="button" className="text-link" onClick={resetPassword}>Забыли пароль?</button>}
          </form>
        )}
        {message && <div role="status" className="auth-message">{message}</div>}
        {error && <div role="alert" className="auth-error">{error}</div>}
        <button type="button" className="text-link auth-switch" onClick={() => { setMode(registering ? 'login' : 'register'); reset() }}>
          {registering ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
        </button>
      </div>
      {policy && <PrivacyPolicy onClose={() => setPolicy(false)} />}
    </div>
  )
}
