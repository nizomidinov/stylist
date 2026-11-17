import { useEffect, useRef } from 'react'
import { Camera, CheckCircle2, ImagePlus, RotateCcw, Sparkles, X } from 'lucide-react'
import { Modal } from './ui'
import { JOB_LABELS, type useUploadQueue } from '../hooks/useUploadQueue'
import { preloadBackgroundRemoval } from '../lib/background'
import { preloadRecognition } from '../lib/vision/recognize'

type Queue = ReturnType<typeof useUploadQueue>

export function BatchUpload({ queue, itemsCount, onClose, onManual }: { queue: Queue; itemsCount: number; onClose: () => void; onManual: () => void }) {
  const gallery = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  useEffect(() => {
    preloadBackgroundRemoval()
    if (import.meta.env.VITE_RECOGNITION !== 'server') preloadRecognition()
  }, [])

  const add = (list: FileList | null) => {
    if (list?.length) queue.addFiles([...list])
  }
  const target = Math.max(10, itemsCount + queue.active)
  const total = itemsCount + queue.active

  return (
    <Modal title="Добавить вещи" subtitle="Выбери сразу несколько фото — фон уберём, вещи распознаем автоматически." onClose={onClose} wide>
      {itemsCount < 10 && (
        <div className="threshold-note">
          <Sparkles size={19} />
          <div>
            <b>{Math.min(total, 10)} из 10 вещей</b>
            <span>Начни с базы: 3–4 верха, 2–3 низа, 2 пары обуви и 1 верхняя одежда.</span>
          </div>
          <b>{Math.min(total, 10)}/10</b>
        </div>
      )}
      <div className="progress"><i style={{ width: `${Math.min(100, total / target * 100)}%` }} /></div>

      <div className="upload-actions">
        <button type="button" className="upload-area" onClick={() => gallery.current?.click()}>
          <ImagePlus />
          <b>Выбрать из галереи</b>
          <small>Можно сразу 10 и больше фото</small>
        </button>
        <button type="button" className="upload-area" onClick={() => camera.current?.click()}>
          <Camera />
          <b>Сфотографировать</b>
          <small>По одной вещи на кадр</small>
        </button>
        <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={event => { add(event.target.files); event.currentTarget.value = '' }} />
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={event => { add(event.target.files); event.currentTarget.value = '' }} />
      </div>

      <ul className="photo-tips">
        <li>Вещь целиком, без людей в кадре</li>
        <li>Ровный однотонный фон — пол, кровать, стена</li>
        <li>Дневной свет, без сильных теней</li>
      </ul>

      {queue.recognitionNotice && <p className="form-hint" role="status">{queue.recognitionNotice} Карточки создадутся — проверь поля вручную.</p>}
      <p className="form-hint">Вещи распознаёт встроенный ИИ прямо на телефоне. При первом запуске он скачивается (~90 МБ), дальше работает быстро.</p>

      {queue.jobs.length > 0 && (
        <>
          <div className="upload-summary">
            <span>Загружено {queue.done} · в работе {queue.active}{queue.failed ? ` · ошибок ${queue.failed}` : ''}</span>
            <span>
              {queue.failed > 0 && <button type="button" className="text-link" onClick={() => queue.retry()}><RotateCcw size={14} /> Повторить</button>}
              {queue.done > 0 && <button type="button" className="text-link" onClick={queue.clearDone}>Очистить готовые</button>}
            </span>
          </div>
          <div className="upload-grid">
            {queue.jobs.map(job => (
              <div className={`upload-job ${job.status}`} key={job.id}>
                {job.clean || job.original ? <img src={job.clean ?? job.original} alt="" /> : <div className="upload-job-blank" />}
                <span>
                  {job.status === 'done' && <CheckCircle2 size={13} />} {JOB_LABELS[job.status]}
                </span>
                {job.status === 'error' && (
                  <div className="upload-job-error">
                    <small>{job.error}</small>
                    <button type="button" onClick={() => queue.retry(job.id)} aria-label="Повторить"><RotateCcw size={13} /></button>
                    <button type="button" onClick={() => queue.remove(job.id)} aria-label="Убрать"><X size={13} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="modal-actions">
        <button className="btn secondary" onClick={onManual}>Добавить без фото</button>
        <button className="btn primary" onClick={onClose}>{queue.active ? 'Продолжить в фоне' : 'Готово'}</button>
      </div>
      <p className="form-hint">Фото хранятся в закрытом хранилище и видны только тебе.{import.meta.env.VITE_BG_REMOVAL_URL ? '' : ' Фон удаляется прямо на телефоне.'}</p>
    </Modal>
  )
}
