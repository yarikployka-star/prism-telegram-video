import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'

dotenv.config()

const STORAGE_DIR = path.resolve('storage/images')
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true })
}

export interface ImageResult {
  status: 'completed' | 'failed'
  imageUrl?: string
  filePath?: string
  provider: string
  error?: string
}

/**
 * High-resolution AI Image Generation via Token Shop (gpt-image-2)
 * 100% clean, no watermarks, powered by the user's 70M token key.
 */
export async function generateGptImage(
  jobId: string,
  prompt: string,
  _options: { aspectRatio?: string; style?: string } = {}
): Promise<ImageResult> {
  const apiKey = process.env.TOKEN_SHOP_API_KEY?.trim() || 'sk-7X5U06cmWBKdySeZN1aZH7etO1ZftOSiZXoWu4P8XSDqFQNH'
  const outPath = path.join(STORAGE_DIR, `${jobId}.png`)

  console.log(`[GPT-Image] Generating image for job ${jobId}: "${prompt.slice(0, 50)}..."`)

  const res = await fetch('https://token-shop.online/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-2',
      prompt,
      size: '1024x1024',
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`GPT Image HTTP ${res.status}: ${errText}`)
  }

  const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> }
  const b64 = json.data?.[0]?.b64_json
  const url = json.data?.[0]?.url

  if (b64) {
    const buf = Buffer.from(b64, 'base64')
    fs.writeFileSync(outPath, buf)
    return {
      status: 'completed',
      imageUrl: `/images/${jobId}.png`,
      filePath: outPath,
      provider: 'GPT-Image 2',
    }
  }

  if (url) {
    const imgRes = await fetch(url)
    if (imgRes.ok) {
      const buf = Buffer.from(await imgRes.arrayBuffer())
      fs.writeFileSync(outPath, buf)
      return {
        status: 'completed',
        imageUrl: `/images/${jobId}.png`,
        filePath: outPath,
        provider: 'GPT-Image 2',
      }
    }
  }

  throw new Error('GPT Image API не вернул данные изображения')
}
