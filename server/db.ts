import Database from 'better-sqlite3'
import dotenv from 'dotenv'

dotenv.config()

export const db = new Database(process.env.DATABASE_PATH ?? 'prism.sqlite')
db.pragma('journal_mode = WAL')

export interface UserRow {
  id: string
  telegram_id: string | null
  balance: number
  selected_model?: string
  current_mode?: 'image' | 'video'
  created_at: string
}

export interface JobRow {
  id: string
  user_id: string
  prompt: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  type?: 'video' | 'image'
  video_url: string | null
  image_url?: string | null
  duration: string | null
  aspect_ratio: string | null
  quality: string | null
  provider: string | null
  provider_job_id: string | null
  error_message: string | null
  created_at: string
}

export interface PlanRow {
  id: string
  name: string
  price_rub: number
  crystals: number
  subscription_days: number
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      telegram_id TEXT UNIQUE,
      balance INTEGER NOT NULL DEFAULT 240,
      selected_model TEXT DEFAULT 'runway',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      prompt TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('queued','processing','completed','failed')),
      video_url TEXT,
      duration TEXT DEFAULT '8 сек',
      aspect_ratio TEXT DEFAULT '16:9',
      quality TEXT DEFAULT '720p',
      provider TEXT,
      provider_job_id TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price_rub INTEGER NOT NULL,
      crystals INTEGER NOT NULL,
      subscription_days INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      plan_id TEXT NOT NULL REFERENCES plans(id),
      status TEXT NOT NULL CHECK(status IN ('active','cancelled','expired')),
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      plan_id TEXT NOT NULL REFERENCES plans(id),
      provider TEXT NOT NULL CHECK(provider IN ('demo','sbp','crypto','stars')),
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','paid','failed','refunded')),
      provider_payment_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // Migrate existing jobs table columns if they do not exist
  const existingJobColumns = db.prepare("PRAGMA table_info(jobs)").all() as Array<{ name: string }>
  const columnNames = new Set(existingJobColumns.map((c) => c.name))
  if (!columnNames.has('duration')) {
    try { db.exec("ALTER TABLE jobs ADD COLUMN duration TEXT DEFAULT '8 сек'") } catch {}
  }
  if (!columnNames.has('aspect_ratio')) {
    try { db.exec("ALTER TABLE jobs ADD COLUMN aspect_ratio TEXT DEFAULT '16:9'") } catch {}
  }
  if (!columnNames.has('quality')) {
    try { db.exec("ALTER TABLE jobs ADD COLUMN quality TEXT DEFAULT '720p'") } catch {}
  }
  if (!columnNames.has('provider')) {
    try { db.exec("ALTER TABLE jobs ADD COLUMN provider TEXT") } catch {}
  }
  if (!columnNames.has('provider_job_id')) {
    try { db.exec("ALTER TABLE jobs ADD COLUMN provider_job_id TEXT") } catch {}
  }
  if (!columnNames.has('error_message')) {
    try { db.exec("ALTER TABLE jobs ADD COLUMN error_message TEXT") } catch {}
  }
  if (!columnNames.has('type')) {
    try { db.exec("ALTER TABLE jobs ADD COLUMN type TEXT DEFAULT 'video'") } catch {}
  }
  if (!columnNames.has('image_url')) {
    try { db.exec("ALTER TABLE jobs ADD COLUMN image_url TEXT") } catch {}
  }

  // Migrate users table columns if needed
  const existingUserColumns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>
  const userColNames = new Set(existingUserColumns.map((c) => c.name))
  if (!userColNames.has('selected_model')) {
    try { db.exec("ALTER TABLE users ADD COLUMN selected_model TEXT DEFAULT 'runway'") } catch {}
  }
  if (!userColNames.has('current_mode')) {
    try { db.exec("ALTER TABLE users ADD COLUMN current_mode TEXT DEFAULT 'image'") } catch {}
  }

  // Re-check payments table check constraint for 'demo'
  try {
    const paymentCheck = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'payments'").get() as { sql: string } | undefined
    if (paymentCheck?.sql && !paymentCheck.sql.includes('demo')) {
      // Recreate table with updated check constraint
      db.exec(`
        CREATE TABLE payments_new (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id),
          plan_id TEXT NOT NULL REFERENCES plans(id),
          provider TEXT NOT NULL CHECK(provider IN ('demo','sbp','crypto','stars')),
          amount INTEGER NOT NULL,
          currency TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('pending','paid','failed','refunded')),
          provider_payment_id TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO payments_new SELECT * FROM payments;
        DROP TABLE payments;
        ALTER TABLE payments_new RENAME TO payments;
      `)
    }
  } catch {}

  db.prepare('INSERT OR IGNORE INTO users (id, balance) VALUES (?, ?)').run('demo', 240)
  const insertPlan = db.prepare('INSERT OR IGNORE INTO plans (id, name, price_rub, crystals, subscription_days) VALUES (?, ?, ?, ?, ?)')
  insertPlan.run('starter', 'Старт', 199, 120, 0)
  insertPlan.run('flow', 'Поток', 599, 480, 30)
  insertPlan.run('studio', 'Студия', 1299, 1200, 30)
}

