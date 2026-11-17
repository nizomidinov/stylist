import { useRef, useState } from 'react'
import { Eraser, Sparkles, Trash2, Upload } from 'lucide-react'
import { Chips, Field, Modal, usePhotoUrl } from './ui'
import type { Category, Item } from '../types'
import { CATEGORIES, SEASONS, STYLES, splitNote } from '../lib/constants'
import { COMFORT_TAGS } from '../../supabase/functions/_shared/stylist.ts'
import { compressImage, shrinkDataUrl, uploadPhoto } from '../lib/photos'
import { removeBackgroundToWhite } from '../lib/background'
import { recognizeClothing } from '../lib/ai'

const HEELS = ['нет', 'низкий', 'средний', 'высокий']
const COLORS = ['чёрный', 'белый', 'серый', 'бежевый', 'молочный', 'коричневый', 'синий', 'голубой', 'деним', 'зелёный', 'хаки', 'красный', 'бордовый', 'розовый', 'фиолетовый', 'жёлтый', 'оранжевый', 'принт']
const TYPES: Record<Category, string[]> = {
  'Верх': ['футболка', 'топ', 'рубашка', 'блуза', 'лонгслив', 'свитер', 'джемпер', 'кардиган', 'худи', 'свитшот', 'жакет', 'жилет'],
  'Низ': ['джинсы', 'брюки', 'юбка мини', 'юбка миди', 'юбка макси', 'шорты', 'леггинсы', 'брюки широкие'],
  'Платье': ['платье мини', 'платье миди', 'платье макси', 'платье-футляр', 'платье с запахом', 'сарафан', 'комбинезон'],
  'Верхняя одежда': ['пальто', 'тренч', 'куртка', 'косуха', 'пуховик', 'парка', 'плащ', 'ветровка', 'шуба', 'жакет утеплённый'],
  'Обувь': ['кроссовки', 'кеды', 'лоферы', 'балетки', 'туфли', 'босоножки', 'сандалии', 'ботильоны', 'ботинки', 'челси', 'сапоги', 'угги', 'мюли'],
  'Аксессуар': ['сумка', 'шарф', 'платок', 'ремень', 'шапка', 'кепка', 'перчатки', 'украшение', 'очки']
}
const MATERIALS = ['хлопок', 'лён', 'шерсть', 'кашемир', 'трикотаж', 'деним', 'шёлк', 'вискоза', 'полиэстер', 'кожа', 'замша', 'экокожа', 'пух', 'синтепон']
const levels = [1, 2, 3, 4, 5] as const
const WARMTH_HINT: Record<number, string> = { 1: 'очень лёгкая', 2: 'лёгкая', 3: 'демисезон', 4: 'тёплая', 5: 'зимняя' }
const FORMALITY_HINT: Record<number, string> = { 1: 'спорт', 2: 'повседневно', 3: 'смарт-кэжуал', 4: 'деловой', 5: 'вечерний' }

