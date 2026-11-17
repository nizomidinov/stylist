// Фото вещей в закрытом бакете Supabase Storage (ТЗ, задачи 7, 21).
// Доступ — только владелице (RLS по папке <user_id>/), в браузер отдаются временные подписанные ссылки.
import { supabase } from './supabase'
import type { Item } from '../types'

const BUCKET = 'wardrobe'
const URL_TTL = 60 * 60 // 1 час
const signed = new Map<string, { url: string; expires: number }>()

export function dataUrlToBlob(dataUrl: string) {
  const [header, base64] = dataUrl.split(',')
  const mime = header.match(/data:(.*?);/)?.[1] ?? 'image/jpeg'
  const bytes = atob(base64)
  const array = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i)
  return new Blob([array], { type: mime })
}

export async function uploadPhoto(userId: string, itemId: string, kind: 'original' | 'clean', dataUrl: string) {
  const path = `${userId}/${itemId}/${kind}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, dataUrlToBlob(dataUrl), { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' })
  if (error) throw new Error(error.message.includes('Bucket not found') ? 'Хранилище фото не настроено — примени миграцию Supabase' : 'Не удалось загрузить фото')
  signed.delete(path)
  return path
}

export async function deleteItemPhotos(item: Item) {
  const paths = [item.photoPath, item.originalPath].filter((path): path is string => Boolean(path))
  if (!paths.length) return
  paths.forEach(path => signed.delete(path))
  await supabase.storage.from(BUCKET).remove(paths)
}

/** Пакетно получает подписанные ссылки, кеширует до истечения. */
export async function signPaths(paths: string[]) {
  const now = Date.now()
  const missing = [...new Set(paths)].filter(path => (signed.get(path)?.expires ?? 0) <= now + 60_000)
  for (let i = 0; i < missing.length; i += 100) {
    const chunk = missing.slice(i, i + 100)
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(chunk, URL_TTL)
    for (const entry of data ?? []) {
      if (entry.signedUrl && entry.path) signed.set(entry.path, { url: entry.signedUrl, expires: now + URL_TTL * 1000 })
    }
  }
  return new Map(paths.map(path => [path, signed.get(path)?.url ?? '']))
}

/** Какой путь показывать: обработанное фото или оригинал (кнопка «использовать оригинал»). */
export const displayPath = (item: Item) => (item.useOriginal ? item.originalPath : item.photoPath) ?? item.originalPath ?? item.photoPath

/** Сжатие на телефоне перед отправкой: длинная сторона до maxSide, JPEG. */
export function compressImage(file: Blob, maxSide = 1600, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('canvas')); return }
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось открыть фото. Попробуй формат JPEG или PNG.')) }
    img.src = url
  })
}

/** Уменьшенная копия для ИИ-распознавания (дешевле и быстрее). */
export const shrinkDataUrl = (dataUrl: string, maxSide = 768) => compressImage(dataUrlToBlob(dataUrl), maxSide, 0.8)
