import { useEffect, useState } from 'react'
import { getForecast, resolvePlace, type Forecast, type Place } from '../lib/weather'

/** Прогноз для места профиля; обновляется раз в 30 минут и при возвращении во вкладку. */
export function useForecast(place: Place | undefined, city: string) {
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  const placeKey = place ? `${place.latitude},${place.longitude}` : city

  useEffect(() => {
    const controller = new AbortController()
    const run = async () => {
      setLoading(true)
      try {
        const target = place ?? await resolvePlace(city, controller.signal)
        if (!target) { setError('Город не найден — выбери его в профиле'); setForecast(null); return }
        const result = await getForecast(target, { signal: controller.signal, force: tick > 0 })
        setForecast(result)
        setError('')
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Не удалось загрузить погоду')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    if (!placeKey) { setError('Укажи город в профиле'); return }
    void run()
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeKey, tick])

  useEffect(() => {
    const refresh = () => setTick(value => value + 1)
    const timer = window.setInterval(refresh, 30 * 60 * 1000)
    const onVisible = () => { if (document.visibilityState === 'visible' && forecast && Date.now() - forecast.fetchedAt > 30 * 60 * 1000) refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [forecast])

  return { forecast, loading, error, refresh: () => setTick(value => value + 1) }
}

/** Прогноз для места события: если место совпадает с городом профиля — берём основной прогноз. */
export async function forecastForPlace(text: string, fallback: Forecast | null, profilePlace?: Place) {
  const query = text.trim()
  if (!query || (profilePlace && query.toLocaleLowerCase('ru-RU') === profilePlace.name.toLocaleLowerCase('ru-RU'))) return fallback
  try {
    const place = await resolvePlace(query)
    return place ? await getForecast(place) : fallback
  } catch {
    return fallback
  }
}
