import { useEffect, useState } from 'react'
import { searchPlaces, type Place } from '../lib/weather'

export function CityPicker({ value, onChange, placeholder }: { value: string; onChange: (place: Place) => void; placeholder?: string }) {
  const [query, setQuery] = useState(value)
  const [suggestions, setSuggestions] = useState<Place[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)

  useEffect(() => setQuery(value), [value])

  useEffect(() => {
    if (query.trim().length < 2 || query === value) { setSuggestions([]); return }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setSearching(true)
      try { setSuggestions(await searchPlaces(query, 7, controller.signal)) }
      catch { if (!controller.signal.aborted) setSuggestions([]) }
      finally { if (!controller.signal.aborted) setSearching(false) }
    }, 300)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [query, value])

  const choose = (place: Place) => {
    onChange(place)
    setQuery(place.name)
    setSuggestions([])
    setOpen(false)
  }

  return (
    <div className="city-picker">
      <input
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={event => { setQuery(event.target.value); setOpen(true) }}
        placeholder={placeholder ?? 'Например, Питер или Казань'}
        autoComplete="off"
      />
      {open && query.trim().length >= 2 && (searching || suggestions.length > 0) && (
        <div className="city-suggestions">
          {searching && <div className="city-searching">Ищем город…</div>}
          {suggestions.map((place, index) => (
            <button type="button" key={`${place.latitude},${place.longitude},${index}`} onMouseDown={() => choose(place)}>
              <strong>{place.name}</strong>
              <small>{place.label}</small>
            </button>
          ))}
        </div>
      )}
      <small className="field-hint">Начни вводить название и выбери вариант из списка — так прогноз будет точным.</small>
    </div>
  )
}

