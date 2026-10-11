import assert from 'node:assert/strict'
import { createApp } from './index.js'

async function main() {
  const app = createApp()
  const server = app.listen(0)
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0

  const previousUrl = process.env.MCP_SERVER_URL
  process.env.MCP_SERVER_URL = `http://127.0.0.1:${port}/mcp`

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/read-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        extractedText: 'Take this medicine with food and water.',
        context: 'medicine label',
        readAloud: true,
        preserveUncertainty: true
      })
    })

    const payload = await response.json()

    assert.equal(response.status, 200, `Expected 200 but got ${response.status}: ${JSON.stringify(payload)}`)
    assert.equal(payload.source, 'mcp')
    assert.equal(typeof payload.reading, 'string')
    assert.match(payload.reading, /I read this as:/i)
    assert.match(payload.reading, /Take this medicine with food and water\./i)

    console.log('Integration test passed:', payload.reading)
  } finally {
    await new Promise((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()))
    })

    if (previousUrl === undefined) {
      delete process.env.MCP_SERVER_URL
    } else {
      process.env.MCP_SERVER_URL = previousUrl
    }
  }
}

main().catch(error => {
  console.error('Application MCP integration test failed:', error)
  process.exit(1)
})
