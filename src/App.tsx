import { useEffect, useMemo, useState } from 'react'
import {
  ArrowUpRight,
  Check,
  Clapperboard,
  Coins,
  Download,
  Copy,
  Moon,
  Play,
  RotateCcw,
  Share2,
  Sparkles,
  Sun,
  WandSparkles,
  X,
} from 'lucide-react'
import './styles.css'

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void
        expand: () => void
        colorScheme?: 'light' | 'dark'
        initDataUnsafe?: {
          user?: {
            id: number
            first_name?: string
            username?: string
          }
        }
        HapticFeedback?: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void
        }
        openTelegramLink?: (url: string) => void
      }
    }
  }
}

type Job = {
  id: string
  prompt: string
  status: 'completed' | 'processing' | 'failed'
  date: string
  duration: string
  aspectRatio?: string
  quality?: string
  videoUrl?: string
  provider?: string
}

type Option = { label: string; value: string }

const PROMPT_SUGGESTIONS = [
  '🌌 Неоновый киберпанк город под дождём',
  '🦊 Лиса в заснеженном лесу на рассвете',
  '🌊 Бирюзовые волны океана на закате',
  '🚀 Космический корабль сквозь звёздную туманность',
  '🏎️ Ретро-спорткар на ночной автостраде',
]

const API_BASE = import.meta.env.VITE_API_URL ?? ''

function getTelegramUserId(): string | null {
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user
  return tgUser?.id ? String(tgUser.id) : null
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const tgId = getTelegramUserId()
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(init?.headers as Record<string, string>),
  }
  if (tgId) {
    headers['x-telegram-user-id'] = tgId
  }

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? `Ошибка API ${response.status}`)
  return data as T
}

