import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node'
import { createSeeMateMcpServer } from './mcpServer.js'

function extractMcpText(result) {
  const content = Array.isArray(result?.content) ? result.content : []
  const textItem = content.find(item => item && typeof item.text === 'string' && item.text.trim())

  if (textItem) {
    return textItem.text.trim()
  }

  const structured = result?.structuredContent
  if (structured && typeof structured.cleanText === 'string' && structured.cleanText.trim()) {
    return structured.cleanText.trim()
  }

  if (structured && typeof structured.note === 'string' && structured.note.trim()) {
    return structured.note.trim()
  }

  return ''
}

async function invokeFormatReadingResponse({ extractedText, context = '', readAloud = true, preserveUncertainty = true }) {
  const serverUrl = process.env.MCP_SERVER_URL || 'http://127.0.0.1:5000/mcp'
  const transport = new StreamableHTTPClientTransport(new URL(serverUrl))
  const client = new Client(
    { name: 'seemate-ai-app-client', version: '1.0.0' },
    { capabilities: {} }
  )

  try {
    await client.connect(transport)
    const result = await client.callTool({
      name: 'format_reading_response',
      arguments: {
        extractedText,
        context,
        readAloud,
        preserveUncertainty
      }
    })

    const text = extractMcpText(result)
    if (!text) {
      console.error('MCP tool returned no readable text payload.', JSON.stringify(result))
      throw new Error('The MCP tool returned no readable text.')
    }

    return text
  } catch (error) {
    console.error('MCP tool invocation failed:', error)
    throw new Error(error?.message || 'The reading service failed.')
  } finally {
    await Promise.allSettled([client.close(), transport.close()])
  }
}

export function createApp() {
  const app = express()
  const prodOrigin = 'https://seemate-ai.vercel.app'
  const previewOrigin = 'https://seemate-rjpbavylm-aparnas-projects-ab6e250b.vercel.app'
  const defaultOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173', previewOrigin, prodOrigin]
  const configuredOrigins = (process.env.CLIENT_ORIGIN || process.env.CLIENT_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)

  const allowedOrigins = [...new Set([...defaultOrigins, ...configuredOrigins])]
  const corsOptions = {
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true)
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true)
      }

      return callback(new Error(`Origin not allowed by CORS: ${origin}`))
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204
  }

  app.use(cors(corsOptions))
  app.options('*', cors(corsOptions))
  app.use(express.json({ limit: '1mb' }))

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'seemate-ai-api' })
  })

  app.get('/mcp/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'seemate-ai-mcp',
      transport: 'streamable-http',
      tools: ['format_reading_response', 'capture_guidance']
    })
  })

  app.all('/mcp', async (req, res) => {
    const server = createSeeMateMcpServer()
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined })

    try {
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (error) {
      console.error('MCP request failed:', error)

      if (!res.headersSent) {
        res.status(500).json({
          error: 'MCP request failed',
          message: error.message || 'Unknown error'
        })
      }
    } finally {
      await Promise.allSettled([server.close(), transport.close()])
    }
  })

  app.post('/api/read-text', async (req, res) => {
    const { extractedText = '', context = 'selected photo', readAloud = true, preserveUncertainty = true } = req.body ?? {}
    const cleanText = String(extractedText ?? '').replace(/\s+/g, ' ').trim()

    if (!cleanText) {
      return res.status(400).json({
        error: 'No extracted text was supplied for the MCP reading service.'
      })
    }

    try {
      const reading = await invokeFormatReadingResponse({
        extractedText: cleanText,
        context,
        readAloud,
        preserveUncertainty
      })

      return res.json({
        ok: true,
        reading,
        source: 'mcp',
        context,
        readAloud,
        preserveUncertainty
      })
    } catch (error) {
      return res.status(502).json({
        error: 'The MCP reading service failed.',
        message: error.message || 'Unknown MCP error.'
      })
    }
  })

  return app
}

const app = createApp()
const port = Number(process.env.PORT || 5000)

if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  app.listen(port, '0.0.0.0', () => {
    console.log(`SeeMate API listening at http://0.0.0.0:${port}`)
    console.log(`MCP streamable HTTP endpoint ready at http://0.0.0.0:${port}/mcp`)
  })
}

export { app, invokeFormatReadingResponse }
