import { useEffect, useMemo, useState } from 'react'
import {
  ArrowUpRight,
  BarChart3,
  Bell,
  Check,
  Clapperboard,
  Coins,
  Copy,
  Download,
  FolderArchive,
  Gem,
  Heart,
  HelpCircle,
  Home,
  Moon,
  Palette,
  Play,
  Plus,
  RotateCcw,
  Share2,
  Sparkles,
  Sun,
  Trophy,
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
  type?: 'image' | 'video'
  date: string
  duration?: string
  aspectRatio?: string
  quality?: string
  videoUrl?: string
  imageUrl?: string
  provider?: string
}

type Option = { label: string; value: string }

export type ModelOption = {
  id: string
  name: string
  provider: string
  badge: string
  description: string
}

export const VIDEO_MODELS: ModelOption[] = [
  {
    id: 'cinema-fast',
    name: 'Prism Cinema HD',
    provider: 'Prism Engine + GPT-4o',
    badge: '100% Без водяных знаков',
    description: 'Кинематографичная генерация 25 FPS через GPT-Image без задержек и водяных знаков',
  },
  {
    id: 'kleo-video',
    name: 'Kleo Studio (Seedance / Kling)',
    provider: 'Kleo AI',
    badge: 'Ключ подключен',
    description: 'Генерация кинематографичного видео через Kleo AI (Seedance 2.5 / Kling)',
  },
]

const PROMPT_SUGGESTIONS_IMAGE = [
  '🏎️ Неоновый спорткар под дождём',
  '🦊 Лиса в заснеженном лесу на рассвете',
  '🌌 Киберпанк мегаполис будущего',
  '🌊 Океанский прибой на закате',
  '🪐 Космонавт на неизведанной планете',
]

const PROMPT_SUGGESTIONS_VIDEO = [
  '🌌 Неоновый киберпанк город под дождём, пролёт камеры',
  '🏎️ Ретро-спорткар на ночной автостраде 4k',
  '🌊 Бирюзовые волны океана разбиваются о скалы',
  '🚀 Космический корабль сквозь звёздную туманность',
  '🦅 Парящий орёл над заснеженными вершинами гор',
]

const API_BASE = import.meta.env.VITE_API_URL ?? ''

