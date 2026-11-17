import React, { createContext, useContext, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Item } from '../types'
import { displayPath, signPaths } from '../lib/photos'

export function PageHead({ eyebrow, title, desc, action }: { eyebrow: string; title: string; desc: string; action?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{desc}</p>
      </div>
      {action}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label?: string }) {
  return (
    <button type="button" className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)} aria-pressed={checked} aria-label={label}>
      <i />
    </button>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field">{label}{children}</label>
}

/** Выбор одним касанием (ТЗ, задача 9: «выбор из списка, не ввод текста»). */
export function Chips<T extends string | number>({ options, value, onChange, multiple, render }: {
  options: readonly T[]
  value: T | T[] | undefined
  onChange: (value: T | T[]) => void
  multiple?: boolean
  render?: (option: T) => React.ReactNode
}) {
  const selected = Array.isArray(value) ? value : value === undefined ? [] : [value]
  return (
    <div className="note-tags">
      {options.map(option => (
        <button
          type="button"
          key={String(option)}
          className={selected.includes(option) ? 'active' : ''}
          onClick={() => {
            if (!multiple) { onChange(option); return }
            onChange(selected.includes(option) ? selected.filter(item => item !== option) : [...selected, option])
          }}
        >
          {render ? render(option) : option}
        </button>
      ))}
    </div>
  )
}

export function Modal({ title, subtitle, onClose, children, wide }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <div>
            <div className="eyebrow">MUSE</div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть"><X /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ фото вещей (временные ссылки)

const PhotoContext = createContext<Map<string, string>>(new Map())

export function PhotoProvider({ items, children }: { items: Item[]; children: React.ReactNode }) {
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const paths = items.map(displayPath).filter((path): path is string => Boolean(path))
  const signature = [...new Set(paths)].sort().join(',')
  useEffect(() => {
    if (!signature) return
    let cancelled = false
    const refresh = () => signPaths(signature.split(',')).then(map => { if (!cancelled) setUrls(map) }).catch(() => undefined)
    void refresh()
    const timer = window.setInterval(refresh, 50 * 60 * 1000) // ссылки живут час
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [signature])
  return <PhotoContext.Provider value={urls}>{children}</PhotoContext.Provider>
}

export function usePhotoUrl(item: Item | undefined) {
  const urls = useContext(PhotoContext)
  if (!item) return ''
  const path = displayPath(item)
  return (path && urls.get(path)) || item.image || ''
}

export function ItemPhoto({ item, className }: { item: Item; className?: string }) {
  const url = usePhotoUrl(item)
  return url
    ? <img className={className} src={url} alt={item.name} loading="lazy" />
    : <span className={`photo-placeholder ${className ?? ''}`}>{item.category}</span>
}

/** Коллаж образа: вещи на белом фоне (ТЗ, задача 15). */
export function OutfitCollage({ items, compact }: { items: Item[]; compact?: boolean }) {
  return (
    <div className={`outfit-collage ${compact ? 'compact' : ''} n${Math.min(items.length, 5)}`}>
      {items.map(item => (
        <div className="collage-cell" key={item.id} title={item.name}>
          <ItemPhoto item={item} />
        </div>
      ))}
    </div>
  )
}
