import express, { type Request, type Response } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  initDatabase,
  getOrCreateUser,
  getUser,
  deductBalance,
  refundBalance,
  addBalance,
  createJob,
  updateJob,
  getJob,
  getUserJobs,
  getPlans,
  createPayment,
} from './db.js'
import { createVideo } from './providers/video.js'
import { startBot } from './bot.js'

dotenv.config()
initDatabase()

const app = express()
app.use(cors())
app.use(express.json())

// Serve generated videos statically
const storageVideosDir = path.resolve('storage/videos')
app.use('/videos', express.static(storageVideosDir))

function resolveUserId(req: Request): string {
  const tgHeader = req.headers['x-telegram-user-id']
  if (tgHeader && typeof tgHeader === 'string' && tgHeader.trim()) {
    const rawId = tgHeader.trim()
    const userId = `tg_${rawId}`
    getOrCreateUser(userId, rawId)
    return userId
  }
  const queryUser = req.query.userId
  if (queryUser && typeof queryUser === 'string' && queryUser.trim()) {
    const rawId = queryUser.trim()
    getOrCreateUser(rawId, null)
    return rawId
  }
  getOrCreateUser('demo', null)
  return 'demo'
}

app.get('/api/health', (_req, res) => res.json({ ok: true, timestamp: Date.now() }))

app.get('/api/me', (req, res) => {
  const userId = resolveUserId(req)
  const user = getUser(userId)
  res.json(user ?? { id: userId, balance: 240 })
})

app.get('/api/plans', (_req, res) => {
  res.json(getPlans())
})

app.get('/api/jobs', (req, res) => {
  const userId = resolveUserId(req)
  const rows = getUserJobs(userId, 30)
  const jobs = rows.map((job) => ({
    id: job.id,
    prompt: job.prompt,
    status: job.status,
    videoUrl: job.video_url,
    duration: job.duration ?? '8 сек',
    aspectRatio: job.aspect_ratio ?? '16:9',
    quality: job.quality ?? '720p',
    provider: job.provider,
    date: job.created_at,
  }))
  res.json(jobs)
})

app.get('/api/jobs/:id', (req, res) => {
  const job = getJob(req.params.id)
  if (!job) return res.status(404).json({ error: 'Задача не найдена.' })
  res.json({
    id: job.id,
    prompt: job.prompt,
    status: job.status,
    videoUrl: job.video_url,
    duration: job.duration ?? '8 сек',
    aspectRatio: job.aspect_ratio ?? '16:9',
    quality: job.quality ?? '720p',
    provider: job.provider,
    date: job.created_at,
  })
})

app.post('/api/generate', async (req, res) => {
  const prompt = String(req.body?.prompt ?? '').trim()
  if (prompt.length < 3 || prompt.length > 500) {
    return res.status(400).json({ error: 'Опишите сцену минимум 3 символами.' })
  }

  const userId = resolveUserId(req)
  const user = getUser(userId) ?? getOrCreateUser(userId, null)
  const charge = 24

  if (user.balance < charge) {
    return res.status(402).json({ error: 'Недостаточно кристаллов. Пополните баланс.' })
  }

  const success = deductBalance(userId, charge)
  if (!success) {
    return res.status(402).json({ error: 'Недостаточно кристаллов. Пополните баланс.' })
  }

  const jobId = randomUUID()
  const duration = String(req.body?.duration ?? '8 сек')
  const aspectRatio = String(req.body?.aspectRatio ?? '16:9')
  const quality = String(req.body?.quality ?? '720p')

  createJob({
    id: jobId,
    userId,
    prompt,
    status: 'processing',
    duration,
    aspectRatio,
    quality,
  })

  try {
    const result = await createVideo(jobId, prompt, {
      aspectRatio,
      duration,
      quality,
    })

    updateJob(jobId, {
      status: result.status,
      videoUrl: result.videoUrl ?? null,
      provider: result.provider,
    })

    const updatedUser = getUser(userId)
    res.json({
      id: jobId,
      status: result.status,
      videoUrl: result.videoUrl,
      balance: updatedUser?.balance ?? user.balance - charge,
    })
  } catch (error) {
    console.error('Video generation error:', error)
    refundBalance(userId, charge)
    const errMessage = error instanceof Error ? error.message : 'Не удалось создать видео.'
    updateJob(jobId, {
      status: 'failed',
      errorMessage: errMessage,
    })
    res.status(502).json({ error: errMessage })
  }
})

app.post('/api/payments', (req, res) => {
  const userId = resolveUserId(req)
  const planId = String(req.body?.planId ?? '')
  const provider = String(req.body?.provider ?? 'demo') as 'demo' | 'sbp' | 'crypto' | 'stars'

  if (!['sbp', 'crypto', 'demo', 'stars'].includes(provider)) {
    return res.status(400).json({ error: 'Неверный способ оплаты.' })
  }

  const plans = getPlans()
  const plan = plans.find((p) => p.id === planId)
  if (!plan) return res.status(404).json({ error: 'Тариф не найден.' })

  const paymentId = randomUUID()
  if (provider === 'demo') {
    const newBalance = addBalance(userId, plan.crystals)
    createPayment({
      id: paymentId,
      userId,
      planId: plan.id,
      provider: 'demo',
      amount: plan.price_rub,
      currency: 'RUB',
      status: 'paid',
    })
    return res.status(201).json({
      id: paymentId,
      provider: 'demo',
      status: 'paid',
      crystals: plan.crystals,
      newBalance,
    })
  }

  createPayment({
    id: paymentId,
    userId,
    planId: plan.id,
    provider,
    amount: plan.price_rub,
    currency: 'RUB',
    status: 'pending',
  })

  res.status(201).json({ id: paymentId, provider, status: 'pending' })
})

// Serve compiled React frontend in production / standalone mode
const distDir = path.resolve('dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/videos')) {
      return res.sendFile(path.join(distDir, 'index.html'))
    }
    next()
  })
}

const port = Number(process.env.PORT || process.env.API_PORT || 3001)
app.listen(port, '0.0.0.0', () => {
  console.log(`Prism unified server running on http://0.0.0.0:${port}`)
  if (process.env.START_BOT !== 'false') {
    startBot()
  }
})
