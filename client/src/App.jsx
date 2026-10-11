import { useEffect, useRef, useState } from 'react'
import { recognize } from 'tesseract.js'
import { recognizeWithPaddleOcr } from './paddleOcrAdapter'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

export default function App() {
  const [imageUrl, setImageUrl] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [text, setText] = useState('')
  const [status, setStatus] = useState('Ready. Choose Read Text to begin.')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [ocrConfidence, setOcrConfidence] = useState(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const fileRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const cameraCheckInProgressRef = useRef(false)
  const lastCameraMessageRef = useRef('')

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl)
      stopCamera()
    }
  }, [imageUrl])

  useEffect(() => {
    if (!cameraOpen || !videoRef.current || !streamRef.current) return

    const video = videoRef.current
    const stream = streamRef.current

    video.srcObject = stream
    video.muted = true
    video.playsInline = true
    video.autoplay = true

    const handleMetadata = async () => {
      if (!video.videoWidth || !video.videoHeight) {
        setStatus('Camera preview is not ready. Please try again.')
        speak('Camera preview is not ready. Please try again.')
        stopCamera()
        return
      }

      try {
        await video.play()
      } catch (error) {
        console.error(error)
        setStatus('Camera preview could not start. Please try again.')
        speak('Camera preview could not start. Please try again.')
        stopCamera()
      }
    }

    video.addEventListener('loadedmetadata', handleMetadata)
    return () => video.removeEventListener('loadedmetadata', handleMetadata)
  }, [cameraOpen])

  function stopCamera(announcement = '') {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }

    setCameraOpen(false)

    if (announcement) {
      setStatus(announcement)
      speak(announcement)
    }
  }

  function handleImage(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setStatus('That file is not an image. Please choose a photo.')
      speak('That file is not an image. Please choose a photo.')
      return
    }
    if (file.size > 12 * 1024 * 1024) {
      setStatus('This image is larger than 12 MB. Please choose a smaller photo.')
      speak('This image is larger than 12 MB. Please choose a smaller photo.')
      return
    }
    setImageFile(file)
    setImageUrl(URL.createObjectURL(file))
    setText('')
    setProgress(0)
    setOcrConfidence(null)
    setStatus('Photo ready. Select Read Text when you are ready.')
    speak('Photo ready. Select Read Text when you are ready.')
  }

  function sanitizeExtractedText(text) {
    const cleaned = (text || '').replace(/\s+/g, ' ').trim()
    if (!cleaned) return ''

    const letters = cleaned.replace(/[^A-Za-z0-9]/g, '')
    if (letters.length < 3 && cleaned.split(/\s+/).length < 2) {
      return ''
    }

    return cleaned
  }

  function isLikelyMeaningfulText(text) {
    const cleaned = (text || '').trim()
    if (!cleaned) return false

    const letters = cleaned.replace(/[^A-Za-z]/g, '')
    const punctuationCount = (cleaned.match(/[^A-Za-z0-9\s]/g) || []).length
    const alphaRatio = letters.length / Math.max(1, cleaned.length)

    if (letters.length < 4) return false
    if (punctuationCount > Math.max(2, cleaned.length * 0.15)) return false
    if (alphaRatio < 0.55) return false

    return true
  }

  function prepareOcrCanvas(image, mode = 'grayscale') {
    const maxDimension = 2200
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) return null

    context.drawImage(image, 0, 0, width, height)

    if (mode === 'grayscale') {
      const imageData = context.getImageData(0, 0, width, height)
      const pixels = imageData.data

      for (let index = 0; index < pixels.length; index += 4) {
        const red = pixels[index]
        const green = pixels[index + 1]
        const blue = pixels[index + 2]
        const gray = 0.299 * red + 0.587 * green + 0.114 * blue
        pixels[index] = gray
        pixels[index + 1] = gray
        pixels[index + 2] = gray
      }

      context.putImageData(imageData, 0, 0)
    }

    if (mode === 'threshold') {
      const imageData = context.getImageData(0, 0, width, height)
      const pixels = imageData.data

      for (let index = 0; index < pixels.length; index += 4) {
        const red = pixels[index]
        const green = pixels[index + 1]
        const blue = pixels[index + 2]
        const gray = 0.299 * red + 0.587 * green + 0.114 * blue
        const value = gray > 180 ? 255 : 0
        pixels[index] = value
        pixels[index + 1] = value
        pixels[index + 2] = value
      }

      context.putImageData(imageData, 0, 0)
    }

    return canvas
  }

  async function recognizePreparedText(file, pageSegMode = '6') {
    try {
      const paddleResult = await recognizeWithPaddleOcr(file)
      const paddleText = sanitizeExtractedText(paddleResult?.text || '')
      if (paddleText && isLikelyMeaningfulText(paddleText)) {
        const confidence = typeof paddleResult?.score === 'number' && Number.isFinite(paddleResult.score)
          ? Math.min(100, Math.max(0, Math.round(paddleResult.score * 100)))
          : null

        console.log('[PaddleOCR result]', {
          text: paddleText,
          confidence,
          lines: paddleResult?.lines?.slice(0, 5)
        })

        setProgress(100)
        return { text: paddleText, confidence }
      }
    } catch (error) {
      console.warn('PaddleOCR failed, falling back to Tesseract.', error)
    }

    const sourceUrl = URL.createObjectURL(file)

    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('Image failed to load for OCR preprocessing.'))
        img.src = sourceUrl
      })

      const attempts = [
        { name: 'original-psm6', canvas: prepareOcrCanvas(image, 'original'), pageSegMode: '6' },
        { name: 'grayscale-psm6', canvas: prepareOcrCanvas(image, 'grayscale'), pageSegMode: '6' },
        { name: 'threshold-psm4', canvas: prepareOcrCanvas(image, 'threshold'), pageSegMode: '4' },
        { name: 'grayscale-psm11', canvas: prepareOcrCanvas(image, 'grayscale'), pageSegMode: '11' }
      ].filter(attempt => attempt.canvas)

      let bestResult = { text: '', confidence: 0 }

      for (const attempt of attempts) {
        const result = await recognize(attempt.canvas, 'eng', {
          logger: message => {
            if (message.status === 'recognizing text' && typeof message.progress === 'number') {
              setProgress(Math.round(message.progress * 100))
            }
          },
          tessedit_pageseg_mode: attempt.pageSegMode,
          preserve_interword_spaces: '1'
        })

        const confidence = typeof result?.data?.confidence === 'number' ? Math.round(result.data.confidence) : 0
        const extracted = sanitizeExtractedText(result?.data?.text || '')

        console.log('[OCR attempt]', {
          variant: attempt.name,
          pageSegMode: attempt.pageSegMode,
          confidence,
          text: extracted
        })

        const isMeaningful = isLikelyMeaningfulText(extracted)
        if (isMeaningful && confidence > bestResult.confidence) {
          bestResult = { text: extracted, confidence }
        }
      }

      if (!bestResult.text) {
        const fallback = attempts[0] ? await recognize(attempts[0].canvas, 'eng', {
          logger: () => {},
          tessedit_pageseg_mode: attempts[0].pageSegMode,
          preserve_interword_spaces: '1'
        }) : null

        const fallbackText = sanitizeExtractedText(fallback?.data?.text || '')
        const fallbackConfidence = typeof fallback?.data?.confidence === 'number' ? Math.round(fallback.data.confidence) : 0
        if (fallbackText) {
          bestResult = { text: fallbackText, confidence: fallbackConfidence }
        }
      }

      return bestResult
    } finally {
      URL.revokeObjectURL(sourceUrl)
    }
  }

  async function startGuidedCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('This browser does not support camera access. You can still use the image picker.')
      speak('This browser does not support camera access. You can still use the image picker.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      })

      if (!stream || stream.getVideoTracks().length === 0) {
        throw new Error('No video track returned by getUserMedia.')
      }

      streamRef.current = stream
      setCameraOpen(true)
      setStatus('Camera ready. Frame the text and capture the photo.')
      speak('Camera ready. Frame the text and capture the photo.')
    } catch (error) {
      console.error(error)
      setStatus('Could not access the camera. Please allow camera permission or use the image picker instead.')
      speak('Could not access the camera. Please allow camera permission or use the image picker instead.')
      stopCamera()
    }
  }

  async function checkForText() {
    if (!cameraOpen || !videoRef.current || !streamRef.current) {
      setStatus('Please start the camera before checking for text.')
      speak('Please start the camera before checking for text.')
      return
    }

    if (busy || cameraCheckInProgressRef.current) return

    const video = videoRef.current
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      setStatus('The camera is still warming up. Please wait a moment and try again.')
      speak('The camera is still warming up. Please wait a moment and try again.')
      return
    }

    cameraCheckInProgressRef.current = true
    setStatus('Checking the camera frame for text…')

    try {
      const canvas = document.createElement('canvas')
      const scale = 0.4
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale))

      const context = canvas.getContext('2d')
      if (!context) {
        throw new Error('Canvas context unavailable for text check.')
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height)

      const { data: { text } } = await recognize(canvas, 'eng', { logger: () => {} })
      const trimmed = text.trim()
      const hasLikelyText = /[A-Za-z0-9]/.test(trimmed) && trimmed.split(/\s+/).filter(word => word.length > 2).length > 0

      if (!hasLikelyText) {
        const message = "I can't detect readable text yet. Point your camera toward a printed page or label."
        if (lastCameraMessageRef.current !== message) {
          lastCameraMessageRef.current = message
          setStatus(message)
          speak(message)
        }
        return
      }

      const successMessage = 'Text detected. Hold steady, then capture your photo.'
      if (lastCameraMessageRef.current !== successMessage) {
        lastCameraMessageRef.current = successMessage
        setStatus(successMessage)
        speak(successMessage)
      }
    } catch (error) {
      console.error(error)
      const message = 'I could not check the camera frame for text. Please try again or use the image picker.'
      if (lastCameraMessageRef.current !== message) {
        lastCameraMessageRef.current = message
        setStatus(message)
        speak(message)
      }
    } finally {
      cameraCheckInProgressRef.current = false
    }
  }

  function captureCameraPhoto() {
    const video = videoRef.current

    if (!video || !streamRef.current) {
      setStatus('The camera is not available. Please start the camera again.')
      speak('The camera is not available. Please start the camera again.')
      return
    }

    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      setStatus('The camera is still warming up. Please wait a moment and try again.')
      speak('The camera is still warming up. Please wait a moment and try again.')
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const context = canvas.getContext('2d')
    if (!context) {
      setStatus('The camera capture could not be prepared. Please try again.')
      speak('The camera capture could not be prepared. Please try again.')
      stopCamera()
      return
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    if (typeof canvas.toBlob !== 'function') {
      setStatus('Photo capture is not supported in this browser. Please use the image picker instead.')
      speak('Photo capture is not supported in this browser. Please use the image picker instead.')
      stopCamera()
      return
    }

    canvas.toBlob(blob => {
      if (!blob || blob.size === 0) {
        setStatus('The photo capture failed. Please try again.')
        speak('The photo capture failed. Please try again.')
        stopCamera()
        return
      }

      const file = new File([blob], `camera-capture-${Date.now()}.png`, {
        type: 'image/png'
      })

      if (!(file instanceof File) || file.size === 0) {
        setStatus('The captured image was invalid. Please try again.')
        speak('The captured image was invalid. Please try again.')
        stopCamera()
        return
      }

      lastCameraMessageRef.current = ''
      handleImage(file)
      stopCamera()
    }, 'image/png', 0.92)
  }

  function speak(value, rate = 1) {
    if (!('speechSynthesis' in window)) {
      setStatus('Speech output is not supported in this browser. You can still read the text on screen.')
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(value)
    utterance.rate = rate
    utterance.lang = 'en-US'
    window.speechSynthesis.speak(utterance)
  }

  async function callAppReadTextApi(extractedText, context = 'selected photo') {
    const response = await fetch(`${API_URL}/api/read-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        extractedText,
        context,
        readAloud: true,
        preserveUncertainty: true
      })
    })

    let payload = {}
    try {
      payload = await response.json()
    } catch (error) {
      console.warn('App API response was not JSON.', error)
    }

    if (!response.ok) {
      throw new Error(payload?.error || 'The reading service could not process the extracted text.')
    }

    const readingText = typeof payload?.reading === 'string' ? payload.reading.trim() : ''
    if (!readingText) {
      throw new Error('The reading service returned an empty response.')
    }

    return readingText
  }

  async function readText() {
    if (!imageFile) {
      setStatus('Please choose a photo first.')
      speak('Please choose a photo first.')
      fileRef.current?.click()
      return
    }

    if (busy || cameraCheckInProgressRef.current) return

    setBusy(true)
    setProgress(0)
    setStatus('Preparing the image for OCR. Please wait.')
    speak('Preparing the image for OCR. Please wait.')

    try {
      const result = await recognizePreparedText(imageFile, '6')
      const extracted = result.text
      const confidence = result.confidence
      setOcrConfidence(confidence)

      if (!extracted) {
        setText('')
        setStatus('I could not find readable text. Try moving closer, improving the light, and taking another photo.')
        speak('I could not find readable text. Try moving closer and improving the light.')
        return
      }

      let readingText = extracted
      try {
        readingText = await callAppReadTextApi(extracted, 'selected photo')
        setText(readingText)

        if (confidence < 60) {
          const warning = 'OCR confidence is low. Please verify the result against the original label or cover.'
          setStatus(`Text extraction finished. ${warning}`)
          speak(`${warning} ${readingText}`)
        } else {
          setStatus('Text extraction finished. Please verify the result, especially for important information.')
          speak(readingText)
        }
      } catch (error) {
        console.error('Backend MCP reading failed:', error)
        setText(extracted)
        setStatus('The reading service failed. The local OCR text is shown below, but please verify important details manually.')
        speak(`The reading service failed. ${extracted}`)
      }
    } catch (error) {
      console.error(error)
      setStatus('Sorry, text reading failed. Try another image or refresh the page.')
      speak('Sorry, text reading failed. Please try another image.')
    } finally {
      setBusy(false)
    }
  }

  function repeatResult() {
    if (text) speak(text)
    else {
      setStatus('There is no reading to repeat yet.')
      speak('There is no reading to repeat yet.')
    }
  }

  function stopSpeech() {
    window.speechSynthesis?.cancel()
    setStatus('Speech stopped.')
  }

  async function checkBackend() {
    try {
      const response = await fetch(`${API_URL}/health`)
      const data = await response.json()
      setStatus(data.status === 'ok' ? 'Backend connection works.' : 'Backend responded, but its status was unexpected.')
      speak(data.status === 'ok' ? 'Backend connection works.' : 'Backend status was unexpected.')
    } catch {
      setStatus('Could not reach the backend. Start the server in the server folder.')
      speak('Could not reach the backend.')
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">S</div>
        <div>
          <p className="eyebrow">VOICE-FIRST ACCESSIBILITY</p>
          <h1>SeeMate AI</h1>
        </div>
      </header>

      <section className="intro" aria-labelledby="welcome-heading">
        <p className="eyebrow">YOUR EVERYDAY COMPANION</p>
        <h2 id="welcome-heading">Let me read it for you.</h2>
        <p>Choose a photo of printed text, and SeeMate will try to read it aloud. You can use your screen reader and keyboard to navigate this page.</p>
      </section>

      <section className="panel" aria-labelledby="capture-heading">
        <h2 id="capture-heading">1. Choose a photo</h2>
        <p className="hint">Place the label or page in good light. Keep the camera steady and make sure the text fills much of the photo.</p>

        <div className="camera-actions" aria-label="Camera controls">
          <button
            type="button"
            className="button button-primary"
            onClick={startGuidedCamera}
            disabled={cameraOpen}
            aria-controls="guided-camera-preview"
            aria-expanded={cameraOpen}
          >
            Start guided camera
          </button>
        </div>

        {cameraOpen && (
          <div className="camera-panel" id="guided-camera-preview" aria-live="polite" aria-label="Live camera preview for guided text capture">
            <video ref={videoRef} className="camera-video" autoPlay playsInline muted aria-label="Rear camera preview"></video>
            <div className="camera-actions">
              <button type="button" className="button button-primary" onClick={checkForText}>
                Check for text
              </button>
              <button type="button" className="button button-primary" onClick={captureCameraPhoto}>
                Capture photo
              </button>
              <button type="button" className="button button-secondary" onClick={() => stopCamera('Camera cancelled.') }>
                Cancel camera
              </button>
            </div>
          </div>
        )}

        <input
          ref={fileRef}
          className="file-input"
          type="file"
          accept="image/*"
          capture="environment"
          aria-label="Take a photo or choose an image containing text"
          onChange={event => handleImage(event.target.files?.[0])}
        />
        <button type="button" className="button button-primary" onClick={() => fileRef.current?.click()}>
          Take photo or choose image
        </button>
        {imageUrl && (
          <figure className="preview">
            <img src={imageUrl} alt="Selected photo to be read by SeeMate" />
            <figcaption>Photo selected. Check that it contains the text you want read.</figcaption>
          </figure>
        )}
      </section>

      <section className="panel" aria-labelledby="read-heading">
        <h2 id="read-heading">2. Listen to the text</h2>
        <div className="actions">
          <button type="button" className="button button-primary" onClick={readText} disabled={busy}>
            {busy ? 'Reading photo…' : 'Read text aloud'}
          </button>
          <button type="button" className="button button-secondary" onClick={repeatResult}>Repeat</button>
          <button type="button" className="button button-secondary" onClick={() => text ? speak(text, 0.75) : repeatResult()}>Read slower</button>
          <button type="button" className="button button-secondary" onClick={stopSpeech}>Stop speech</button>
        </div>
        {busy && <p role="status" aria-live="polite">Processing image: {progress}%</p>}
        <div className="status" role="status" aria-live="polite">
          <strong>Status</strong>
          <p>{status}</p>
        </div>
        {text && (
          <div className="result" aria-labelledby="result-heading">
            <h3 id="result-heading">Recognized text</h3>
            <p>{text}</p>
            {ocrConfidence !== null && (
              <p className={ocrConfidence < 60 ? 'confidence-warning' : 'confidence-status'}>
                OCR confidence: {ocrConfidence}%
              </p>
            )}
            <p className="safety-note">OCR can make mistakes. Verify important details against the original label or cover.</p>
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="connection-heading">
        <h2 id="connection-heading">Developer check</h2>
        <p className="hint">This checks whether the local backend is running. It is not an Alexa+ connection.</p>
        <button type="button" className="button button-secondary" onClick={checkBackend}>Check backend</button>
      </section>

      <footer>
        <p>SeeMate is an assistive prototype, not a safety device. Do not rely on OCR alone for medication, emergency, or other critical decisions.</p>
      </footer>
    </main>
  )
}