function App() {
  const [dark, setDark] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [jobs, setJobs] = useState<Job[]>([])
  const [balance, setBalance] = useState(240)
  const [generating, setGenerating] = useState(false)
  const [showPlans, setShowPlans] = useState(false)
  const [toast, setToast] = useState('')
  const [format, setFormat] = useState<Option>({ label: 'Формат', value: '16:9' })
  const [length, setLength] = useState<Option>({ label: 'Длина', value: '4 сек' })
  const [quality, setQuality] = useState<Option>({ label: 'Качество', value: '720p' })
  const [previewJob, setPreviewJob] = useState<Job | null>(null)

  // Initialize Telegram WebApp and fetch initial state
  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (tg) {
      tg.ready()
      tg.expand()
      if (tg.colorScheme === 'dark') {
        setDark(true)
      }
    }

    void api<{ balance: number }>('/api/me')
      .then((me) => setBalance(me.balance))
      .catch(() => undefined)

    void api<Job[]>('/api/jobs')
      .then((remote) => {
        if (remote && remote.length) {
          setJobs(
            remote.map((job) => ({
              ...job,
              date: job.date ? formatTime(job.date) : 'Недавно',
              duration: job.duration ?? '4 сек',
            })),
          )
        }
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])

  function formatTime(isoStr: string) {
    try {
      const d = new Date(isoStr)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return 'Недавно'
    }
  }

  function triggerHaptic(type: 'click' | 'success' | 'error') {
    const tg = window.Telegram?.WebApp?.HapticFeedback
    if (!tg) return
    if (type === 'click') tg.impactOccurred('light')
    else if (type === 'success') tg.notificationOccurred('success')
    else if (type === 'error') tg.notificationOccurred('error')
  }

  const canGenerate = prompt.trim().length >= 3 && balance >= 24 && !generating
  const completedCount = useMemo(() => jobs.filter((job) => job.status === 'completed').length, [jobs])

  const cycle = (current: string, values: string[], setter: (value: Option) => void, label: string) => {
    triggerHaptic('click')
    const next = values[(values.indexOf(current) + 1) % values.length]
    setter({ label, value: next })
  }

  async function createVideo() {
    if (!canGenerate) return
    triggerHaptic('click')
    const submittedPrompt = prompt.trim()
    setGenerating(true)
    setToast('🎨 Синтезируем сцену и генерируем видео…')

    try {
      const result = await api<{ id: string; status: Job['status']; videoUrl?: string; balance: number }>(
        '/api/generate',
        {
          method: 'POST',
          body: JSON.stringify({
            prompt: submittedPrompt,
            aspectRatio: format.value,
            duration: length.value,
            quality: quality.value,
          }),
        },
      )

      triggerHaptic('success')
      setBalance(result.balance)
      setPrompt('')

      const newJob: Job = {
        id: result.id,
        prompt: submittedPrompt,
        status: result.status,
        date: 'Только что',
        duration: length.value,
        aspectRatio: format.value,
        quality: quality.value,
        videoUrl: result.videoUrl,
      }

      setJobs((items) => [newJob, ...items])
      setToast('🎉 Видео готово!')
      setPreviewJob(newJob)
    } catch (error) {
      triggerHaptic('error')
      setToast(error instanceof Error ? error.message : 'Не удалось создать видео')
    } finally {
      setGenerating(false)
    }
  }

  async function choosePlan(name: string, crystals: number, planId: string) {
    triggerHaptic('click')
    try {
      const res = await api<{ newBalance: number }>('/api/payments', {
        method: 'POST',
        body: JSON.stringify({ planId, provider: 'demo' }),
      })
      triggerHaptic('success')
      setBalance(res.newBalance ?? balance + crystals)
      setShowPlans(false)
      setToast(`💎 ${name}: начислено +${crystals} кристаллов!`)
    } catch {
      triggerHaptic('error')
      setToast('Пополнение временно недоступно')
    }
  }

  function copyVideoLink(url?: string) {
    if (!url) return
    triggerHaptic('click')
    const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`
    void navigator.clipboard.writeText(fullUrl).then(() => {
      setToast('🔗 Ссылка на видео скопирована в буфер!')
    })
  }

  function shareInTelegram(job: Job) {
    triggerHaptic('click')
    const fullUrl = job.videoUrl?.startsWith('http') ? job.videoUrl : `${window.location.origin}${job.videoUrl}`
    const shareText = encodeURIComponent(`Смотри, какое видео я сгенерировал в Prism: "${job.prompt}"\n${fullUrl}`)
    const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(fullUrl)}&text=${shareText}`
    if (window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(tgUrl)
    } else {
      window.open(tgUrl, '_blank')
    }
  }

  function remixPrompt(text: string) {
    triggerHaptic('click')
    setPrompt(text)
    setPreviewJob(null)
    window.scrollTo({ top: 120, behavior: 'smooth' })
    setToast('📝 Промпт загружен в редактор')
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Sparkles size={15} />
          </span>
          <span>prism</span>
        </div>
        <div className="top-actions">
          <button className="balance-pill" onClick={() => setShowPlans(true)}>
            <Coins size={15} />
            <span>{balance}</span>
          </button>
          <button
            className="icon-button"
            onClick={() => {
              triggerHaptic('click')
              setDark((value) => !value)
            }}
            aria-label="Переключить тему"
          >
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </header>

      <section className="hero">
        <p className="eyebrow">Создание видео нейросетью</p>
        <h1>
          Сделайте идею
          <br />
          <em>видимой.</em>
        </h1>
        <p className="hero-copy">Опишите сцену — Prism превратит её в короткий кинематографичный MP4-ролик.</p>
      </section>

      <section className="composer" aria-label="Создание видео">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Например: неоновый спорткар мчится по ночному дождливому городу, отражения неоновых вывесок в мокром асфальте…"
          maxLength={500}
        />
        <div className="composer-footer">
          <span>{prompt.length} / 500</span>
          <span className="hint">
            <WandSparkles size={14} /> Опишите движение камеры, объект и свет
          </span>
        </div>
      </section>

      {/* Quick Prompt Ideas */}
      <section className="prompt-chips">
        {PROMPT_SUGGESTIONS.map((preset) => (
          <button
            key={preset}
            type="button"
            className="prompt-chip"
            onClick={() => {
              triggerHaptic('click')
              setPrompt(preset)
            }}
          >
            {preset}
          </button>
        ))}
      </section>

      <section className="settings-row">
        <button onClick={() => cycle(format.value, ['16:9', '9:16', '1:1'], setFormat, 'Формат')}>
          <span>{format.label}</span>
          <strong>{format.value}</strong>
        </button>
        <button onClick={() => cycle(length.value, ['4 сек', '8 сек'], setLength, 'Длина')}>
          <span>{length.label}</span>
          <strong>{length.value}</strong>
        </button>
        <button onClick={() => cycle(quality.value, ['480p', '720p'], setQuality, 'Качество')}>
          <span>{quality.label}</span>
          <strong>{quality.value}</strong>
        </button>
      </section>

      <section className="recent">
        <div className="section-heading">
          <h2>Созданные видео</h2>
          <span>{completedCount} готово</span>
        </div>
        <div className="job-list">
          {jobs.length === 0 ? (
            <div className="empty-state">
              <Clapperboard size={32} />
              <p>Здесь появятся ваши сгенерированные видео</p>
            </div>
          ) : (
            jobs.map((job) => (
              <article
                className={`job ${job.status}`}
                key={job.id}
                onClick={() => {
                  if (job.status === 'completed' && job.videoUrl) {
                    triggerHaptic('click')
                    setPreviewJob(job)
                  }
                }}
              >
                <div className={`job-thumb ${job.status}`}>
                  {job.status === 'completed' && job.videoUrl ? (
                    <button
                      className="play"
                      onClick={(e) => {
                        e.stopPropagation()
                        triggerHaptic('click')
                        setPreviewJob(job)
                      }}
                    >
                      <Play size={13} fill="currentColor" />
                    </button>
                  ) : (
                    <Clapperboard size={20} />
                  )}
                </div>
                <div className="job-info">
                  <p>{job.prompt}</p>
                  <span>
                    {job.date} · {job.duration}
                  </span>
                </div>
                <div className={`status ${job.status}`}>
                  {job.status === 'completed' ? (
                    <>
                      <Check size={13} /> Готово
                    </>
                  ) : job.status === 'failed' ? (
                    'Ошибка'
                  ) : (
                    'Рендеринг'
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <footer className="create-bar">
        <div>
          <span>Стоимость видео</span>
          <strong>
            <Coins size={17} />24
          </strong>
        </div>
        <button className="create-button" disabled={!canGenerate} onClick={() => void createVideo()}>
          {generating ? 'Генерируем MP4…' : 'Создать видео'}
          <ArrowUpRight size={17} />
        </button>
      </footer>

      {/* Plans Modal */}
      {showPlans && (
        <div className="modal-backdrop" onClick={() => setShowPlans(false)}>
          <div className="plans-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Баланс</p>
                <h2>Пополнить кристаллы</h2>
              </div>
              <button className="icon-button" onClick={() => setShowPlans(false)}>
                <X size={17} />
              </button>
            </div>
            <div className="plans">
              {[
                ['Старт', 120, '₽ 199', 'starter'],
                ['Поток', 480, '₽ 599', 'flow'],
                ['Студия', 1200, '₽ 1 299', 'studio'],
              ].map(([name, amount, price, id]) => (
                <button
                  className="plan"
                  key={String(name)}
                  onClick={() => void choosePlan(String(name), Number(amount), String(id))}
                >
                  <span>
                    <strong>{name}</strong>
                    <small>{amount} кристаллов</small>
                  </span>
                  <b>{price}</b>
                </button>
              ))}
            </div>
            <p className="payment-note">Демо-пополнение: нажмите на любой тариф для моментального начисления кристаллов.</p>
          </div>
        </div>
      )}

      {/* Video Player & Actions Modal */}
      {previewJob && previewJob.videoUrl && (
        <div className="modal-backdrop" onClick={() => setPreviewJob(null)}>
          <div className="video-modal" onClick={(event) => event.stopPropagation()}>
            <button className="icon-button close-video" onClick={() => setPreviewJob(null)}>
              <X size={17} />
            </button>
            <video src={previewJob.videoUrl} controls autoPlay loop playsInline />
            <div className="video-modal-info">
              <p className="video-modal-prompt">«{previewJob.prompt}»</p>
              <div className="video-modal-actions">
                <a
                  href={previewJob.videoUrl}
                  download={`prism_${previewJob.id}.mp4`}
                  className="action-btn download-btn"
                  onClick={() => triggerHaptic('click')}
                >
                  <Download size={15} />
                  <span>Скачать MP4</span>
                </a>
                <button
                  type="button"
                  className="action-btn"
                  onClick={() => copyVideoLink(previewJob.videoUrl)}
                >
                  <Copy size={15} />
                  <span>Ссылка</span>
                </button>
                <button
                  type="button"
                  className="action-btn"
                  onClick={() => shareInTelegram(previewJob)}
                >
                  <Share2 size={15} />
                  <span>Поделиться</span>
                </button>
                <button
                  type="button"
                  className="action-btn"
                  onClick={() => remixPrompt(previewJob.prompt)}
                >
                  <RotateCcw size={15} />
                  <span>Повторить</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" onAnimationEnd={() => setToast('')}>
          {toast}
        </div>
      )}
    </main>
  )
}

export default App
