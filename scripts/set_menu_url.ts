import dotenv from 'dotenv'

dotenv.config()

const token = process.env.TELEGRAM_BOT_TOKEN
const newUrl = process.argv[2] || process.env.MINI_APP_URL || 'https://prism-telegram-video.onrender.com'

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is missing in .env')
  process.exit(1)
}

if (!newUrl || !newUrl.startsWith('https://')) {
  console.error('Usage: npm run set-url <https://your-domain>')
  process.exit(1)
}

async function updateMenu() {
  console.log(`Setting Telegram Bot Menu Button to: ${newUrl}...`)
  const res = await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      menu_button: {
        type: 'web_app',
        text: 'Prism AI Studio',
        web_app: { url: newUrl },
      },
    }),
  })
  const data = await res.json()
  if (data.ok) {
    console.log('✅ Menu button updated successfully in Telegram to "Prism AI Studio"!')
  } else {
    console.error('❌ Failed to update menu button:', data)
  }
}

updateMenu().catch(console.error)
