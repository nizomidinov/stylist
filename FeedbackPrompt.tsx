// «Было удобно?» после окончания события (ТЗ, задача 16).
import { useState } from 'react'
import { MessageCircleHeart } from 'lucide-react'
import type { EventItem, Item } from '../types'
import { OutfitCollage } from './ui'

const PROBLEMS = ['замёрзла', 'жарко', 'натирало', 'неудобно', 'промокла']

export type ComfortAnswer = { comfortable: boolean; problems: string[]; liked: boolean | null; tagShoes: boolean }

export function FeedbackPrompt({ event, items, onAnswer, onSkip }: { event: EventItem; items: Item[]; onAnswer: (answer: ComfortAnswer) => void; onSkip: () => void }) {
  const [comfortable, setComfortable] = useState<boolean | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [liked, setLiked] = useState<boolean | null>(null)
  const [tagShoes, setTagShoes] = useState(true)
  const outfitItems = (event.outfit?.itemIds ?? []).map(id => items.find(item => item.id === id)).filter((item): item is Item => Boolean(item))
  const shoes = outfitItems.find(item => item.category === 'Обувь')
  const ready = comfortable !== null && (comfortable || problems.length > 0)

  return (
    <section className="panel feedback-card">
      <div className="panel-title"><span>КАК ПРОШЛО?</span><MessageCircleHeart size={17} /></div>
      <b>{event.title || event.kind}, {event.start}–{event.end}</b>
      <OutfitCollage items={outfitItems} compact />
      <div className="feedback-row">
        <span>Было удобно?</span>
        <div className="note-tags">
          <button className={comfortable === true ? 'active' : ''} onClick={() => { setComfortable(true); setProblems([]) }}>Да</button>
          <button className={comfortable === false ? 'active' : ''} onClick={() => setComfortable(false)}>Нет</button>
        </div>
      </div>
      {comfortable === false && (
        <div className="feedback-row">
          <span>Что мешало?</span>
          <div className="note-tags">
            {PROBLEMS.map(problem => (
              <button key={problem} className={problems.includes(problem) ? 'active' : ''} onClick={() => setProblems(list => list.includes(problem) ? list.filter(p => p !== problem) : [...list, problem])}>{problem}</button>
            ))}
          </div>
        </div>
      )}
      {problems.includes('натирало') && shoes && (
        <label className="check-option"><input type="checkbox" checked={tagShoes} onChange={event => setTagShoes(event.target.checked)} /><span>Добавить метку «натирает» к «{shoes.name}»</span></label>
      )}
      <div className="feedback-row">
        <span>Понравился образ?</span>
        <div className="note-tags">
          <button className={liked === true ? 'active' : ''} onClick={() => setLiked(true)}>Да</button>
          <button className={liked === false ? 'active' : ''} onClick={() => setLiked(false)}>Не очень</button>
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn secondary" onClick={onSkip}>Пропустить</button>
        <button className="btn primary" disabled={!ready} onClick={() => onAnswer({ comfortable: comfortable!, problems, liked, tagShoes: tagShoes && problems.includes('натирало') && Boolean(shoes) })}>Отправить</button>
      </div>
    </section>
  )
}
