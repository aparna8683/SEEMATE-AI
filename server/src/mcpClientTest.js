import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

async function main() {
  const serverUrl = process.env.MCP_SERVER_URL || 'http://localhost:5000/mcp'

  console.log(`Connecting to MCP server at ${serverUrl}`)

  const transport = new StreamableHTTPClientTransport(serverUrl)
  const client = new Client(
    { name: 'seemate-ai-mcp-client', version: '1.0.0' },
    { capabilities: {} }
  )

  await client.connect(transport)

  const toolList = await client.listTools()
  const toolNames = toolList.tools.map(tool => tool.name)
  console.log(`Discovered tools: ${toolNames.join(', ')}`)

  const result = await client.callTool({
    name: 'format_reading_response',
    arguments: {
      extractedText: 'Take this medicine with food and water.',
      context: 'medicine label',
      readAloud: true,
      preserveUncertainty: true
    }
  })

  const text = result?.content?.[0]?.text || JSON.stringify(result)
  console.log('Tool invocation result:')
  console.log(text)

  await client.close()
}

main().catch(error => {
  console.error('MCP client test failed:', error)
  process.exit(1)
})
