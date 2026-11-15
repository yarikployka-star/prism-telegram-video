import dotenv from 'dotenv'

dotenv.config()

const TOKEN_SHOP_KEY = process.env.TOKEN_SHOP_API_KEY?.trim() || 'sk-7X5U06cmWBKdySeZN1aZH7etO1ZftOSiZXoWu4P8XSDqFQNH'
const TOKEN_SHOP_BASE = (process.env.TOKEN_SHOP_BASE_URL?.trim() || 'https://token-shop.online/v1').replace(/\/$/, '')

/**
 * Enhances a raw user prompt into a high-end cinematic video prompt using GPT-5.4 / Claude
 * via the user's Token Shop account (70M tokens available).
 */
export async function enhancePromptWithGPT(rawPrompt: string): Promise<string> {
  const prompt = rawPrompt.trim()
  if (!prompt) return prompt

  try {
    const res = await fetch(`${TOKEN_SHOP_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN_SHOP_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.4',
        messages: [
          {
            role: 'system',
            content:
              'Ты профессиональный голливудский кинорежиссёр и эксперт по промптам для видеогенераторов (Runway, Sora, Veo). Твоя задача: взять идею пользователя и превратить её в короткое, но сверх-кинематографичное описание сцены (1-2 емких предложения на русском языке): объект в деталях, кинематографичный свет, движение и ракурс камеры, реалистичная физика и атмосфера. Не используй вводных фраз вроде "Вот промпт:", отвечай только готовым текстом описания.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 180,
        temperature: 0.7,
      }),
    })

    if (!res.ok) {
      console.warn(`[GPT Enhance] API returned HTTP ${res.status}`)
      return prompt
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const enhanced = data.choices?.[0]?.message?.content?.trim()
    if (enhanced && enhanced.length > 5) {
      return enhanced
    }
  } catch (err) {
    console.error('[GPT Enhance] Error:', err instanceof Error ? err.message : err)
  }

  return prompt
}