export function getOrCreateUser(id: string, telegramId?: string | number | null, defaultBalance = 240): UserRow {
  const tgIdStr = telegramId ? String(telegramId) : null
  let user: UserRow | undefined

  if (tgIdStr) {
    user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(tgIdStr) as UserRow | undefined
  }
  if (!user) {
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
  }
  if (!user) {
    db.prepare('INSERT INTO users (id, telegram_id, balance) VALUES (?, ?, ?)').run(id, tgIdStr, defaultBalance)
    user = { id, telegram_id: tgIdStr, balance: defaultBalance, created_at: new Date().toISOString() }
  } else if (tgIdStr && !user.telegram_id) {
    db.prepare('UPDATE users SET telegram_id = ? WHERE id = ?').run(tgIdStr, user.id)
    user.telegram_id = tgIdStr
  }
  return user
}

export function getUser(id: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
}

export function getUserByTelegramId(telegramId: string | number): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(String(telegramId)) as UserRow | undefined
}

export function deductBalance(userId: string, amount: number): boolean {
  const result = db.prepare('UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?').run(amount, userId, amount)
  return result.changes > 0
}

export function refundBalance(userId: string, amount: number): void {
  db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, userId)
}

export function addBalance(userId: string, amount: number): number {
  db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, userId)
  const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId) as { balance: number } | undefined
  return user?.balance ?? 0
}

export function createJob(params: {
  id: string
  userId: string
  prompt: string
  status?: JobRow['status']
  type?: 'video' | 'image'
  videoUrl?: string | null
  imageUrl?: string | null
  duration?: string
  aspectRatio?: string
  quality?: string
  provider?: string
}) {
  db.prepare(`
    INSERT INTO jobs (id, user_id, prompt, status, type, video_url, image_url, duration, aspect_ratio, quality, provider)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.id,
    params.userId,
    params.prompt,
    params.status ?? 'processing',
    params.type ?? 'video',
    params.videoUrl ?? null,
    params.imageUrl ?? null,
    params.duration ?? '8 сек',
    params.aspectRatio ?? '16:9',
    params.quality ?? '720p',
    params.provider ?? null,
  )
}

export function updateJob(
  id: string,
  data: {
    status?: JobRow['status']
    videoUrl?: string | null
    imageUrl?: string | null
    provider?: string | null
    providerJobId?: string | null
    errorMessage?: string | null
  },
) {
  const updates: string[] = []
  const values: any[] = []

  if (data.status !== undefined) {
    updates.push('status = ?')
    values.push(data.status)
  }
  if (data.videoUrl !== undefined) {
    updates.push('video_url = ?')
    values.push(data.videoUrl)
  }
  if (data.imageUrl !== undefined) {
    updates.push('image_url = ?')
    values.push(data.imageUrl)
  }
  if (data.provider !== undefined) {
    updates.push('provider = ?')
    values.push(data.provider)
  }
  if (data.providerJobId !== undefined) {
    updates.push('provider_job_id = ?')
    values.push(data.providerJobId)
  }
  if (data.errorMessage !== undefined) {
    updates.push('error_message = ?')
    values.push(data.errorMessage)
  }

  if (updates.length > 0) {
    values.push(id)
    db.prepare(`UPDATE jobs SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  }
}

export function getJob(id: string): JobRow | undefined {
  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow | undefined
}

export function getUserJobs(userId: string, limit = 20): JobRow[] {
  return db.prepare('SELECT * FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit) as JobRow[]
}

export function getPlans(): PlanRow[] {
  return db.prepare('SELECT id, name, price_rub, crystals, subscription_days FROM plans ORDER BY price_rub').all() as PlanRow[]
}

export function createPayment(params: {
  id: string
  userId: string
  planId: string
  provider: 'demo' | 'sbp' | 'crypto' | 'stars'
  amount: number
  currency?: string
  status?: 'pending' | 'paid' | 'failed' | 'refunded'
}) {
  db.prepare(`
    INSERT INTO payments (id, user_id, plan_id, provider, amount, currency, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.id,
    params.userId,
    params.planId,
    params.provider,
    params.amount,
    params.currency ?? 'RUB',
    params.status ?? 'pending',
  )
}

export function getUserModel(userId: string): string {
  try {
    const row = db.prepare('SELECT selected_model FROM users WHERE id = ?').get(userId) as { selected_model?: string } | undefined
    const model = row?.selected_model
    if (
      !model ||
      model === 'runway' ||
      model.startsWith('fal-ai') ||
      model.startsWith('hailuo') ||
      model.startsWith('veo') ||
      model.startsWith('grok')
    ) {
      return 'cinema-fast'
    }
    return model
  } catch {
    return 'cinema-fast'
  }
}

export function setUserModel(userId: string, model: string): void {
  try {
    db.prepare('UPDATE users SET selected_model = ? WHERE id = ?').run(model, userId)
  } catch (err) {
    console.error('Error setting user model:', err)
  }
}

export function getUserMode(userId: string): 'image' | 'video' {
  try {
    const row = db.prepare('SELECT current_mode FROM users WHERE id = ?').get(userId) as { current_mode?: string } | undefined
    return row?.current_mode === 'video' ? 'video' : 'image'
  } catch {
    return 'image'
  }
}

export function setUserMode(userId: string, mode: 'image' | 'video'): void {
  try {
    db.prepare('UPDATE users SET current_mode = ? WHERE id = ?').run(mode, userId)
  } catch (err) {
    console.error('Error setting user mode:', err)
  }
}
