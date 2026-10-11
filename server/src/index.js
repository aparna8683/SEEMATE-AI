import 'dotenv/config'
import express from 'express'
import cors from 'cors'

const app = express()
const port = Number(process.env.PORT || 5000)
const allowedOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173'

app.use(cors({ origin: allowedOrigin }))
app.use(express.json({ limit: '1mb' }))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'seemate-ai-api' })
})

app.listen(port, () => {
  console.log(`SeeMate API listening at http://localhost:${port}`)
})
