// Пакетная загрузка вещей (ТЗ, задачи 6–8): сжатие → удаление фона → загрузка в хранилище → ИИ-распознавание.
// Очередь живёт на уровне приложения: модалку можно закрыть, загрузка продолжится в фоне.
// При ошибке (например, обрыв сети) задача остаётся с уже сделанными шагами; повтор продолжает с места сбоя,
// а при восстановлении сети неудачные задачи перезапускаются автоматически.
import { useCallback, useEffect, useRef, useState } from 'react'
import { compressImage, shrinkDataUrl, uploadPhoto } from '../lib/photos'
import { removeBackgroundToWhite } from '../lib/background'
import { recognizeClothing, type ClothingAnalysis } from '../lib/ai'
import type { Item } from '../types'

export type JobStatus = 'queued' | 'compress' | 'background' | 'upload' | 'recognize' | 'done' | 'error'
export type UploadJob = {
  id: string
  file?: File
  original?: string
  clean?: string | null
  originalPath?: string
  photoPath?: string
  recognized?: ClothingAnalysis | null
  status: JobStatus
  error?: string
}

export const JOB_LABELS: Record<JobStatus, string> = {
  queued: 'В очереди', compress: 'Сжимаем', background: 'Убираем фон', upload: 'Загружаем',
  recognize: 'Распознаём', done: 'Готово', error: 'Ошибка'
}

const CONCURRENCY = 2
const newId = () => Math.random().toString(36).slice(2, 10)

export function useUploadQueue(userId: string | null, onItem: (item: Item) => void) {
  const [jobs, setJobs] = useState<UploadJob[]>([])
  const running = useRef(new Set<string>())
  const recognitionOff = useRef<string | null>(null)
  const [recognitionNotice, setRecognitionNotice] = useState('')
  const onItemRef = useRef(onItem)
  onItemRef.current = onItem

  const patch = (id: string, value: Partial<UploadJob>) => setJobs(list => list.map(job => job.id === id ? { ...job, ...value } : job))

  const process = useCallback(async (job: UploadJob) => {
    if (!userId) return
    const state = { ...job }
    const step = (status: JobStatus) => patch(job.id, { status })
    try {
      if (!state.original) {
        step('compress')
        state.original = await compressImage(state.file!)
        patch(job.id, { original: state.original })
      }
      if (state.clean === undefined) {
        step('background')
        state.clean = await removeBackgroundToWhite(state.original).catch(() => null) // плохой результат → оригинал
        patch(job.id, { clean: state.clean })
      }
      if (!state.originalPath) {
        step('upload')
        state.originalPath = await uploadPhoto(userId, job.id, 'original', state.original)
        patch(job.id, { originalPath: state.originalPath })
      }
      if (state.clean && !state.photoPath) {
        state.photoPath = await uploadPhoto(userId, job.id, 'clean', state.clean)
        patch(job.id, { photoPath: state.photoPath })
      }
      if (state.recognized === undefined) {
        if (recognitionOff.current) state.recognized = null
        else {
          step('recognize')
          try {
            state.recognized = await recognizeClothing(await shrinkDataUrl(state.clean ?? state.original), Boolean(state.clean))
          } catch (error) {
            const message = error instanceof Error ? error.message : ''
            // Выключено до юр. проверки или лимит — не дёргаем ИИ для остальных фото.
            if (/выключено|лимит|не настроен|модель/i.test(message)) { recognitionOff.current = message; setRecognitionNotice(message) }
            state.recognized = null
          }
        }
        patch(job.id, { recognized: state.recognized })
      }
      const r = state.recognized
      onItemRef.current({
        id: job.id,
        name: r?.name || 'Новая вещь',
        category: r?.category || 'Верх',
        type: r?.type,
        color: r?.color || 'не указан',
        colors: r?.colors,
        season: r?.season || 'Все сезоны',
        warmth: r?.warmth || 3,
        material: r?.material,
        formality: r?.formality,
        style: r?.style,
        heelHeight: r?.heelHeight,
        windProtection: r?.windProtection,
        rainProtection: r?.rainProtection,
        image: '',
        photoPath: state.photoPath,
        originalPath: state.originalPath,
        useOriginal: !state.photoPath,
        note: '',
        tags: [],
        needsReview: !r || (r.confidence ?? 0) < 0.6,
        createdAt: new Date().toISOString()
      })
      patch(job.id, { status: 'done', file: undefined })
    } catch (error) {
      patch(job.id, { status: 'error', error: navigator.onLine ? (error instanceof Error ? error.message : 'Ошибка загрузки') : 'Нет сети — повторим автоматически' })
    } finally {
      running.current.delete(job.id)
    }
  }, [userId])

  // Планировщик: не больше CONCURRENCY задач одновременно.
  useEffect(() => {
    const free = CONCURRENCY - running.current.size
    if (free <= 0) return
    jobs.filter(job => job.status === 'queued' && !running.current.has(job.id)).slice(0, free).forEach(job => {
      running.current.add(job.id)
      void process(job)
    })
  }, [jobs, process])

  const retry = useCallback((id?: string) => {
    setJobs(list => list.map(job => job.status === 'error' && (!id || job.id === id) ? { ...job, status: 'queued', error: undefined } : job))
  }, [])

  useEffect(() => {
    const online = () => retry()
    window.addEventListener('online', online)
    return () => window.removeEventListener('online', online)
  }, [retry])

  const addFiles = (files: File[]) => {
    const images = files.filter(file => file.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/i.test(file.name))
    setJobs(list => [...list.filter(job => job.status !== 'done'), ...images.map(file => ({ id: newId(), file, status: 'queued' as const }))])
    return images.length
  }

  const clearDone = () => setJobs(list => list.filter(job => job.status !== 'done'))
  const remove = (id: string) => setJobs(list => list.filter(job => job.id !== id || running.current.has(id)))

  const active = jobs.filter(job => !['done', 'error'].includes(job.status)).length
  const done = jobs.filter(job => job.status === 'done').length
  const failed = jobs.filter(job => job.status === 'error').length

  return { jobs, addFiles, retry, clearDone, remove, active, done, failed, recognitionNotice }
}
