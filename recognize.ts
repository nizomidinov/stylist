// Собственное распознавание вещи прямо на устройстве: модель CLIP (ONNX, transformers.js).
// Фото не покидает телефон. Модель (~90 МБ) скачивается один раз и кешируется браузером.
//
// Откуда грузится модель:
//  - по умолчанию с Hugging Face (VITE_CLIP_MODEL, по умолчанию Xenova/clip-vit-base-patch16);
//  - VITE_MODEL_HOST — свой хост (например, бакет в Yandex Object Storage) с той же структурой папок,
//    чтобы не зависеть от зарубежного сервиса.
import { HEELS, MATERIALS, NOT_CLOTHING, TYPES, dominantColors, prompt } from './catalog'
import { decide, softmax, type LocalAnalysis } from './decide'

const MODEL = (import.meta.env.VITE_CLIP_MODEL as string | undefined) || 'Xenova/clip-vit-base-patch16'
const MODEL_HOST = import.meta.env.VITE_MODEL_HOST as string | undefined
/** Масштаб логитов CLIP (logit_scale.exp() ≈ 100). */
const SCALE = 100

type Embeddings = { types: Float32Array[]; materials: Float32Array[]; heels: Float32Array[] }
type Runtime = {
  embedImage: (dataUrl: string) => Promise<Float32Array>
  text: Embeddings
}

let runtime: Promise<Runtime> | null = null

function normalize(vector: Float32Array) {
  let norm = 0
  for (const value of vector) norm += value * value
  norm = Math.sqrt(norm) || 1
  return vector.map(value => value / norm)
}

function split(data: Float32Array, rows: number) {
  const size = data.length / rows
  return Array.from({ length: rows }, (_, i) => normalize(data.slice(i * size, (i + 1) * size)))
}

async function load(): Promise<Runtime> {
  const { env, AutoTokenizer, AutoProcessor, CLIPTextModelWithProjection, CLIPVisionModelWithProjection, RawImage } = await import('@huggingface/transformers')
  env.allowLocalModels = false
  if (MODEL_HOST) env.remoteHost = MODEL_HOST.endsWith('/') ? MODEL_HOST : MODEL_HOST + '/'
  const options = { dtype: 'q8' as const, device: 'wasm' as const }
  const [tokenizer, processor, textModel, visionModel] = await Promise.all([
    AutoTokenizer.from_pretrained(MODEL),
    AutoProcessor.from_pretrained(MODEL),
    CLIPTextModelWithProjection.from_pretrained(MODEL, options),
    CLIPVisionModelWithProjection.from_pretrained(MODEL, options)
  ])

  const embedTexts = async (texts: string[]) => {
    const inputs = tokenizer(texts, { padding: true, truncation: true })
    const { text_embeds } = await textModel(inputs)
    return split(text_embeds.data as Float32Array, texts.length)
  }
  // Описания считаются один раз за сессию.
  const text: Embeddings = {
    types: await embedTexts([...TYPES.map(type => prompt(type.prompt)), ...NOT_CLOTHING.map(text => `a photo of ${text}`)]),
    materials: await embedTexts(MATERIALS.map(material => prompt(`clothing made of ${material.prompt}`))),
    heels: await embedTexts(HEELS.map(heel => prompt(heel.prompt)))
  }

  return {
    text,
    embedImage: async (dataUrl: string) => {
      const image = await RawImage.fromURL(dataUrl)
      const inputs = await processor(image)
      const { image_embeds } = await visionModel(inputs)
      return normalize(image_embeds.data as Float32Array)
    }
  }
}

/** Начать скачивание модели заранее (при открытии формы загрузки). */
export function preloadRecognition() {
  if (!runtime) runtime = load().catch(error => { runtime = null; throw error })
  runtime.catch(() => undefined)
}

const dot = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s }
const probabilities = (image: Float32Array, texts: Float32Array[]) => softmax(texts.map(text => dot(image, text) * SCALE))

async function pixelColors(dataUrl: string, onWhite: boolean) {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const side = 160
  const scale = Math.min(1, side / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.width * scale))
  canvas.height = Math.max(1, Math.round(img.height * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return dominantColors(data, canvas.width, canvas.height, onWhite)
}

/**
 * Распознаёт вещь на фото.
 * @param onWhite фото уже на белом фоне (после удаления фона) — цвета считаются точнее.
 */
export async function recognizeLocally(dataUrl: string, onWhite = true): Promise<LocalAnalysis> {
  if (!runtime) preloadRecognition()
  let model: Runtime
  try { model = await runtime! } catch {
    runtime = null
    throw new Error('Не удалось загрузить модель распознавания — проверь интернет. Карточку можно заполнить вручную.')
  }
  const [image, colors] = await Promise.all([model.embedImage(dataUrl), pixelColors(dataUrl, onWhite)])
  const types = probabilities(image, model.text.types)
  const best = TYPES[types.slice(0, TYPES.length).indexOf(Math.max(...types.slice(0, TYPES.length)))]
  return decide({
    types,
    materials: probabilities(image, model.text.materials),
    heels: best?.detectHeel ? probabilities(image, model.text.heels) : [],
    colors
  })
}