function getTelegramUser(): { id: string | null; name: string; initial: string } {
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user
  if (tgUser) {
    const name = tgUser.first_name || tgUser.username || 'Пользователь'
    return {
      id: String(tgUser.id),
      name,
      initial: name.charAt(0).toUpperCase() || 'P',
    }
  }
  return { id: null, name: 'Гость', initial: 'P' }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const { id: tgId } = getTelegramUser()
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

export default function App() {
  const [dark, setDark] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [jobs, setJobs] = useState<Job[]>([])
  const [balance, setBalance] = useState(240)
  const [generating, setGenerating] = useState(false)
  const [showPlans, setShowPlans] = useState(false)
  const [showModelsModal, setShowModelsModal] = useState(false)
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [model, setModel] = useState('cinema-fast')
  const [mode, setMode] = useState<'image' | 'video'>('image')
  const [enhancing, setEnhancing] = useState(false)
  const [toast, setToast] = useState('')
  const [format, setFormat] = useState<Option>({ label: 'Формат', value: '1:1' })
  const [length, setLength] = useState<Option>({ label: 'Длина', value: '4 сек' })
  const [quality, setQuality] = useState<Option>({ label: 'Качество', value: '720p' })
  const [previewJob, setPreviewJob] = useState<Job | null>(null)
  const [previewImage, setPreviewImage] = useState<Job | null>(null)
  const [likedFeatured, setLikedFeatured] = useState(false)
  const [likeCount, setLikeCount] = useState(24)

  const user = useMemo(() => getTelegramUser(), [])

  // Initialize Telegram WebApp and fetch profile state
  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (tg) {
      tg.ready()
      tg.expand()
      if (tg.colorScheme === 'dark') {
        setDark(true)
      }
    }

    void api<{ balance: number; selectedModel?: string; currentMode?: 'image' | 'video' }>('/api/me')
      .then((me) => {
        setBalance(me.balance)
        if (me.selectedModel) setModel(me.selectedModel)
        if (me.currentMode) setMode(me.currentMode)
      })
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

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => {
      setToast((cur) => (cur === msg ? '' : cur))
    }, 3500)
  }

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

  function switchMode(newMode: 'image' | 'video') {
    triggerHaptic('click')
    setMode(newMode)
    setFormat(newMode === 'image' ? { label: 'Формат', value: '1:1' } : { label: 'Формат', value: '16:9' })
    showToast(newMode === 'image' ? '🎨 Режим: Картинки (GPT-Image 2)' : '🎬 Режим: Видео (Prism Cinema HD)')
    void api('/api/user/mode', {
      method: 'POST',
      body: JSON.stringify({ mode: newMode }),
    }).catch(() => undefined)
  }

  const requiredBalance = mode === 'image' ? 12 : 24
  const canGenerate = prompt.trim().length >= 2 && balance >= requiredBalance && !generating
  const completedCount = useMemo(() => jobs.filter((job) => job.status === 'completed').length, [jobs])

  // Featured Item: take the latest completed job or a fallback
  const featuredItem = useMemo(() => {
    return jobs.find((j) => j.status === 'completed' && (j.imageUrl || j.videoUrl)) || null
  }, [jobs])

  const cycle = (current: string, values: string[], setter: (value: Option) => void, label: string) => {
    triggerHaptic('click')
    const next = values[(values.indexOf(current) + 1) % values.length]
    setter({ label, value: next })
  }

  function selectModel(modelId: string) {
    triggerHaptic('click')
    setModel(modelId)
    setShowModelsModal(false)
    const m = VIDEO_MODELS.find((item) => item.id === modelId)
    showToast(`✨ Выбрана нейросеть: ${m?.name ?? modelId}`)
    void api('/api/user/model', {
      method: 'POST',
      body: JSON.stringify({ model: modelId }),
    }).catch(() => undefined)
  }

  async function enhancePrompt() {
    if (prompt.trim().length < 2 || enhancing) return
    triggerHaptic('click')
    setEnhancing(true)
    showToast('🧠 GPT режиссирует сцену и улучшает промпт…')
    try {
      const res = await api<{ enhanced: string }>('/api/enhance-prompt', {
        method: 'POST',
        body: JSON.stringify({ prompt: prompt.trim() }),
      })
      if (res.enhanced) {
        setPrompt(res.enhanced)
        triggerHaptic('success')
        showToast('✨ Промпт улучшен GPT!')
      }
    } catch {
      triggerHaptic('error')
      showToast('Не удалось улучшить промпт')
    } finally {
      setEnhancing(false)
    }
  }

  async function createMedia() {
    if (!canGenerate) return
    triggerHaptic('click')
    const submittedPrompt = prompt.trim()
    setGenerating(true)
    showToast(mode === 'image' ? '🎨 GPT-Image создаёт изображение…' : '🎬 Синтезируем сцену и генерируем видео…')

    try {
      if (mode === 'image') {
        const result = await api<{ id: string; status: Job['status']; imageUrl?: string; balance: number }>(
          '/api/generate-image',
          {
            method: 'POST',
            body: JSON.stringify({
              prompt: submittedPrompt,
              aspectRatio: format.value,
            }),
          },
        )
        triggerHaptic('success')
        setBalance(result.balance)
        setPrompt('')
        const newJob: Job = {
          id: result.id,
          prompt: submittedPrompt,
          type: 'image',
          status: result.status,
          date: 'Только что',
          aspectRatio: format.value,
          imageUrl: result.imageUrl,
        }
        setJobs((items) => [newJob, ...items])
        showToast('🎉 Изображение готово!')
        setPreviewImage(newJob)
      } else {
        const result = await api<{ id: string; status: Job['status']; videoUrl?: string; balance: number }>(
          '/api/generate',
          {
            method: 'POST',
            body: JSON.stringify({
              prompt: submittedPrompt,
              aspectRatio: format.value,
              duration: length.value,
              quality: quality.value,
              model,
            }),
          },
        )
        triggerHaptic('success')
        setBalance(result.balance)
        setPrompt('')
        const newJob: Job = {
          id: result.id,
          prompt: submittedPrompt,
          type: 'video',
          status: result.status,
          date: 'Только что',
          duration: length.value,
          aspectRatio: format.value,
          quality: quality.value,
          videoUrl: result.videoUrl,
        }
        setJobs((items) => [newJob, ...items])
        showToast('🎉 Видео готово!')
        setPreviewJob(newJob)
      }
    } catch (error) {
      triggerHaptic('error')
      showToast(error instanceof Error ? error.message : 'Не удалось создать контент')
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
      showToast(`💎 ${name}: начислено +${crystals} кристаллов!`)
    } catch {
      triggerHaptic('error')
      showToast('Пополнение временно недоступно')
    }
  }

  function toggleLike() {
    triggerHaptic('click')
    setLikedFeatured((prev) => {
      const next = !prev
      setLikeCount((c) => (next ? c + 1 : c - 1))
      return next
    })
  }

  function remixPrompt(text: string) {
    triggerHaptic('click')
    setPrompt(text)
    setPreviewJob(null)
    setPreviewImage(null)
    window.scrollTo({ top: 180, behavior: 'smooth' })
    showToast('📝 Промпт загружен в студию')
  }

  function scrollToSection(id: string) {
    triggerHaptic('click')
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="app-container">
      {/* TOAST NOTIFICATION */}
      {toast && (
        <div className="toast-bar">
          <Sparkles size={15} />
          <span>{toast}</span>
        </div>
      )}

      {/* TOPBAR FLOATING PILL */}
      <header className="topbar-pill">
        <div className="brand-wrapper">
          <span className="brand-text">Призм AI</span>
          <span className="brand-badge">PRO</span>
        </div>

        <div className="top-controls">
          <button className="balance-pill-badge" onClick={() => setShowPlans(true)} title="Баланс кристаллов">
            <span>💎</span>
            <span>{balance}</span>
          </button>

          <button
            className="icon-btn-round plus"
            onClick={() => {
              triggerHaptic('click')
              setShowPlans(true)
            }}
            title="Пополнить кристаллы"
          >
            <Plus size={16} />
          </button>

          <button
            className="icon-btn-round"
            onClick={() => {
              triggerHaptic('click')
              setShowHelpModal(true)
            }}
            title="Справка и подсказки"
          >
            <Bell size={16} />
          </button>

          <button
            className="icon-btn-round"
            onClick={() => {
              triggerHaptic('click')
              setDark((d) => !d)
            }}
            title="Переключить тему"
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <div className="user-avatar-gradient" title={user.name}>
            <span>{user.initial}</span>
          </div>
        </div>
      </header>

      {/* QUICK CATEGORIES (ROW OF CIRCLES) */}
      <section className="quick-categories" aria-label="Быстрые разделы">
        <button
          type="button"
          className={`cat-item ${mode === 'image' ? 'active' : ''}`}
          onClick={() => switchMode('image')}
        >
          <div className="cat-circle">
            <Palette size={22} />
          </div>
          <span className="cat-label">Картинка</span>
        </button>

        <button
          type="button"
          className={`cat-item ${mode === 'video' ? 'active' : ''}`}
          onClick={() => switchMode('video')}
        >
          <div className="cat-circle">
            <Clapperboard size={22} />
          </div>
          <span className="cat-label">Видео</span>
        </button>

        <button
          type="button"
          className="cat-item"
          onClick={() => {
            if (prompt.trim().length >= 2) {
              void enhancePrompt()
            } else {
              setPrompt('Неоновый спорткар в ночном мегаполисе будущего')
              showToast('✨ Промпт подставлен! Нажмите ещё раз для GPT-режиссуры')
            }
          }}
        >
          <div className="cat-circle">
            <WandSparkles size={22} />
          </div>
          <span className="cat-label">Режиссёр</span>
        </button>

        <button type="button" className="cat-item" onClick={() => scrollToSection('history-section')}>
          <div className="cat-circle">
            <FolderArchive size={22} />
          </div>
          <span className="cat-label">Галерея</span>
        </button>

        <button
          type="button"
          className="cat-item"
          onClick={() => {
            triggerHaptic('click')
            setShowPlans(true)
          }}
        >
          <div className="cat-circle">
            <Gem size={22} />
          </div>
          <span className="cat-label">Тарифы</span>
        </button>
      </section>

      {/* FEATURED CARD ("ШЕДЕВР ДНЯ") */}
      <section className="featured-card">
        <div className="featured-top">
          <span className="featured-tag">ШЕДЕВР ДНЯ</span>
          <div className="featured-top-right">
            <span className="stake-badge">
              Ставка: {balance} 💎
            </span>
            <div className="equalizer" title="Тренды генераций">
              <span className="eq-bar"></span>
              <span className="eq-bar"></span>
              <span className="eq-bar"></span>
              <span className="eq-bar"></span>
            </div>
          </div>
        </div>

        <div className="featured-main">
          <div className="featured-thumb">
            {featuredItem?.imageUrl ? (
              <img src={featuredItem.imageUrl} alt={featuredItem.prompt} />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  background: 'linear-gradient(135deg, #a78bfa 0%, #818cf8 100%)',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#fff',
                }}
              >
                <Sparkles size={28} />
              </div>
            )}
          </div>

          <div className="featured-info">
            <h4 className="featured-title">
              {featuredItem ? featuredItem.prompt.slice(0, 34) + (featuredItem.prompt.length > 34 ? '…' : '') : '18.10 Киберпанк'}
            </h4>
            <p className="featured-sub">
              {featuredItem ? 'Prism AI · GPT Студия' : 'ДенКас · Prism Studio'}
            </p>
          </div>

          <button
            className="big-purple-play"
            onClick={() => {
              triggerHaptic('click')
              if (featuredItem) {
                if (featuredItem.imageUrl) setPreviewImage(featuredItem)
                else if (featuredItem.videoUrl) setPreviewJob(featuredItem)
              } else {
                showToast('✨ Запустите создание своего первого шедевра ниже!')
              }
            }}
            title="Смотреть шедевр"
          >
            <Play size={20} fill="currentColor" />
          </button>
        </div>

        <div className="featured-actions">
          <button
            className="action-pill-btn"
            onClick={() =>
              remixPrompt(
                featuredItem
                  ? featuredItem.prompt
                  : 'Неоновый киберпанк спорткар мчится по ночному дождливому Токио, отражения неоновых вывесок, 4k фотореализм',
              )
            }
          >
            <Trophy size={15} />
            <span>Поставить мою работу</span>
          </button>

          <button className={`like-pill-btn ${likedFeatured ? 'liked' : ''}`} onClick={toggleLike}>
            <Heart size={15} fill={likedFeatured ? 'currentColor' : 'none'} />
            <span>{likeCount}</span>
          </button>
        </div>
      </section>

      {/* CREATION STUDIO ("ПРИЗМ AI") */}
      <div className="section-tag-heading">ПРИЗМ AI</div>

      <section className="studio-card" id="studio-section">
        {/* Mode Segmented Switcher */}
        <div className="mode-segmented-pill">
          <button
            type="button"
            className={`segment-btn ${mode === 'image' ? 'active' : ''}`}
            onClick={() => switchMode('image')}
          >
            <Palette size={15} />
            <span>Картинка (GPT-Image)</span>
          </button>
          <button
            type="button"
            className={`segment-btn ${mode === 'video' ? 'active' : ''}`}
            onClick={() => switchMode('video')}
          >
            <Clapperboard size={15} />
            <span>Видео (Cinema HD)</span>
          </button>
        </div>

        {/* Prompt Input & Enhance Button */}
        <div className="prompt-field-wrap">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              mode === 'image'
                ? 'Опишите изображение (например: лиса в заснеженном лесу на рассвете, мягкий утренний свет, 4k)…'
                : 'Опишите сцену (например: неоновый спорткар на ночной трассе, плавный наезд камеры, киносвет)…'
            }
            maxLength={500}
          />

          <button
            type="button"
            className="director-enhance-btn"
            disabled={prompt.trim().length < 2 || enhancing}
            onClick={() => void enhancePrompt()}
            title="Улучшить промпт через GPT"
          >
            <WandSparkles size={12} />
            <span>{enhancing ? 'Режиссёр думает…' : '✨ Режиссёр'}</span>
          </button>
        </div>

        {/* Prompt Chips */}
        <div className="prompt-chips-row">
          {(mode === 'image' ? PROMPT_SUGGESTIONS_IMAGE : PROMPT_SUGGESTIONS_VIDEO).map((p) => (
            <button
              key={p}
              type="button"
              className="chip-pill"
              onClick={() => {
                triggerHaptic('click')
                setPrompt(p)
              }}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Settings row */}
        {mode === 'image' ? (
          <div className="controls-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <button
              type="button"
              className="control-pill-box"
              onClick={() => cycle(format.value, ['1:1', '16:9', '9:16'], setFormat, 'Формат')}
            >
              <span>{format.label}</span>
              <strong>{format.value}</strong>
            </button>
            <button
              type="button"
              className="control-pill-box"
              onClick={() => showToast('Нейросеть: GPT-Image 2 (чистый рендер без водяных знаков)')}
            >
              <span>Движок</span>
              <strong>GPT-Image 2</strong>
            </button>
          </div>
        ) : (
          <div className="controls-grid">
            <button
              type="button"
              className="control-pill-box"
              onClick={() => setShowModelsModal(true)}
            >
              <span>Нейросеть</span>
              <strong>{VIDEO_MODELS.find((m) => m.id === model)?.name || 'Prism Cinema HD'} ▾</strong>
            </button>
            <button
              type="button"
              className="control-pill-box"
              onClick={() => cycle(format.value, ['16:9', '9:16', '1:1'], setFormat, 'Формат')}
            >
              <span>{format.label}</span>
              <strong>{format.value}</strong>
            </button>
            <button
              type="button"
              className="control-pill-box"
              onClick={() => cycle(quality.value, ['720p', '1080p'], setQuality, 'Качество')}
            >
              <span>{quality.label}</span>
              <strong>{quality.value}</strong>
            </button>
          </div>
        )}

        {/* Main Action Button */}
        <button
          type="button"
          className="btn-primary-generate"
          disabled={!canGenerate}
          onClick={() => void createMedia()}
        >
          <span>
            {generating
              ? mode === 'image'
                ? '🎨 GPT рисует шедевр…'
                : '🎬 Prism рендерит MP4…'
              : mode === 'image'
              ? 'Сгенерировать картинку'
              : 'Сгенерировать видео'}
          </span>
          <span className="cost-pill-tag">
            <Coins size={14} /> {requiredBalance}
          </span>
        </button>
      </section>

      {/* MY CREATIONS HISTORY */}
      <div className="section-tag-heading" id="history-section">
        МОИ РАБОТЫ ({completedCount})
      </div>

      <section className="history-card">
        {jobs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)' }}>
            <Sparkles size={32} style={{ opacity: 0.4, margin: '0 auto 10px', display: 'block' }} />
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Здесь появятся ваши сгенерированные арты и видео</p>
          </div>
        ) : (
          jobs.map((job) => (
            <div
              key={job.id}
              className="job-item"
              onClick={() => {
                if (job.status === 'completed') {
                  triggerHaptic('click')
                  if (job.imageUrl) setPreviewImage(job)
                  else if (job.videoUrl) setPreviewJob(job)
                }
              }}
            >
              <div className="job-thumb-box">
                {job.status === 'completed' && job.imageUrl ? (
                  <img src={job.imageUrl} alt={job.prompt} />
                ) : job.status === 'completed' && job.videoUrl ? (
                  <div className="job-play-circle">
                    <Play size={12} fill="currentColor" />
                  </div>
                ) : (
                  <Clapperboard size={20} />
                )}
              </div>

              <div className="job-details">
                <p>{job.prompt}</p>
                <span>
                  {job.date} · {job.type === 'image' ? 'Картинка 4K' : job.duration || 'Видео 25 FPS'}
                </span>
              </div>

              <div className={`job-status-badge ${job.status}`}>
                {job.status === 'completed' ? (
                  <>
                    <Check size={14} /> Готово
                  </>
                ) : job.status === 'failed' ? (
                  'Ошибка'
                ) : (
                  'Рендер…'
                )}
              </div>
            </div>
          ))
        )}
      </section>

      {/* BOTTOM FLOATING DOCK */}
      <div className="dock-container">
        <nav className="bottom-pill-dock" aria-label="Нижняя панель">
          <button
            type="button"
            className="dock-btn active"
            onClick={() => {
              triggerHaptic('click')
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          >
            <Home size={19} />
            <span>Главная</span>
          </button>

          <button
            type="button"
            className={`dock-btn ${mode === 'image' ? 'active' : ''}`}
            onClick={() => switchMode('image')}
          >
            <Palette size={19} />
            <span>Картинка</span>
          </button>

          <button
            type="button"
            className={`dock-btn ${mode === 'video' ? 'active' : ''}`}
            onClick={() => switchMode('video')}
          >
            <Clapperboard size={19} />
            <span>Видео</span>
          </button>

          <button
            type="button"
            className="dock-btn"
            onClick={() => scrollToSection('history-section')}
          >
            <FolderArchive size={19} />
            <span>Галерея</span>
          </button>

          <button
            type="button"
            className="dock-btn"
            onClick={() => {
              triggerHaptic('click')
              setShowPlans(true)
            }}
          >
            <Gem size={19} />
            <span>Тарифы</span>
          </button>
        </nav>

        <button
          type="button"
          className="dock-help-btn"
          onClick={() => {
            triggerHaptic('click')
            setShowHelpModal(true)
          }}
          title="Справка и помощь"
        >
          <span>?</span>
        </button>
      </div>

      {/* PLANS MODAL */}
      {showPlans && (
        <div className="modal-overlay" onClick={() => setShowPlans(false)}>
          <div className="modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>💎 Пополнение кристаллов</h3>
              <button className="close-round-btn" onClick={() => setShowPlans(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="plans-list">
              <button
                type="button"
                className="plan-item-btn"
                onClick={() => void choosePlan('Старт', 120, 'starter')}
              >
                <div className="plan-info">
                  <strong>🔹 Старт · 120 💎</strong>
                  <span>Хватит на 10 картинок или 5 видео</span>
                </div>
                <span className="plan-price-tag">199 ₽</span>
              </button>

              <button
                type="button"
                className="plan-item-btn"
                onClick={() => void choosePlan('Поток', 480, 'flow')}
              >
                <div className="plan-info">
                  <strong>🔥 Поток · 480 💎</strong>
                  <span>Хватит на 40 картинок или 20 видео</span>
                </div>
                <span className="plan-price-tag">599 ₽</span>
              </button>

              <button
                type="button"
                className="plan-item-btn"
                onClick={() => void choosePlan('Студия PRO', 1200, 'studio')}
              >
                <div className="plan-info">
                  <strong>🌟 Студия PRO · 1200 💎</strong>
                  <span>Хватит на 100 картинок или 50 видео</span>
                </div>
                <span className="plan-price-tag">1 299 ₽</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODELS MODAL */}
      {showModelsModal && (
        <div className="modal-overlay" onClick={() => setShowModelsModal(false)}>
          <div className="modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🧠 Выбор нейросети</h3>
              <button className="close-round-btn" onClick={() => setShowModelsModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="plans-list">
              {VIDEO_MODELS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="plan-item-btn"
                  style={{
                    borderColor: model === item.id ? 'var(--primary-purple)' : undefined,
                    background: model === item.id ? 'var(--primary-purple-soft)' : undefined,
                  }}
                  onClick={() => selectModel(item.id)}
                >
                  <div className="plan-info">
                    <strong>
                      {model === item.id && '✓ '}
                      {item.name}
                    </strong>
                    <span>{item.description}</span>
                  </div>
                  <span className="plan-price-tag">{item.badge}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* HELP / FAQ MODAL */}
      {showHelpModal && (
        <div className="modal-overlay" onClick={() => setShowHelpModal(false)}>
          <div className="modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>❓ Как работает Prism Studio</h3>
              <button className="close-round-btn" onClick={() => setShowHelpModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted)' }}>
              <p style={{ margin: '0 0 10px', color: 'var(--text-primary)', fontWeight: 700 }}>
                🎨 <b>Генерация картинок:</b>
              </p>
              <p style={{ margin: '0 0 14px' }}>
                Использует модель <b>GPT-Image 2</b> на базе официального ключа. Создаёт детализированные изображения 1024x1024 без водяных знаков всего за 12 кристаллов.
              </p>

              <p style={{ margin: '0 0 10px', color: 'var(--text-primary)', fontWeight: 700 }}>
                🎬 <b>Генерация видео:</b>
              </p>
              <p style={{ margin: '0 0 14px' }}>
                Движок <b>Prism Cinema HD</b> синтезирует высокодетализированную сцену и собирает 25 FPS MP4-ролик с плавным кинематографичным движением камеры.
              </p>

              <p style={{ margin: '0 0 10px', color: 'var(--text-primary)', fontWeight: 700 }}>
                ✨ <b>GPT Режиссёр:</b>
              </p>
              <p style={{ margin: 0 }}>
                Нажмите кнопку «✨ Режиссёр», и нейросеть автоматически доработает вашу краткую идею до профессионального кино-сценария!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* IMAGE PREVIEW MODAL */}
      {previewImage && previewImage.imageUrl && (
        <div className="modal-overlay" onClick={() => setPreviewImage(null)}>
          <div className="modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                🎨 {previewImage.prompt}
              </h3>
              <button className="close-round-btn" onClick={() => setPreviewImage(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="media-preview-box">
              <img src={previewImage.imageUrl} alt={previewImage.prompt} />
            </div>

            <div className="preview-actions-row">
              <a
                href={previewImage.imageUrl}
                download={`prism-image-${previewImage.id}.png`}
                className="preview-action-btn primary"
                onClick={() => triggerHaptic('click')}
              >
                <Download size={15} /> Скачать
              </a>

              <button
                type="button"
                className="preview-action-btn"
                onClick={() => {
                  triggerHaptic('click')
                  void navigator.clipboard.writeText(previewImage.prompt)
                  showToast('📝 Промпт скопирован в буфер!')
                }}
              >
                <Copy size={15} /> Промпт
              </button>

              <button
                type="button"
                className="preview-action-btn"
                onClick={() => remixPrompt(previewImage.prompt)}
              >
                <Sparkles size={15} /> Повторить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIDEO PREVIEW MODAL */}
      {previewJob && previewJob.videoUrl && (
        <div className="modal-overlay" onClick={() => setPreviewJob(null)}>
          <div className="modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                🎬 {previewJob.prompt}
              </h3>
              <button className="close-round-btn" onClick={() => setPreviewJob(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="media-preview-box">
              <video src={previewJob.videoUrl} autoPlay loop playsInline controls />
            </div>

            <div className="preview-actions-row">
              <a
                href={previewJob.videoUrl}
                download={`prism-video-${previewJob.id}.mp4`}
                className="preview-action-btn primary"
                onClick={() => triggerHaptic('click')}
              >
                <Download size={15} /> Скачать MP4
              </a>

              <button
                type="button"
                className="preview-action-btn"
                onClick={() => {
                  triggerHaptic('click')
                  const fullUrl = previewJob.videoUrl?.startsWith('http')
                    ? previewJob.videoUrl
                    : `${window.location.origin}${previewJob.videoUrl}`
                  void navigator.clipboard.writeText(fullUrl || '')
                  showToast('🔗 Ссылка скопирована!')
                }}
              >
                <Copy size={15} /> Ссылка
              </button>

              <button
                type="button"
                className="preview-action-btn"
                onClick={() => remixPrompt(previewJob.prompt)}
              >
                <Sparkles size={15} /> Повторить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
