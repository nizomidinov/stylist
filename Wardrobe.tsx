// Гардероб (ТЗ, задачи 10–11): сетка, фильтры по категории и сезону, поиск, порог 10 вещей, советы.
import { useMemo, useState } from 'react'
import { Heart, Lightbulb, Plus, Search, Shirt, Sparkles, X } from 'lucide-react'
import { ItemPhoto, PageHead } from '../components/ui'
import { CATEGORIES } from '../lib/constants'
import type { Item } from '../types'
import { wardrobeAdvice } from '../../supabase/functions/_shared/stylist.ts'
import { toStylistItem } from '../lib/ai'

const SEASON_FILTERS = ['Любой сезон', 'Весна', 'Лето', 'Осень', 'Зима']

export function Wardrobe({ items, dismissed, onDismiss, onAdd, onSelect, uploading }: {
  items: Item[]
  dismissed: string[]
  onDismiss: (id: string) => void
  onAdd: () => void
  onSelect: (item: Item) => void
  uploading: number
}) {
  const [category, setCategory] = useState('Все')
  const [season, setSeason] = useState(SEASON_FILTERS[0])
  const [query, setQuery] = useState('')
  const advice = useMemo(() => wardrobeAdvice(items.map(toStylistItem)).filter(tip => !dismissed.includes(tip.id)), [items, dismissed])
  const q = query.trim().toLocaleLowerCase('ru-RU')
  const shown = items.filter(item =>
    (category === 'Все' || item.category === category) &&
    (season === SEASON_FILTERS[0] || item.season === 'Все сезоны' || item.season.toLocaleLowerCase('ru-RU').includes(season.toLocaleLowerCase('ru-RU'))) &&
    (!q || `${item.name} ${item.type ?? ''} ${item.color} ${item.material ?? ''} ${(item.tags ?? []).join(' ')}`.toLocaleLowerCase('ru-RU').includes(q))
  )
  const count = (value: string) => items.filter(item => item.category === value).length
  const left = 10 - items.length

  return (
    <div className="page">
      <PageHead eyebrow="ЦИФРОВОЙ ГАРДЕРОБ" title="Твои вещи" desc="Добавляй сразу пачкой фото — фон уберём, карточки заполним."
        action={<button className="btn primary" onClick={onAdd}><Plus size={17} /> Добавить вещи</button>} />

      {left > 0 && (
        <div className="threshold-note">
          <Sparkles size={19} />
          <div>
            <b>{items.length} из 10 — до подбора образов {left} {left === 1 ? 'вещь' : left < 5 ? 'вещи' : 'вещей'}</b>
            <span>Загрузи первыми: 3–4 верха ({count('Верх')}), 2–3 низа ({count('Низ') + count('Платье')}), 2 пары обуви ({count('Обувь')}), 1 верхнюю одежду ({count('Верхняя одежда')}).</span>
          </div>
          <b>{items.length}/10</b>
        </div>
      )}

      {advice.slice(0, 2).map(tip => (
        <div className="advice-card" key={tip.id}>
          <Lightbulb size={18} />
          <div><b>Совет</b><span>{tip.text}</span></div>
          <button className="icon-btn" aria-label="Скрыть совет" onClick={() => onDismiss(tip.id)}><X size={16} /></button>
        </div>
      ))}

      <div className="wardrobe-summary">
        <div><span>ВСЕГО</span><b>{items.length}</b></div>
        {CATEGORIES.map(value => <div key={value}><span>{value.toUpperCase()}</span><b>{count(value)}</b></div>)}
      </div>

      <div className="filter-bar">
        <div className="search-box"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск: джинсы, бежевый, натирает…" /></div>
        <div className="filter-pills">{['Все', ...CATEGORIES].map(value => <button key={value} className={category === value ? 'active' : ''} onClick={() => setCategory(value)}>{value}</button>)}</div>
        <div className="filter-pills">{SEASON_FILTERS.map(value => <button key={value} className={season === value ? 'active' : ''} onClick={() => setSeason(value)}>{value}</button>)}</div>
      </div>

      {uploading > 0 && <p className="form-hint" role="status">Загружаем ещё {uploading} фото…</p>}

      {items.length === 0 ? (
        <div className="panel empty-trip">
          <Shirt size={34} />
          <h2>Гардероб пока пуст</h2>
          <p>Выбери 10 фото своих вещей из галереи — это займёт пару минут.</p>
          <button className="btn primary" onClick={onAdd}><Plus size={17} /> Добавить первые вещи</button>
        </div>
      ) : (
        <div className="wardrobe-grid">
          {shown.map(item => (
            <button className="item-card" key={item.id} onClick={() => onSelect(item)}>
              <div className="item-photo">
                <ItemPhoto item={item} />
                <span>{item.category}</span>
                {item.needsReview && <em className="review-badge">проверь</em>}
              </div>
              <div className="item-card-info">
                <b>{item.name}</b>
                <span>{item.color} · {item.season}</span>
                {(item.tags?.length || item.note) ? <small><Heart size={12} /> {(item.tags ?? []).slice(0, 2).join(', ') || 'Есть заметка'}</small> : null}
              </div>
            </button>
          ))}
          <button className="add-card" onClick={onAdd}><Plus size={25} /><b>Добавить вещи</b><span>Можно сразу несколько</span></button>
        </div>
      )}
      {items.length > 0 && shown.length === 0 && <div className="empty-day">Ничего не найдено. Попробуй изменить фильтр.</div>}
    </div>
  )
}
