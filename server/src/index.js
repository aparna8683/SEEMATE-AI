import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node'
import { createSeeMateMcpServer } from './mcpServer.js'

const app = express()
const port = Number(process.env.PORT || 5000)
const allowedOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173'

app.use(cors({ origin: allowedOrigin }))
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

app.listen(port, () => {
  console.log(`SeeMate API listening at http://localhost:${port}`)
  console.log(`MCP streamable HTTP endpoint ready at http://localhost:${port}/mcp`)
})
