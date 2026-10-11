import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'

function sanitizeOcrText(rawText = '') {
  const cleaned = String(rawText ?? '').replace(/\s+/g, ' ').trim()
  return cleaned
}

function buildUncertaintyNote(context = '') {
  const base = 'This reading may contain OCR mistakes, so verify important details against the original label, page, or cover when accuracy matters.'
  return context ? `${base} Context: ${context}.` : base
}

export function createSeeMateMcpServer() {
  const server = new McpServer({
    name: 'seemate-ai',
    version: '1.0.0'
  })

  server.registerTool(
    'format_reading_response',
    {
      description: 'Convert OCR text into an accessible response while preserving uncertainty and safety guidance.',
      inputSchema: z.object({
        extractedText: z.string().describe('The OCR output text to convert into a clean spoken or screen-readable response.'),
        context: z.string().optional().describe('Optional context such as medicine label, package, book cover, or page title.'),
        readAloud: z.boolean().optional().default(true).describe('Whether the response is intended for spoken output.'),
        preserveUncertainty: z.boolean().optional().default(true).describe('Whether to add a caution about possible OCR mistakes.')
      })
    },
    async ({ extractedText, context = '', readAloud = true, preserveUncertainty = true }) => {
      const cleanText = sanitizeOcrText(extractedText)

      if (!cleanText) {
        const response = 'No readable text was supplied. Please capture a clearer image with strong lighting and a straight angle.'
        return {
          content: [{ type: 'text', text: response }],
          structuredContent: {
            cleanText: '',
            context,
            readAloud,
            uncertainty: true,
            guidance: 'Capture a clearer image.'
          }
        }
      }

      const uncertaintyNote = preserveUncertainty ? buildUncertaintyNote(context) : 'Uncertainty note disabled.'
      const response = readAloud
        ? `I read this as: "${cleanText}". ${uncertaintyNote}`
        : `Readable text: ${cleanText}. ${uncertaintyNote}`

      return {
        content: [{ type: 'text', text: response }],
        structuredContent: {
          cleanText,
          context,
          readAloud,
          uncertainty: preserveUncertainty,
          note: uncertaintyNote
        }
      }
    }
  )

  server.registerTool(
    'capture_guidance',
    {
      description: 'Give simple camera capture guidance for legible text while keeping photos local to the device.',
      inputSchema: z.object({
        goal: z.string().optional().default('read printed text').describe('What the user wants to read.'),
        lighting: z.string().optional().default('good').describe('Current lighting condition.'),
        device: z.enum(['phone', 'tablet', 'laptop']).optional().default('phone').describe('The capture device being used.')
      })
    },
    async ({ goal, lighting, device }) => {
      const instructions = [
        `To capture ${goal} on a ${device}, hold the camera steady and keep the text filling most of the frame.`,
        'Stand close enough that the letters are clear, and avoid glare, shadows, and skewed angles.',
        `If lighting is ${lighting}, improve it by moving to brighter light or reducing glare before taking the photo.`,
        'Keep the photo local on the device. SeeMate does not upload images to external services.'
      ]

      return {
        content: [{ type: 'text', text: instructions.join(' ') }],
        structuredContent: {
          goal,
          lighting,
          device,
          localOnly: true,
          instructions
        }
      }
    }
  )

  return server
}
