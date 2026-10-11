# SeeMate AI

A voice-first accessibility prototype for blind and low-vision users. This starter includes:
- React + Vite frontend
- Camera/photo input
- OCR with Tesseract.js
- Text-to-speech using the browser Speech Synthesis API
- Express backend with a health endpoint

## Requirements
- Node.js LTS (Node 22 should work)
- npm

## Run locally

### 1. Start the backend
```bash
cd server
npm install
npm run dev
```
The API runs at `http://localhost:5000`. Test `http://localhost:5000/health`.

### 2. Start the frontend (new terminal)
```bash
cd client
npm install
npm run dev
```
Open the Vite URL shown in the terminal.

## Test on Android
For the first pass, test on the laptop. Camera access generally requires HTTPS or localhost. To test on a phone, deploy the frontend over HTTPS or use a secure development tunnel; a LAN IP alone may not grant camera permissions.

## Current limitations
- OCR and speech run in the browser.
- This is not yet connected to Alexa+ or an MCP server.
- OCR can misread blurry, angled, or low-quality text. Verify important information manually.
- Do not use this prototype to make medication or other safety-critical decisions.
