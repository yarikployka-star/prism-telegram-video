import dotenv from 'dotenv'
import fs from 'node:fs'
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
  getUserJobs,
  getPlans,
  createPayment,
  getUserModel,
  setUserModel,
  getUserMode,
  setUserMode,
} from './db.js'
import { createVideo, AVAILABLE_MODELS } from './providers/video.js'
import { generateGptImage } from './providers/image.js'
import { enhancePromptWithGPT } from './providers/llm.js'

dotenv.config()
initDatabase()

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) {
  console.log('Telegram bot is disabled: set TELEGRAM_BOT_TOKEN in .env')
}

const api = token ? `https://api.telegram.org/bot${token}` : ''
const rawMiniAppUrl = process.env.MINI_APP_URL
const miniAppUrl = (rawMiniAppUrl && !rawMiniAppUrl.includes('example.com')) 
  ? rawMiniAppUrl 
  : 'https://prism-telegram-video.onrender.com'
let offset = 0
let isRunning = false

async function callTelegram(method: string, body: Record<string, unknown>) {
  try {
    const res = await fetch(`${api}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return await res.json()
  } catch (err) {
    console.error(`Telegram ${method} failed:`, err)
    return null
  }
}

async function sendChatAction(chatId: number, action = 'upload_video') {
  await callTelegram('sendChatAction', { chat_id: chatId, action })
}

async function deleteMessage(chatId: number, messageId: number) {
  await callTelegram('deleteMessage', { chat_id: chatId, message_id: messageId })
}

async function sendVideo(chatId: number, filePath: string, caption: string, replyMarkup?: Record<string, unknown>) {
  try {
    const formData = new FormData()
    formData.append('chat_id', String(chatId))
    formData.append('caption', caption)
    formData.append('parse_mode', 'HTML')
    if (replyMarkup) {
      formData.append('reply_markup', JSON.stringify(replyMarkup))
    }
    const fileBuf = fs.readFileSync(filePath)
    formData.append('video', new Blob([fileBuf], { type: 'video/mp4' }), 'video.mp4')

    const res = await fetch(`${api}/sendVideo`, {
      method: 'POST',
      body: formData,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error('sendVideo failed:', res.status, data)
      return null
    }
    return data
  } catch (err) {
    console.error('Error in sendVideo:', err)
    return null
  }
}

async function sendPhoto(chatId: number, filePath: string, caption: string, replyMarkup?: Record<string, unknown>) {
  try {
    const formData = new FormData()
    formData.append('chat_id', String(chatId))
    formData.append('caption', caption)
    formData.append('parse_mode', 'HTML')
    if (replyMarkup) {
      formData.append('reply_markup', JSON.stringify(replyMarkup))
    }
    const fileBuf = fs.readFileSync(filePath)
    formData.append('photo', new Blob([fileBuf], { type: 'image/png' }), 'image.png')

    const res = await fetch(`${api}/sendPhoto`, {
      method: 'POST',
      body: formData,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error('sendPhoto failed:', res.status, data)
      return null
    }
    return data
  } catch (err) {
    console.error('Error in sendPhoto:', err)
    return null
  }
}

function getModelDisplayName(modelId: string): string {
  const found = AVAILABLE_MODELS.find((m) => m.id === modelId)
  return found ? found.name : 'Prism Cinema HD'
}

async function setCommands() {
  await callTelegram('setMyCommands', {
    commands: [
      { command: 'start', description: '🚀 Главное меню и студия' },
      { command: 'image', description: '🎨 Создать картинку (GPT-Image)' },
      { command: 'video', description: '🎬 Создать видео (Prism Video)' },
      { command: 'mode', description: '🔄 Переключить режим (Картинка / Видео)' },
      { command: 'model', description: '🧠 Выбрать модель' },
      { command: 'enhance', description: '✨ GPT Режиссёр (улучшить идею)' },
      { command: 'balance', description: '💎 Баланс кристаллов' },
      { command: 'plans', description: '📦 Тарифы и пополнение' },
      { command: 'myvideos', description: '📂 Мои генерации' },
      { command: 'help', description: '❓ Помощь и примеры' },
    ],
  })
}

function getKeyboard(chatId: number) {
  const userId = `tg_${chatId}`
  const currentMode = getUserMode(userId)
  const currentModel = getUserModel(userId)
  const currentModelName = getModelDisplayName(currentModel)
  const inline_keyboard: any[][] = []

  if (miniAppUrl && /^https:\/\//i.test(miniAppUrl)) {
    inline_keyboard.push([{ text: '🚀 Open Prism AI Studio', web_app: { url: miniAppUrl } }])
  }

  const modeBtnText = currentMode === 'image' 
    ? '🎨 Режим: Картинки (переключить на 🎬)' 
    : '🎬 Режим: Видео (переключить на 🎨)'
  inline_keyboard.push([{ text: modeBtnText, callback_data: 'toggle_mode' }])

  inline_keyboard.push([
    { text: `🧠 Модель видео: ${currentModelName}`, callback_data: 'cmd_model' },
  ])
  inline_keyboard.push([
    { text: '💎 Баланс', callback_data: 'cmd_balance' },
    { text: '📦 Тарифы', callback_data: 'cmd_plans' },
  ])
  inline_keyboard.push([
    { text: '💡 Пример промпта', callback_data: 'cmd_example' },
    { text: '📂 Мои генерации', callback_data: 'cmd_myvideos' },
  ])

  return { inline_keyboard }
}

async function handleModel(chatId: number) {
  const userId = `tg_${chatId}`
  const current = getUserModel(userId)

  const text = `🧠 <b>Выбор нейросети для генерации:</b>

Активная модель: <b>${getModelDisplayName(current)}</b>

🎥 <b>Prism Cinema HD</b> — генерация видео через GPT-Image без задержек и 100% без водяных знаков
🎬 <b>Kleo Studio</b> — Seedance 2.5 и Kling через подключенный API ключ

<i>Нажмите на модель, чтобы переключить:</i>`

  const inline_keyboard = [
    [{ text: `${current === 'cinema-fast' ? '✅ ' : ''}🎥 Prism Cinema HD (GPT)`, callback_data: 'set_model_cinema' }],
    [{ text: `${current === 'kleo-video' ? '✅ ' : ''}🎬 Kleo Studio (Kling / Seedance)`, callback_data: 'set_model_kleo' }],
    [{ text: '◀️ В главное меню', callback_data: 'cmd_start' }],
  ]

  await callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard },
  })
}

async function handleEnhance(chatId: number, rawText: string) {
  const prompt = rawText.replace(/^\/(enhance|prompt|gpt)\s*/i, '').trim()
  if (!prompt || prompt.length < 2) {
    await callTelegram('sendMessage', {
      chat_id: chatId,
      text: '✨ <b>GPT Режиссёр:</b>\nОтправьте команду со своей идеей, например:\n<code>/enhance спорткар в ночном городе</code>\n\nИ GPT-5 превратит её в кинематографичный кино-сценарий для видео!',
      parse_mode: 'HTML',
    })
    return
  }

  await callTelegram('sendChatAction', { chat_id: chatId, action: 'typing' })
  const enhanced = await enhancePromptWithGPT(prompt)

  const text = `✨ <b>GPT Режиссёр улучшил вашу идею:</b>\n\n<code>${enhanced}</code>\n\n<i>Нажмите кнопку ниже, чтобы запустить генерацию видео по этому описанию:</i>`

  const inline_keyboard = [
    [{ text: '🎬 Создать видео по этому промпту', callback_data: `gen_preset_${encodeURIComponent(enhanced.slice(0, 100))}` }],
    [{ text: '◀️ В главное меню', callback_data: 'cmd_start' }],
  ]

  await callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard },
  })
}

async function handleStart(chatId: number, from: { id: number; first_name?: string }) {
  const userId = `tg_${chatId}`
  const user = getOrCreateUser(userId, chatId, 240)
  const mode = getUserMode(userId)

  const text = `👋 Привет, <b>${from.first_name || 'творец'}</b>! Я <b>Prism AI Studio</b>.

Создавайте профессиональные арты, фото и видео нейросетью!

⚡ <b>2 режима создания:</b>
🎨 <b>Картинки (GPT-Image 2)</b> — чистые 4K изображения без водяных знаков (12 💎).
🎬 <b>Видео (Prism Video)</b> — кинематографичные видеоролики MP4 (24 💎).

Текущий активный режим: <b>${mode === 'image' ? '🎨 Картинки (GPT-Image)' : '🎬 Видео (Prism Video)'}</b>

<i>Просто напишите мне в чат текст (например: «неоновый спорткар на закате под дождём»), и нейросеть создаст контент! Или откройте Web-студию ниже.</i>

💎 <b>Ваш баланс:</b> ${user.balance} кристаллов`

  await callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: getKeyboard(chatId),
  })
}

async function handleBalance(chatId: number) {
  const userId = `tg_${chatId}`
  const user = getOrCreateUser(userId, chatId, 240)

  const text = `💎 <b>Ваш баланс:</b> ${user.balance} кристаллов
🎬 Стоимость 1 генерации: <b>24 кристалла</b>
✨ Доступно генераций: <b>${Math.floor(user.balance / 24)}</b>

Для пополнения баланса нажмите кнопку ниже или команду /plans.`

  const inline_keyboard = [
    [{ text: '📦 Пополнить кристаллы', callback_data: 'cmd_plans' }],
    ...(miniAppUrl && /^https:\/\//i.test(miniAppUrl)
      ? [[{ text: '🚀 Открыть студию Prism', web_app: { url: miniAppUrl } }]]
      : []),
  ]

  await callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard },
  })
}

async function handlePlans(chatId: number) {
  const text = `📦 <b>Тарифные планы Prism:</b>

🔹 <b>Старт:</b> 120 кристаллов (5 видео) — <b>199 ₽</b>
🔹 <b>Поток:</b> 480 кристаллов (20 видео) — <b>599 ₽</b>
🔹 <b>Студия:</b> 1200 кристаллов (50 видео) — <b>1 299 ₽</b>

<i>Выберите тариф для мгновенного пополнения (демо):</i>`

  const inline_keyboard = [
    [{ text: '🔹 Старт · 120 💎 (199 ₽)', callback_data: 'buy_starter' }],
    [{ text: '🔹 Поток · 480 💎 (599 ₽)', callback_data: 'buy_flow' }],
    [{ text: '🔹 Студия · 1200 💎 (1 299 ₽)', callback_data: 'buy_studio' }],
  ]

  await callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard },
  })
}

async function handleMyVideos(chatId: number) {
  const userId = `tg_${chatId}`
  const jobs = getUserJobs(userId, 5)

  if (!jobs.length) {
    await callTelegram('sendMessage', {
      chat_id: chatId,
      text: '📂 У вас пока нет созданных видео. Отправьте описание сцены, чтобы создать первое!',
      reply_markup: getKeyboard(chatId),
    })
    return
  }

  let text = `📂 <b>Ваши последние видео:</b>\n\n`
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i]
    const icon = j.status === 'completed' ? '✅' : j.status === 'failed' ? '❌' : '⏳'
    text += `${icon} <b>${j.prompt.slice(0, 45)}...</b>\nСтатус: <i>${j.status}</i> · ${j.created_at}\n\n`
  }

  const inline_keyboard: any[][] = []
  const completedJob = jobs.find((j) => j.status === 'completed' && j.video_url)
  if (completedJob) {
    inline_keyboard.push([{ text: '🎬 Отправить последнее видео', callback_data: `send_${completedJob.id}` }])
  }
  if (miniAppUrl && /^https:\/\//i.test(miniAppUrl)) {
    inline_keyboard.push([{ text: '🚀 Смотреть в Web-студии', web_app: { url: miniAppUrl } }])
  }

  await callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard },
  })
}

async function handleHelp(chatId: number) {
  const text = `❓ <b>Как получать наилучшие видео:</b>

💡 <b>Советы по описанию (промпту):</b>
• Опишите главный объект и его окружение: <i>«Белая полярная сова летит над заснеженными елями»</i>
• Добавьте свет и атмосферу: <i>«золотой час, лучи сквозь туман, киноматографичный свет»</i>
• Опишите движение: <i>«камера медленно приближается», «плавное скольжение»</i>

⚡ <b>Команды бота:</b>
/start — Главное меню и ссылка на Mini App
/generate <i>текст</i> — Создать видео по описанию
/balance — Баланс кристаллов
/plans — Тарифы и пополнение
/myvideos — История генераций
/help — Справка`

  await callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: getKeyboard(chatId),
  })
}

async function handleGenerateImage(chatId: number, rawPrompt: string) {
  const prompt = rawPrompt.replace(/^\/(image|img|photo|picture|картинка|фото)\s*/i, '').trim()
  if (prompt.length < 2) {
    await callTelegram('sendMessage', {
      chat_id: chatId,
      text: '🎨 Пожалуйста, опишите изображение (минимум 2 символа).\n\nНапример: <i>«Неоновый спорткар на ночной автостраде под дождём»</i>',
      parse_mode: 'HTML',
    })
    return
  }

  const userId = `tg_${chatId}`
  const user = getOrCreateUser(userId, chatId, 240)
  const charge = 12

  if (user.balance < charge) {
    await callTelegram('sendMessage', {
      chat_id: chatId,
      text: `❌ <b>Недостаточно кристаллов!</b>\n\nТребуется: <b>12 💎</b>\nУ вас: <b>${user.balance} 💎</b>\n\nПополните баланс по кнопке ниже:`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '📦 Пополнить кристаллы', callback_data: 'cmd_plans' }]],
      },
    })
    return
  }

  deductBalance(userId, charge)
  const jobId = randomUUID()
  createJob({
    id: jobId,
    userId,
    prompt,
    type: 'image',
    status: 'processing',
    aspectRatio: '1:1',
  })

  const statusMsg = await callTelegram('sendMessage', {
    chat_id: chatId,
    text: `🎨 <b>Генерирую изображение через GPT-Image 2...</b>\n\n📝 <i>«${prompt}»</i>\n⏳ Рисуем в высоком качестве без водяных знаков...`,
    parse_mode: 'HTML',
  })
  const statusMsgId = statusMsg?.result?.message_id

  void sendChatAction(chatId, 'upload_photo')

  try {
    const result = await generateGptImage(jobId, prompt)
    updateJob(jobId, {
      status: result.status,
      imageUrl: result.imageUrl,
      provider: result.provider,
    })

    const updatedUser = getUser(userId)
    const caption = `🎨 <b>Изображение готово!</b>\n\n📝 <i>«${prompt}»</i>\n💎 Баланс: <b>${updatedUser?.balance ?? user.balance - charge}</b> кристаллов`

    const replyMarkup = {
      inline_keyboard: [
        ...(miniAppUrl && /^https:\/\//i.test(miniAppUrl)
          ? [[{ text: '🚀 Открыть Web-студию', web_app: { url: miniAppUrl } }]]
          : []),
        [
          { text: '✨ Улучшить идею', callback_data: `enhance_${encodeURIComponent(prompt.slice(0, 30))}` },
          { text: '🎬 Режим видео', callback_data: 'set_mode_video' },
        ],
      ],
    }

    if (result.filePath && fs.existsSync(result.filePath)) {
      await sendPhoto(chatId, result.filePath, caption, replyMarkup)
    } else {
      await callTelegram('sendMessage', {
        chat_id: chatId,
        text: caption,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      })
    }

    if (statusMsgId) {
      void deleteMessage(chatId, statusMsgId)
    }
  } catch (err) {
    console.error('Image generation error:', err)
    refundBalance(userId, charge)
    const errText = err instanceof Error ? err.message : 'Неизвестная ошибка'
    updateJob(jobId, { status: 'failed', errorMessage: errText })

    if (statusMsgId) {
      void deleteMessage(chatId, statusMsgId)
    }

    await callTelegram('sendMessage', {
      chat_id: chatId,
      text: `❌ <b>Не удалось создать изображение:</b>\n${errText}\n\n💎 <b>12 кристаллов возвращены</b> на ваш баланс.`,
      parse_mode: 'HTML',
      reply_markup: getKeyboard(chatId),
    })
  }
}

async function handleGenerate(chatId: number, rawPrompt: string) {
  const prompt = rawPrompt.replace(/^\/(generate|video)\s*/i, '').trim()
  if (prompt.length < 3) {
    await callTelegram('sendMessage', {
      chat_id: chatId,
      text: '⚠️ Пожалуйста, опишите сцену подробнее (минимум 3 символа).\n\nНапример: <i>«Парящий замок в розовых облаках на закате»</i>',
      parse_mode: 'HTML',
    })
    return
  }

  const userId = `tg_${chatId}`
  const user = getOrCreateUser(userId, chatId, 240)
  const charge = 24

  if (user.balance < charge) {
    await callTelegram('sendMessage', {
      chat_id: chatId,
      text: `❌ <b>Недостаточно кристаллов!</b>\n\nТребуется: <b>24 💎</b>\nУ вас: <b>${user.balance} 💎</b>\n\nПополните баланс, чтобы продолжить генерацию.`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '📦 Пополнить кристаллы', callback_data: 'cmd_plans' }]],
      },
    })
    return
  }

  // Deduct balance
  const success = deductBalance(userId, charge)
  if (!success) {
    await callTelegram('sendMessage', {
      chat_id: chatId,
      text: '❌ Ошибка списания баланса. Пожалуйста, попробуйте позже.',
    })
    return
  }

  const jobId = randomUUID()
  createJob({
    id: jobId,
    userId,
    prompt,
    status: 'processing',
    duration: '4 сек',
    aspectRatio: '9:16',
    quality: '720p',
  })

  const selectedModel = getUserModel(userId)
  const modelName = getModelDisplayName(selectedModel)

  // Send status notification
  const statusMsg = await callTelegram('sendMessage', {
    chat_id: chatId,
    text: `🎬 <b>Генерация видео запущена!</b>\n\n🧠 Модель: <b>${modelName}</b>\n📝 <i>«${prompt}»</i>\n⏳ Сводим видео высокого качества... Пожалуйста, подождите.`,
    parse_mode: 'HTML',
  })
  const statusMsgId = statusMsg?.result?.message_id

  void sendChatAction(chatId, 'upload_video')

  try {
    const result = await createVideo(jobId, prompt, {
      aspectRatio: '9:16',
      duration: '4 сек',
      quality: '720p',
      model: selectedModel,
    })

    updateJob(jobId, {
      status: result.status,
      videoUrl: result.videoUrl,
      provider: result.provider,
    })

    const updatedUser = getUser(userId)
    const caption = `🎬 <b>Видео готово!</b>\n\n🧠 Нейросеть: <b>${result.provider}</b>\n📝 <i>«${prompt}»</i>\n💎 Баланс: <b>${updatedUser?.balance ?? user.balance - charge}</b> кристаллов`

    const replyMarkup = {
      inline_keyboard: [
        ...(miniAppUrl && /^https:\/\//i.test(miniAppUrl)
          ? [[{ text: '🚀 Открыть в студии Prism', web_app: { url: miniAppUrl } }]]
          : []),
        [
          { text: '💡 Другой пример', callback_data: 'cmd_example' },
          { text: '💎 Баланс', callback_data: 'cmd_balance' },
        ],
      ],
    }

    if (result.filePath && fs.existsSync(result.filePath)) {
      await sendVideo(chatId, result.filePath, caption, replyMarkup)
    } else {
      await callTelegram('sendMessage', {
        chat_id: chatId,
        text: caption,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      })
    }

    if (statusMsgId) {
      void deleteMessage(chatId, statusMsgId)
    }
  } catch (err) {
    console.error('Bot video generation error:', err)
    refundBalance(userId, charge)
    const errText = err instanceof Error ? err.message : 'Неизвестная ошибка'
    updateJob(jobId, { status: 'failed', errorMessage: errText })

    if (statusMsgId) {
      void deleteMessage(chatId, statusMsgId)
    }

    await callTelegram('sendMessage', {
      chat_id: chatId,
      text: `❌ <b>Не удалось создать видео:</b>\n${errText}\n\n💎 <b>24 кристалла возвращены</b> на ваш баланс.`,
      parse_mode: 'HTML',
      reply_markup: getKeyboard(chatId),
    })
  }
}

async function handleCallback(callback: {
  id: string
  from: { id: number; first_name?: string }
  message?: { chat: { id: number }; message_id: number }
  data?: string
}) {
  const chatId = callback.message?.chat?.id ?? callback.from.id
  const data = callback.data ?? ''
  const userId = `tg_${chatId}`

  await callTelegram('answerCallbackQuery', { callback_query_id: callback.id })

  if (data === 'cmd_balance') {
    await handleBalance(chatId)
  } else if (data === 'toggle_mode') {
    const current = getUserMode(userId)
    const next = current === 'image' ? 'video' : 'image'
    setUserMode(userId, next)
    await callTelegram('sendMessage', {
      chat_id: chatId,
      text: `🔄 <b>Режим переключен:</b> <b>${next === 'image' ? '🎨 Картинки (GPT-Image 2)' : '🎬 Видео (Prism Video)'}</b>\n\nТеперь отправьте текст в чат!`,
      parse_mode: 'HTML',
      reply_markup: getKeyboard(chatId),
    })
  } else if (data === 'set_mode_image') {
    setUserMode(userId, 'image')
    await callTelegram('sendMessage', {
      chat_id: chatId,
      text: '🎨 <b>Включен режим создания картинок!</b>\n\nОтправьте в чат описание изображения, и нейросеть создаст арт в высоком разрешении без водяных знаков.',
      parse_mode: 'HTML',
      reply_markup: getKeyboard(chatId),
    })
  } else if (data === 'set_mode_video') {
    setUserMode(userId, 'video')
    await callTelegram('sendMessage', {
      chat_id: chatId,
      text: '🎬 <b>Включен режим создания видео!</b>\n\nОтправьте в чат описание сцены, и нейросеть создаст видеоролик.',
      parse_mode: 'HTML',
      reply_markup: getKeyboard(chatId),
    })
  } else if (data === 'cmd_plans') {
    await handlePlans(chatId)
  } else if (data === 'cmd_myvideos') {
    await handleMyVideos(chatId)
  } else if (data === 'cmd_model') {
    await handleModel(chatId)
  } else if (data === 'cmd_start') {
    await handleStart(chatId, { id: chatId, first_name: callback.from.first_name })
  } else if (data.startsWith('set_model_')) {
    const rawModelKey = data.replace('set_model_', '')
    let chosenModel = 'cinema-fast'
    if (rawModelKey === 'cinema') chosenModel = 'cinema-fast'
    else if (rawModelKey === 'kleo') chosenModel = 'kleo-video'

    setUserModel(userId, chosenModel)
    const displayName = getModelDisplayName(chosenModel)

    await callTelegram('sendMessage', {
      chat_id: chatId,
      text: `✅ <b>Выбрана нейросеть:</b> <b>${displayName}</b>\n\nТеперь все новые видео будут генерироваться через эту модель!`,
      parse_mode: 'HTML',
      reply_markup: getKeyboard(chatId),
    })
  } else if (data === 'cmd_example') {
    const examples = [
      'Неоновый мегаполис будущего под дождём, летающие автомобили',
      'Белый кот космонавт плывёт в невесомости на фоне Земли',
      'Древний восточный храм на вершине туманной горы на рассвете',
      'Бирюзовая океанская волна разбивается о тропический пляж',
      'Заброшенный маяк на скале во время ночного шторма',
    ]
    const chosen = examples[Math.floor(Math.random() * examples.length)]
    await callTelegram('sendMessage', {
      chat_id: chatId,
      text: `💡 <b>Идея для видео:</b>\n\n<code>${chosen}</code>\n\n<i>Нажмите на текст, чтобы скопировать его, и отправьте мне!</i>`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎬 Создать по этому промпту', callback_data: `gen_preset_${encodeURIComponent(chosen.slice(0, 30))}` }],
          [{ text: '🔄 Другая идея', callback_data: 'cmd_example' }],
        ],
      },
    })
  } else if (data.startsWith('gen_preset_')) {
    const raw = decodeURIComponent(data.replace('gen_preset_', ''))
    await handleGenerate(chatId, raw)
  } else if (data.startsWith('send_')) {
    const jobId = data.replace('send_', '')
    const job = getUserJobs(userId, 50).find((j) => j.id === jobId)
    if (job && job.video_url) {
      const filePath = `./storage${job.video_url}`
      if (fs.existsSync(filePath)) {
        await sendVideo(chatId, filePath, `🎬 <i>«${job.prompt}»</i>`, getKeyboard(chatId))
      } else {
        await callTelegram('sendMessage', { chat_id: chatId, text: `Видео доступно в Web-студии: ${job.prompt}` })
      }
    }
  } else if (data.startsWith('buy_')) {
    const planId = data.replace('buy_', '')
    const plans = getPlans()
    const plan = plans.find((p) => p.id === planId)
    if (plan) {
      const newBal = addBalance(userId, plan.crystals)
      createPayment({
        id: randomUUID(),
        userId,
        planId: plan.id,
        provider: 'demo',
        amount: plan.price_rub,
        currency: 'RUB',
        status: 'paid',
      })
      await callTelegram('sendMessage', {
        chat_id: chatId,
        text: `🎉 <b>Успешно!</b> Тариф <b>«${plan.name}»</b> активирован!\n\n💎 Начислено: <b>+${plan.crystals} кристаллов</b>\n💰 Текущий баланс: <b>${newBal} кристаллов</b>\n\nТеперь отправьте описание видео или откройте студию!`,
        parse_mode: 'HTML',
        reply_markup: getKeyboard(chatId),
      })
    }
  }
}

export async function handleUpdate(update: any) {
  if (update.callback_query) {
    void handleCallback(update.callback_query)
    return
  }

  const msg = update.message
  if (!msg?.text) return

  const text = msg.text.trim()
  const chatId = msg.chat.id
  const from = msg.from ?? { id: chatId, first_name: 'Пользователь' }

  const lower = text.toLowerCase()
  if (
    lower.startsWith('/start') ||
    lower === 'start' ||
    lower === 'старт' ||
    lower === 'привет' ||
    lower === 'hello' ||
    lower === 'меню'
  ) {
    void handleStart(chatId, from)
  } else if (lower.startsWith('/balance') || lower === 'баланс') {
    void handleBalance(chatId)
  } else if (lower.startsWith('/model') || lower.startsWith('/models') || lower === 'модель' || lower === 'нейросеть') {
    void handleModel(chatId)
  } else if (lower.startsWith('/enhance') || lower.startsWith('/gpt') || lower.startsWith('/prompt')) {
    void handleEnhance(chatId, text)
  } else if (lower.startsWith('/image') || lower.startsWith('/img') || lower.startsWith('/photo') || lower === 'картинка' || lower === 'фото') {
    void handleGenerateImage(chatId, text)
  } else if (lower.startsWith('/video') || lower === 'видео') {
    void handleGenerate(chatId, text)
  } else if (lower.startsWith('/mode') || lower === 'режим') {
    const userId = `tg_${chatId}`
    const current = getUserMode(userId)
    const next = current === 'image' ? 'video' : 'image'
    setUserMode(userId, next)
    void callTelegram('sendMessage', {
      chat_id: chatId,
      text: `🔄 <b>Активный режим переключен на:</b> <b>${next === 'image' ? '🎨 Картинки (GPT-Image 2)' : '🎬 Видео (Prism Video)'}</b>`,
      parse_mode: 'HTML',
      reply_markup: getKeyboard(chatId),
    })
  } else if (lower.startsWith('/plans') || lower.startsWith('/buy') || lower === 'тарифы') {
    void handlePlans(chatId)
  } else if (lower.startsWith('/myvideos') || lower === 'мои видео' || lower === 'галерея') {
    void handleMyVideos(chatId)
  } else if (lower.startsWith('/help') || lower === 'помощь') {
    void handleHelp(chatId)
  } else {
    const userId = `tg_${chatId}`
    const mode = getUserMode(userId)
    if (mode === 'image') {
      void handleGenerateImage(chatId, text)
    } else {
      void handleGenerate(chatId, text)
    }
  }
}

async function poll() {
  console.log('Telegram bot service started. Initializing commands and polling...')
  await setCommands()
  await callTelegram('deleteWebhook', { drop_pending_updates: false })

  while (true) {
    try {
      const response = await fetch(`${api}/getUpdates?timeout=25&offset=${offset}`, {
        signal: AbortSignal.timeout(30_000),
      })
      if (!response.ok) throw new Error(`getUpdates returned HTTP ${response.status}`)
      const result = (await response.json()) as {
        ok: boolean
        result?: Array<{
          update_id: number
          message?: {
            message_id: number
            chat: { id: number }
            from?: { id: number; first_name?: string }
            text?: string
          }
          callback_query?: {
            id: string
            from: { id: number; first_name?: string }
            message?: { chat: { id: number }; message_id: number }
            data?: string
          }
        }>
      }

      if (!result.ok) throw new Error('Telegram returned ok=false')

      for (const update of result.result ?? []) {
        offset = update.update_id + 1
        void handleUpdate(update)
      }
    } catch (error) {
      console.error('Telegram polling loop error:', error instanceof Error ? error.message : error)
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  }
}

export function startBot() {
  if (isRunning) return
  if (!token) {
    console.log('[Bot] TELEGRAM_BOT_TOKEN is not set, bot polling skipped.')
    return
  }
  isRunning = true
  void poll()
}

// Auto-start if run directly via tsx server/bot.ts
const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('server/bot.ts')
if (isMain) {
  startBot()
}
