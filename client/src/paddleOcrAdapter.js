import { PaddleOCR } from '@paddleocr/paddleocr-js'

let ocrEngine = null
let initPromise = null

export async function getPaddleOcrEngine() {
  if (ocrEngine) return ocrEngine

  if (!initPromise) {
    initPromise = (async () => {
      const engine = await PaddleOCR.create({
        lang: 'en',
        ocrVersion: 'PP-OCRv5',
        ortOptions: {
          backend: 'wasm',
          wasmPaths: 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/'
        }
      })

      ocrEngine = engine
      return engine
    })().catch(error => {
      initPromise = null
      throw error
    })
  }

  return initPromise
}

export async function disposePaddleOcrEngine() {
  if (!ocrEngine) {
    ocrEngine = null
    initPromise = null
    return
  }

  try {
    if (typeof ocrEngine.dispose === 'function') {
      await ocrEngine.dispose()
    }
  } finally {
    ocrEngine = null
    initPromise = null
  }
}

export async function recognizeWithPaddleOcr(file) {
  const engine = await getPaddleOcrEngine()
  const [result] = await engine.predict(file)

  const items = Array.isArray(result?.items) ? result.items : []
  const recognized = items
    .filter(item => typeof item?.text === 'string' && item.text.trim())
    .map(item => ({
      text: item.text.trim(),
      score: Number(item.score) || 0
    }))

  const text = recognized.map(item => item.text).join(' ').replace(/\s+/g, ' ').trim()
  const score = recognized.length ? Math.max(...recognized.map(item => item.score)) : null

  return {
    text,
    lines: recognized,
    score,
    raw: result
  }
}
