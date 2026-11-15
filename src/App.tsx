import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  Check,
  Clapperboard,
  Coins,
  Copy,
  Crown,
  Download,
  Flame,
  FolderArchive,
  Gem,
  Heart,
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
  User,
  WandSparkles,
  X,
  Zap,
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
    badge: 'No Watermark',
    description: 'Ultra-fast 25 FPS video synthesis via GPT-Image without queues or watermarks',
  },
  {
    id: 'kleo-video',
    name: 'Kleo Studio (Seedance / Kling)',
    provider: 'Kleo AI',
    badge: 'Connected',
    description: 'Cinematic video generation via Kleo AI Studio (Seedance 2.5 / Kling)',
  },
]

const PROMPT_SUGGESTIONS_IMAGE = [
  '🏎️ Neon supercar speeding in the rain',
  '🦊 Cute fox in a snowy sunrise forest',
  '🌌 Futuristic cyberpunk metropolis 4k',
  '🌊 Ocean turquoise waves crashing at sunset',
  '🪐 Astronaut walking on an alien planet',
]

const PROMPT_SUGGESTIONS_VIDEO = [
  '🌌 Cyberpunk neon city under rain, cinematic camera sweep',
  '🏎️ Retro sports car driving on a night highway',
  '🌊 Turquoise ocean wave crashing against cliffs 4k',
  '🚀 Spaceship hyperdrive through a colorful nebula',
  '🦅 Eagle soaring over snow-covered mountain peaks',
]

const API_BASE = import.meta.env.VITE_API_URL ?? ''