export function ItemForm({ item, userId, onClose, onSave, onDelete }: {
  item?: Item
  userId: string
  onClose: () => void
  onSave: (item: Item) => void
  onDelete?: () => void
}) {
  const initial = splitNote(item)
  const [draft, setDraft] = useState<Item>(() => ({
    id: item?.id || Math.random().toString(36).slice(2, 10),
    name: item?.name || '', category: item?.category || 'Верх', color: item?.color || '', colors: item?.colors,
    season: item?.season || 'Все сезоны', warmth: item?.warmth || 3, image: item?.image || '', note: initial.text, tags: initial.tags,
    createdAt: item?.createdAt || new Date().toISOString(), type: item?.type, material: item?.material, formality: item?.formality,
    style: item?.style, heelHeight: item?.heelHeight, windProtection: item?.windProtection, rainProtection: item?.rainProtection,
    photoPath: item?.photoPath, originalPath: item?.originalPath, useOriginal: item?.useOriginal, complaints: item?.complaints, likes: item?.likes
  }))
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const photoUrl = usePhotoUrl(draft)
  const [localPreview, setLocalPreview] = useState('')
  const set = (patch: Partial<Item>) => setDraft(previous => ({ ...previous, ...patch }))
  const colors = draft.colors?.length ? draft.colors : draft.color && draft.color !== 'не указан' ? draft.color.split(/,\s*/) : []

  const pickPhoto = async (file?: File) => {
    if (!file) return
    setBusy('Обрабатываем фото…'); setMessage('')
    try {
      const original = await compressImage(file)
      setLocalPreview(original)
      const originalPath = await uploadPhoto(userId, draft.id, 'original', original)
      set({ originalPath, image: '', useOriginal: true, photoPath: undefined })
      setBusy('Убираем фон…')
      const clean = await removeBackgroundToWhite(original).catch(() => null)
      if (clean) {
        setLocalPreview(clean)
        set({ photoPath: await uploadPhoto(userId, draft.id, 'clean', clean), useOriginal: false })
      } else setMessage('Фон не удалось убрать аккуратно — оставили оригинал.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось загрузить фото')
    } finally { setBusy('') }
  }

  /** Убрать фон у уже загруженной вещи (в т. ч. у старых записей с фото в data URL). */
  const cleanExisting = async () => {
    const source = localPreview || photoUrl
    if (!source) return
    setBusy('Убираем фон…'); setMessage('')
    try {
      const original = source.startsWith('data:') ? source : await compressImage(await (await fetch(source)).blob())
      const patch: Partial<Item> = {}
      if (!draft.originalPath) patch.originalPath = await uploadPhoto(userId, draft.id, 'original', original)
      const clean = await removeBackgroundToWhite(original)
      setLocalPreview(clean)
      patch.photoPath = await uploadPhoto(userId, draft.id, 'clean', clean)
      set({ ...patch, useOriginal: false, image: '' })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось убрать фон')
    } finally { setBusy('') }
  }

  const recognize = async () => {
    const source = localPreview || photoUrl
    if (!source) { setMessage('Сначала добавь фото вещи.'); return }
    setBusy('ИИ распознаёт вещь…'); setMessage('')
    try {
      const data = source.startsWith('data:') ? source : await compressImage(await (await fetch(source)).blob(), 768, 0.8)
      const r = await recognizeClothing(await shrinkDataUrl(data), Boolean(draft.photoPath && !draft.useOriginal) || (Boolean(localPreview) && !draft.useOriginal))
      set({
        name: r.name || draft.name, category: r.category || draft.category, type: r.type || draft.type, colors: r.colors, color: r.color || draft.color,
        season: r.season || draft.season, warmth: r.warmth || draft.warmth, material: r.material || draft.material, formality: r.formality ?? draft.formality,
        style: r.style || draft.style, heelHeight: r.heelHeight ?? draft.heelHeight, windProtection: r.windProtection ?? draft.windProtection,
        rainProtection: r.rainProtection ?? draft.rainProtection
      })
      setMessage(r.confidence !== undefined && r.confidence < 0.6 ? 'Не уверен в распознавании — проверь категорию и тип.' : 'Готово. Проверь поля и поправь, если нужно.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось распознать — заполни поля вручную.')
    } finally { setBusy('') }
  }

  const shownPhoto = localPreview && !draft.useOriginal ? localPreview : photoUrl || localPreview

  return (
    <Modal title={item ? 'Карточка вещи' : 'Новая вещь'} subtitle="Все поля меняются одним касанием." onClose={onClose} wide>
      <div className="item-editor">
        <div className="item-image-editor">
          <button type="button" className="upload-area item-photo-large" onClick={() => fileInput.current?.click()} aria-label="Заменить фотографию">
            {shownPhoto ? <img src={shownPhoto} alt={draft.name || 'Фото вещи'} /> : <><Upload /><b>Добавить фото</b><small>Фон уберём автоматически</small></>}
          </button>
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={event => { void pickPhoto(event.target.files?.[0]); event.currentTarget.value = '' }} />
          {draft.photoPath && draft.originalPath && (
            <div className="segmented">
              <button type="button" className={!draft.useOriginal ? 'active' : ''} onClick={() => { setLocalPreview(''); set({ useOriginal: false }) }}>Белый фон</button>
              <button type="button" className={draft.useOriginal ? 'active' : ''} onClick={() => { setLocalPreview(''); set({ useOriginal: true }) }}>Использовать оригинал</button>
            </div>
          )}
          <div className="item-photo-actions">
            {shownPhoto && !draft.photoPath && <button type="button" className="btn secondary" disabled={!!busy} onClick={() => { void cleanExisting() }}><Eraser size={15} /> Убрать фон</button>}
            <button type="button" className="btn dark" disabled={!shownPhoto || !!busy} onClick={() => { void recognize() }}><Sparkles size={15} /> Распознать ИИ</button>
          </div>
          {(busy || message) && <p className="form-hint" role="status">{busy || message}</p>}
          {item?.needsReview && <p className="form-hint">Карточка заполнена автоматически — проверь поля и нажми «Сохранить».</p>}
        </div>

        <div className="form-grid">
          <Field label="Название">
            <input value={draft.name} onChange={event => set({ name: event.target.value })} placeholder="Бежевый тренч" />
          </Field>
          <div className="field"><span>Категория</span>
            <Chips options={CATEGORIES} value={draft.category} onChange={value => set({ category: value as Category, type: undefined })} />
          </div>
          <div className="field"><span>Тип</span>
            <Chips options={TYPES[draft.category]} value={draft.type} onChange={value => set({ type: value as string })} />
          </div>
          <div className="field"><span>Цвета</span>
            <Chips options={COLORS} value={colors} multiple onChange={value => { const list = value as string[]; set({ colors: list, color: list.join(', ') || 'не указан' }) }} />
          </div>
          <div className="field"><span>Сезон</span>
            <Chips options={SEASONS} value={draft.season} onChange={value => set({ season: value as string })} />
          </div>
          <div className="field"><span>Теплота · {WARMTH_HINT[draft.warmth]}</span>
            <Chips options={levels} value={draft.warmth as typeof levels[number]} onChange={value => set({ warmth: value as number })} />
          </div>
          <div className="field"><span>Формальность{draft.formality ? ` · ${FORMALITY_HINT[draft.formality]}` : ''}</span>
            <Chips options={levels} value={draft.formality as typeof levels[number] | undefined} onChange={value => set({ formality: value as number })} />
          </div>
          <div className="field"><span>Стиль</span>
            <Chips options={STYLES} value={draft.style} onChange={value => set({ style: value as string })} />
          </div>
          <div className="field"><span>Материал</span>
            <Chips options={MATERIALS} value={draft.material} onChange={value => set({ material: value as string })} />
          </div>
          {draft.category === 'Обувь' && (
            <div className="field"><span>Каблук</span>
              <Chips options={HEELS} value={draft.heelHeight} onChange={value => set({ heelHeight: value as string })} />
            </div>
          )}
          {draft.category === 'Верхняя одежда' && (
            <div className="field"><span>Защита</span>
              <div className="note-tags">
                <button type="button" className={draft.windProtection ? 'active' : ''} onClick={() => set({ windProtection: !draft.windProtection })}>от ветра</button>
                <button type="button" className={draft.rainProtection ? 'active' : ''} onClick={() => set({ rainProtection: !draft.rainProtection })}>от дождя</button>
              </div>
            </div>
          )}
          <div className="field"><span>Заметки о комфорте</span>
            <Chips options={COMFORT_TAGS} value={draft.tags ?? []} multiple onChange={value => set({ tags: value as string[] })} />
          </div>
          <Field label="Своя заметка">
            <textarea rows={2} value={draft.note} onChange={event => set({ note: event.target.value })} placeholder="Например: натирает, если больше 2 часов ходьбы" />
          </Field>
        </div>
      </div>

      <div className="modal-actions">
        {item && onDelete && <button className="danger-text" onClick={onDelete}><Trash2 size={15} /> Удалить вещь</button>}
        <button className="btn secondary" onClick={onClose}>Отмена</button>
        <button className="btn primary" disabled={!draft.name.trim() || !!busy} onClick={() => onSave({ ...draft, name: draft.name.trim(), color: draft.color || 'не указан', needsReview: false })}>Сохранить</button>
      </div>
    </Modal>
  )
}
