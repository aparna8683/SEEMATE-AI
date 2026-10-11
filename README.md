# SeeMate AI

A voice-first accessibility prototype for blind and low-vision users. This starter includes:
- React + Vite frontend
- Camera/photo input
- Browser-side OCR with Tesseract.js and a PaddleOCR evaluation path
- Text-to-speech using the browser Speech Synthesis API
- Express backend with a health endpoint and a real MCP streamable HTTP server

## Requirements
- Node.js LTS (Node 22 should work)
- npm

## Architecture
- Frontend: browser-only OCR, camera access, speech output, and photo preview remain in the Vite app under `client/src`.
- Backend: Express remains for normal REST health checks under `server/src/index.js`.
- MCP server: a real streamable HTTP MCP endpoint is mounted at `/mcp` using the official `@modelcontextprotocol/server` and `@modelcontextprotocol/node` packages.
- Tools: `format_reading_response` converts OCR text into a cleaner, accessible reading response while preserving uncertainty; `capture_guidance` gives capture instructions without sending private photos anywhere.
- Local privacy: OCR stays in the browser and photos remain on-device. The backend MCP service does not receive image files.

## Run locally

### 1. Start the backend
```bash
cd server
npm install
npm run dev
```
The API runs at `http://localhost:5000`.
- Health check: `http://localhost:5000/health`
- MCP endpoint: `http://localhost:5000/mcp`
- MCP health metadata: `http://localhost:5000/mcp/health`

### 2. Start the frontend (new terminal)
```bash
cd client
npm install
npm run dev
```
Open the Vite URL shown in the terminal.

## MCP testing

Use the official MCP client SDK to verify tool discovery and tool invocation over the streamable HTTP transport:

```bash
cd server
npm run test:mcp
```

This client connects to `http://localhost:5000/mcp`, lists tools, and calls `format_reading_response` using the official SDK. A successful run should show at least the discovered tool names and the tool result text.

## Test on Android
For the first pass, test on the laptop. Camera access generally requires HTTPS or localhost. To test on a phone, deploy the frontend over HTTPS or use a secure development tunnel; a LAN IP alone may not grant camera permissions.

## Current limitations
- OCR and speech still run in the browser.
- This prototype does not upload photos or OCR results to outside services.
- OCR can misread blurry, angled, or low-quality text. Verify important information manually.
- The MCP server is intentionally small and local; it is not a public hosted service and does not include authentication or external integrations.
- Do not use this prototype to make medication or other safety-critical decisions.
