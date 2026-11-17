// Удаление фона: вещь на белом фоне (ТЗ, задача 7).
//
// Два способа:
//  1) VITE_BG_REMOVAL_URL задан — фото отправляется на ваш сервер rembg (`rembg s`, POST /api/remove).
//     Подходит для размещения в РФ: сервер ставится в Yandex Cloud / VK Cloud.
//  2) По умолчанию — прямо в браузере (@imgly/background-removal, ONNX/WebAssembly).
//     Фото НЕ покидает телефон: с CDN скачивается только модель (~40 МБ, один раз, затем кеш).
//     Лицензия библиотеки — AGPL-3.0: для коммерческого запуска нужна коммерческая лицензия IMG.LY
//     или переход на способ 1. См. CLAUDE.md.
//
// После вырезания вещь обрезается по контуру, центрируется на белом квадрате с полями.
// Если результат подозрительный (почти пусто или почти всё кадр) — бросаем ошибку, и в карточке
// остаётся оригинал.

const SERVER_URL = import.meta.env.VITE_BG_REMOVAL_URL as string | undefined
const OUTPUT_SIDE = 1024

let preloadPromise: Promise<unknown> | null = null

/** Заранее подгрузить модель (например, при открытии формы загрузки). */
export function preloadBackgroundRemoval() {
  if (SERVER_URL || preloadPromise) return
  preloadPromise = import('@imgly/background-removal')
    .then(module => module.preload({ model: 'isnet_fp16' }))
    .catch(() => { preloadPromise = null })
}

async function cutout(blob: Blob): Promise<Blob> {
  if (SERVER_URL) {
    const form = new FormData()
    form.append('file', blob, 'photo.jpg')
    const response = await fetch(SERVER_URL, { method: 'POST', body: form })
    if (!response.ok) throw new Error('Сервер удаления фона недоступен')
    return await response.blob()
  }
  const { removeBackground } = await import('@imgly/background-removal')
  return await removeBackground(blob, { model: 'isnet_fp16', output: { format: 'image/png' } })
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось обработать изображение')) }
    img.src = url
  })
}

/** Вырезанная вещь (PNG с прозрачностью) → JPEG на белом фоне, обрезанный по контуру. */
async function onWhite(png: Blob) {
  const img = await loadImage(png)
  const source = document.createElement('canvas')
  source.width = img.width
  source.height = img.height
  const sctx = source.getContext('2d', { willReadFrequently: true })!
  sctx.drawImage(img, 0, 0)
  const { data, width, height } = sctx.getImageData(0, 0, img.width, img.height)
  let minX = width, minY = height, maxX = -1, maxY = -1, opaque = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 24) {
        opaque++
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  const share = opaque / (width * height)
  if (maxX < 0 || share < 0.02 || share > 0.97) throw new Error('Фон не удалось отделить — используем оригинал')
  const boxW = maxX - minX + 1, boxH = maxY - minY + 1
  const side = Math.max(boxW, boxH) * 1.16
  const scale = Math.min(1, OUTPUT_SIDE / side)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = Math.round(side * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    source, minX, minY, boxW, boxH,
    Math.round((canvas.width - boxW * scale) / 2), Math.round((canvas.height - boxH * scale) / 2),
    Math.round(boxW * scale), Math.round(boxH * scale)
  )
  return canvas.toDataURL('image/jpeg', 0.9)
}

/** Принимает фото (data URL), возвращает фото вещи на белом фоне (data URL JPEG). */
export async function removeBackgroundToWhite(dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob()
  return onWhite(await cutout(blob))
}