function getTelegramUser(): { id: string | null; name: string; username?: string; initial: string } {
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user
  if (tgUser) {
    const name = tgUser.first_name || tgUser.username || 'Creator'
    return {
      id: String(tgUser.id),
      name,
      username: tgUser.username ? `@${tgUser.username}` : undefined,
      initial: name.charAt(0).toUpperCase() || 'P',
    }
  }
  return { id: null, name: 'Guest Creator', username: undefined, initial: 'P' }
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
  if (!response.ok) throw new Error(data.error ?? `API Error ${response.status}`)
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
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [model, setModel] = useState('cinema-fast')
  const [mode, setMode] = useState<'image' | 'video'>('image')
  const [enhancing, setEnhancing] = useState(false)
  const [toast, setToast] = useState('')
  const [format, setFormat] = useState<Option>({ label: 'Format', value: '1:1' })
  const [length, setLength] = useState<Option>({ label: 'Length', value: '4s' })
  const [quality, setQuality] = useState<Option>({ label: 'Quality', value: '720p' })
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
              date: job.date ? formatTime(job.date) : 'Just now',
              duration: job.duration ?? '4s',
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
      return 'Recent'
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
    setFormat(newMode === 'image' ? { label: 'Format', value: '1:1' } : { label: 'Format', value: '16:9' })
    showToast(newMode === 'image' ? '🎨 Mode: Images (GPT-Image 2)' : '🎬 Mode: Video (Prism Cinema HD)')
    void api('/api/user/mode', {
      method: 'POST',
      body: JSON.stringify({ mode: newMode }),
    }).catch(() => undefined)
  }

  const requiredBalance = mode === 'image' ? 12 : 24
  const canGenerate = prompt.trim().length >= 2 && balance >= requiredBalance && !generating

  const completedCount = useMemo(() => jobs.filter((job) => job.status === 'completed').length, [jobs])
  const imagesCount = useMemo(() => jobs.filter((j) => j.type === 'image' && j.status === 'completed').length, [jobs])
  const videosCount = useMemo(() => jobs.filter((j) => j.type === 'video' && j.status === 'completed').length, [jobs])

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
    showToast(`✨ Model: ${m?.name ?? modelId}`)
    void api('/api/user/model', {
      method: 'POST',
      body: JSON.stringify({ model: modelId }),
    }).catch(() => undefined)
  }

  async function enhancePrompt() {
    if (prompt.trim().length < 2 || enhancing) return
    triggerHaptic('click')
    setEnhancing(true)
    showToast('🧠 GPT Director is expanding prompt…')
    try {
      const res = await api<{ enhanced: string }>('/api/enhance-prompt', {
        method: 'POST',
        body: JSON.stringify({ prompt: prompt.trim() }),
      })
      if (res.enhanced) {
        setPrompt(res.enhanced)
        triggerHaptic('success')
        showToast('✨ Prompt enhanced by GPT Director!')
      }
    } catch {
      triggerHaptic('error')
      showToast('Could not enhance prompt')
    } finally {
      setEnhancing(false)
    }
  }

  async function createMedia() {
    if (!canGenerate) return
    triggerHaptic('click')
    const submittedPrompt = prompt.trim()
    setGenerating(true)
    showToast(mode === 'image' ? '🎨 GPT-Image is painting artwork…' : '🎬 Prism is synthesizing 25 FPS video…')

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
          date: 'Just now',
          aspectRatio: format.value,
          imageUrl: result.imageUrl,
        }
        setJobs((items) => [newJob, ...items])
        showToast('🎉 Artwork generated successfully!')
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
          date: 'Just now',
          duration: length.value,
          aspectRatio: format.value,
          quality: quality.value,
          videoUrl: result.videoUrl,
        }
        setJobs((items) => [newJob, ...items])
        showToast('🎉 Video created successfully!')
        setPreviewJob(newJob)
      }
    } catch (error) {
      triggerHaptic('error')
      showToast(error instanceof Error ? error.message : 'Generation failed')
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
      showToast(`💎 ${name}: +${crystals} crystals added!`)
    } catch {
      triggerHaptic('error')
      showToast('Payment temporarily unavailable')
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
    window.scrollTo({ top: 160, behavior: 'smooth' })
    showToast('📝 Prompt loaded into studio')
  }

  function scrollToSection(id: string) {
    triggerHaptic('click')
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  function copyReferralLink() {
    triggerHaptic('click')
    const botUser = 'songhude_bot'
    const refCode = user.id ? `ref_${user.id}` : 'prism'
    const refUrl = `https://t.me/${botUser}?start=${refCode}`
    void navigator.clipboard.writeText(refUrl).then(() => {
      showToast('🎁 Invite link copied to clipboard!')
    })
  }

  return (
    <div className="app-container">
      {/* TOAST NOTIFICATION */}
      {toast && (
        <div className="toast-bar">
          <Sparkles size={14} />
          <span>{toast}</span>
        </div>
      )}

      {/* TOPBAR FLOATING PILL */}
      <header className="topbar-pill">
        <div className="brand-wrapper">
          <span className="brand-text">Prism AI</span>
          <span className="brand-badge">PRO</span>
        </div>

        <div className="top-controls">
          <button className="balance-pill-badge" onClick={() => setShowPlans(true)} title="Crystals Balance">
            <span>💎</span>
            <span>{balance}</span>
          </button>

          <button
            className="icon-btn-round plus"
            onClick={() => {
              triggerHaptic('click')
              setShowPlans(true)
            }}
            title="Top Up Crystals"
          >
            <Plus size={15} />
          </button>

          <button
            className="icon-btn-round"
            onClick={() => {
              triggerHaptic('click')
              setDark((d) => !d)
            }}
            title="Toggle Dark Theme"
          >
            {dark ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <div
            className="user-avatar-gradient"
            onClick={() => {
              triggerHaptic('click')
              setShowProfileModal(true)
            }}
            title="Open Profile"
          >
            <span>{user.initial}</span>
          </div>
        </div>
      </header>

      {/* QUICK CATEGORIES (ROW OF CIRCLES) */}
      <section className="quick-categories" aria-label="Quick Actions">
        <button
          type="button"
          className={`cat-item ${mode === 'image' ? 'active' : ''}`}
          onClick={() => switchMode('image')}
        >
          <div className="cat-circle">
            <Palette size={20} />
          </div>
          <span className="cat-label">Images</span>
        </button>

        <button
          type="button"
          className={`cat-item ${mode === 'video' ? 'active' : ''}`}
          onClick={() => switchMode('video')}
        >
          <div className="cat-circle">
            <Clapperboard size={20} />
          </div>
          <span className="cat-label">Videos</span>
        </button>

        <button
          type="button"
          className="cat-item"
          onClick={() => {
            if (prompt.trim().length >= 2) {
              void enhancePrompt()
            } else {
              setPrompt('Cyberpunk neon sports car in a futuristic rainy city, volumetric smoke 4k')
              showToast('✨ Sample prompt added! Tap again to GPT-enhance')
            }
          }}
        >
          <div className="cat-circle">
            <WandSparkles size={20} />
          </div>
          <span className="cat-label">Director</span>
        </button>

        <button type="button" className="cat-item" onClick={() => scrollToSection('history-section')}>
          <div className="cat-circle">
            <FolderArchive size={20} />
          </div>
          <span className="cat-label">Gallery</span>
        </button>

        <button
          type="button"
          className="cat-item"
          onClick={() => {
            triggerHaptic('click')
            setShowProfileModal(true)
          }}
        >
          <div className="cat-circle">
            <User size={20} />
          </div>
          <span className="cat-label">Profile</span>
        </button>
      </section>

      {/* FEATURED CARD ("FEATURED CREATION") */}
      <section className="featured-card">
        <div className="featured-top">
          <span className="featured-tag">FEATURED CREATION</span>
          <div className="featured-top-right">
            <span className="stake-badge">
              💎 {balance}
            </span>
            <div className="equalizer" title="Trends">
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
                <Sparkles size={26} />
              </div>
            )}
          </div>

          <div className="featured-info">
            <h4 className="featured-title">
              {featuredItem ? featuredItem.prompt.slice(0, 32) + (featuredItem.prompt.length > 32 ? '…' : '') : 'Cyberpunk Neon 4K'}
            </h4>
            <p className="featured-sub">
              {featuredItem ? 'Prism AI Studio' : 'DenKas · Prism Studio'}
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
                showToast('✨ Start generating your own media below!')
              }
            }}
            title="View Featured Work"
          >
            <Play size={18} fill="currentColor" />
          </button>
        </div>

        <div className="featured-actions">
          <button
            className="action-pill-btn"
            onClick={() =>
              remixPrompt(
                featuredItem
                  ? featuredItem.prompt
                  : 'Neon cyberpunk supercar speeding through rainy night Tokyo, glowing reflections, 4k photorealism',
              )
            }
          >
            <Trophy size={14} />
            <span>Use Prompt</span>
          </button>

          <button className={`like-pill-btn ${likedFeatured ? 'liked' : ''}`} onClick={toggleLike}>
            <Heart size={14} fill={likedFeatured ? 'currentColor' : 'none'} />
            <span>{likeCount}</span>
          </button>
        </div>
      </section>

      {/* CREATION STUDIO ("PRISM STUDIO") */}
      <div className="section-tag-heading">PRISM STUDIO</div>

      <section className="studio-card" id="studio-section">
        {/* Mode Segmented Switcher */}
        <div className="mode-segmented-pill">
          <button
            type="button"
            className={`segment-btn ${mode === 'image' ? 'active' : ''}`}
            onClick={() => switchMode('image')}
          >
            <Palette size={14} />
            <span>🎨 Images (GPT)</span>
          </button>
          <button
            type="button"
            className={`segment-btn ${mode === 'video' ? 'active' : ''}`}
            onClick={() => switchMode('video')}
          >
            <Clapperboard size={14} />
            <span>🎬 Video (HD)</span>
          </button>
        </div>

        {/* Prompt Input & Enhance Button */}
        <div className="prompt-field-wrap">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              mode === 'image'
                ? 'Describe your image (e.g. golden dragon atop misty peaks, volumetric lighting, 4k photorealism)…'
                : 'Describe your scene (e.g. neon sports car speeding on rainy highway, cinematic camera zoom, 4k)…'
            }
            maxLength={500}
          />

          <button
            type="button"
            className="director-enhance-btn"
            disabled={prompt.trim().length < 2 || enhancing}
            onClick={() => void enhancePrompt()}
            title="Enhance prompt via GPT Director"
          >
            <WandSparkles size={11} />
            <span>{enhancing ? 'Director…' : '✨ Director'}</span>
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
          <div className="controls-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <button
              type="button"
              className="control-pill-box"
              onClick={() => cycle(format.value, ['1:1', '16:9', '9:16'], setFormat, 'Format')}
            >
              <span>{format.label}</span>
              <strong>{format.value}</strong>
            </button>
            <button
              type="button"
              className="control-pill-box"
              onClick={() => showToast('Engine: GPT-Image 2 (Zero Watermarks, 4K HD)')}
            >
              <span>Engine</span>
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
              <span>Model</span>
              <strong>{VIDEO_MODELS.find((m) => m.id === model)?.name || 'Prism Cinema HD'} ▾</strong>
            </button>
            <button
              type="button"
              className="control-pill-box"
              onClick={() => cycle(format.value, ['16:9', '9:16', '1:1'], setFormat, 'Format')}
            >
              <span>{format.label}</span>
              <strong>{format.value}</strong>
            </button>
            <button
              type="button"
              className="control-pill-box"
              onClick={() => cycle(quality.value, ['720p', '1080p'], setQuality, 'Quality')}
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
          <span className="btn-main-label">
            {generating
              ? mode === 'image'
                ? '🎨 GPT is generating art…'
                : '🎬 Prism is rendering MP4…'
              : mode === 'image'
              ? 'Generate Artwork'
              : 'Generate Video'}
          </span>
          <span className="cost-pill-tag">
            <Coins size={13} /> {requiredBalance} 💎
          </span>
        </button>
      </section>

      {/* MY GALLERY HISTORY */}
      <div className="section-tag-heading" id="history-section">
        MY GALLERY ({completedCount})
      </div>

      <section className="history-card">
        {jobs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '26px 10px', color: 'var(--text-muted)' }}>
            <Sparkles size={28} style={{ opacity: 0.35, margin: '0 auto 8px', display: 'block' }} />
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600 }}>Your generated artworks and videos will appear here</p>
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
                    <Play size={11} fill="currentColor" />
                  </div>
                ) : (
                  <Clapperboard size={18} />
                )}
              </div>

              <div className="job-details">
                <p>{job.prompt}</p>
                <span>
                  {job.date} · {job.type === 'image' ? 'Image 4K' : job.duration || 'Video 25 FPS'}
                </span>
              </div>

              <div className={`job-status-badge ${job.status}`}>
                {job.status === 'completed' ? (
                  <>
                    <Check size={13} /> Ready
                  </>
                ) : job.status === 'failed' ? (
                  'Error'
                ) : (
                  'Rendering…'
                )}
              </div>
            </div>
          ))
        )}
      </section>

      {/* BOTTOM FLOATING DOCK */}
      <div className="dock-container">
        <nav className="bottom-pill-dock" aria-label="Bottom Navigation">
          <button
            type="button"
            className="dock-btn active"
            onClick={() => {
              triggerHaptic('click')
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          >
            <Home size={18} />
            <span>Home</span>
          </button>

          <button
            type="button"
            className={`dock-btn ${mode === 'image' ? 'active' : ''}`}
            onClick={() => switchMode('image')}
          >
            <Palette size={18} />
            <span>Images</span>
          </button>

          <button
            type="button"
            className={`dock-btn ${mode === 'video' ? 'active' : ''}`}
            onClick={() => switchMode('video')}
          >
            <Clapperboard size={18} />
            <span>Video</span>
          </button>

          <button
            type="button"
            className="dock-btn"
            onClick={() => scrollToSection('history-section')}
          >
            <FolderArchive size={18} />
            <span>Gallery</span>
          </button>

          <button
            type="button"
            className="dock-btn"
            onClick={() => {
              triggerHaptic('click')
              setShowProfileModal(true)
            }}
          >
            <User size={18} />
            <span>Profile</span>
          </button>
        </nav>

        <button
          type="button"
          className="dock-help-btn"
          onClick={() => {
            triggerHaptic('click')
            setShowHelpModal(true)
          }}
          title="Help & FAQ"
        >
          <span>?</span>
        </button>
      </div>

      {/* USER PROFILE MODAL */}
      {showProfileModal && (
        <div className="modal-overlay" onClick={() => setShowProfileModal(false)}>
          <div className="modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Creator Profile</h3>
              <button className="close-round-btn" onClick={() => setShowProfileModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="profile-hero">
              <div className="profile-avatar-large">
                <span>{user.initial}</span>
              </div>
              <h4 className="profile-name">{user.name}</h4>
              <div className="profile-badges-row">
                {user.username && <span className="profile-pill">{user.username}</span>}
                <span className="profile-pill gold">👑 Pro Creator</span>
                <span className="profile-pill">⚡ Active 24/7</span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                ID: {user.id ? `tg_${user.id}` : 'Guest session'}
              </span>
            </div>

            {/* Stats Grid */}
            <div className="profile-stats-grid">
              <div className="stat-box">
                <strong>{imagesCount}</strong>
                <span>Artworks</span>
              </div>
              <div className="stat-box">
                <strong>{videosCount}</strong>
                <span>Videos</span>
              </div>
              <div className="stat-box">
                <strong>{balance} 💎</strong>
                <span>Crystals</span>
              </div>
            </div>

            {/* Quick Top-up Button inside Profile */}
            <button
              type="button"
              className="btn-primary-generate"
              style={{ height: 44, marginBottom: 14 }}
              onClick={() => {
                setShowProfileModal(false)
                setShowPlans(true)
              }}
            >
              <span className="btn-main-label">Top Up Crystals</span>
              <span className="cost-pill-tag">💎 Plans</span>
            </button>

            {/* Referral / Bonuses Box */}
            <div className="referral-card">
              <h4>
                <Sparkles size={14} /> Referral Bonus Program
              </h4>
              <p>
                Share your personal invite link with friends and get <b>+50 💎 crystals</b> for every invited creator!
              </p>
              <button type="button" className="btn-copy-ref" onClick={copyReferralLink}>
                <Copy size={13} /> Copy Invite Link
              </button>
            </div>

            {/* System Info */}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, textAlign: 'center' }}>
              <div>🎨 Image Engine: <b>GPT-Image 2 (Zero Watermarks)</b></div>
              <div>🎬 Video Engine: <b>Prism Cinema HD (25 FPS)</b></div>
              <div>✨ Director: <b>GPT-4o Intelligent Prompt Engine</b></div>
            </div>
          </div>
        </div>
      )}

      {/* PLANS MODAL */}
      {showPlans && (
        <div className="modal-overlay" onClick={() => setShowPlans(false)}>
          <div className="modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>💎 Crystal Top-Up Plans</h3>
              <button className="close-round-btn" onClick={() => setShowPlans(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="plans-list">
              <button
                type="button"
                className="plan-item-btn"
                onClick={() => void choosePlan('Starter', 120, 'starter')}
              >
                <div className="plan-info">
                  <strong>🔹 Starter · 120 💎</strong>
                  <span>Enough for 10 images or 5 videos</span>
                </div>
                <span className="plan-price-tag">199 ₽</span>
              </button>

              <button
                type="button"
                className="plan-item-btn"
                onClick={() => void choosePlan('Creator Flow', 480, 'flow')}
              >
                <div className="plan-info">
                  <strong>🔥 Creator Flow · 480 💎</strong>
                  <span>Enough for 40 images or 20 videos</span>
                </div>
                <span className="plan-price-tag">599 ₽</span>
              </button>

              <button
                type="button"
                className="plan-item-btn"
                onClick={() => void choosePlan('Studio PRO', 1200, 'studio')}
              >
                <div className="plan-info">
                  <strong>🌟 Studio PRO · 1200 💎</strong>
                  <span>Enough for 100 images or 50 videos</span>
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
              <h3>🧠 Select AI Model</h3>
              <button className="close-round-btn" onClick={() => setShowModelsModal(false)}>
                <X size={16} />
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
              <h3>❓ How Prism AI Works</h3>
              <button className="close-round-btn" onClick={() => setShowHelpModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-muted)' }}>
              <p style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontWeight: 700 }}>
                🎨 <b>AI Image Generation:</b>
              </p>
              <p style={{ margin: '0 0 12px' }}>
                Powered by <b>GPT-Image 2</b>. Creates crisp high-resolution artworks with zero watermarks for only 12 crystals.
              </p>

              <p style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontWeight: 700 }}>
                🎬 <b>AI Video Synthesis:</b>
              </p>
              <p style={{ margin: '0 0 12px' }}>
                <b>Prism Cinema HD</b> renders high-detail scene imagery and encodes a smooth 25 FPS MP4 video with cinematic camera motions.
              </p>

              <p style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontWeight: 700 }}>
                ✨ <b>GPT Director:</b>
              </p>
              <p style={{ margin: 0 }}>
                Tap the «✨ Director» button to automatically turn a short phrase into an epic cinematic production prompt!
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
              <h3 style={{ fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                🎨 {previewImage.prompt}
              </h3>
              <button className="close-round-btn" onClick={() => setPreviewImage(null)}>
                <X size={16} />
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
                <Download size={14} /> Download
              </a>

              <button
                type="button"
                className="preview-action-btn"
                onClick={() => {
                  triggerHaptic('click')
                  void navigator.clipboard.writeText(previewImage.prompt)
                  showToast('📝 Prompt copied to clipboard!')
                }}
              >
                <Copy size={14} /> Copy
              </button>

              <button
                type="button"
                className="preview-action-btn"
                onClick={() => remixPrompt(previewImage.prompt)}
              >
                <Sparkles size={14} /> Remix
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
              <h3 style={{ fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                🎬 {previewJob.prompt}
              </h3>
              <button className="close-round-btn" onClick={() => setPreviewJob(null)}>
                <X size={16} />
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
                <Download size={14} /> Download MP4
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
                  showToast('🔗 Link copied!')
                }}
              >
                <Copy size={14} /> Link
              </button>

              <button
                type="button"
                className="preview-action-btn"
                onClick={() => remixPrompt(previewJob.prompt)}
              >
                <Sparkles size={14} /> Remix
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
