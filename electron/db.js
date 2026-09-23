const path = require("path")
const crypto = require("crypto")
const { app } = require("electron")
const { DatabaseSync } = require("node:sqlite")

let db = null

/**
 * node:sqlite (intégré à Node depuis la 22.5, embarqué par Electron ≥ 34)
 * plutôt qu'un module natif tiers (better-sqlite3) : aucune recompilation
 * spécifique à la plateforme n'est nécessaire au packaging.
 */
function getDb() {
  if (db) return db
  const dbPath = path.join(app.getPath("userData"), "compta.sqlite3")
  db = new DatabaseSync(dbPath)
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA foreign_keys = ON")
  migrate(db)
  return db
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      security_question TEXT,
      security_answer_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      stripe_customer_id TEXT UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL,
      status TEXT NOT NULL,
      method TEXT NOT NULL,
      paid INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      member TEXT,
      method TEXT NOT NULL,
      category TEXT,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL,
      justificatif_type TEXT,
      justificatif_name TEXT,
      stripe_payment_intent_id TEXT,
      stripe_charge_id TEXT,
      stripe_fee REAL,
      stripe_net REAL,
      stripe_raw_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bank_transactions (
      id TEXT PRIMARY KEY,
      gocardless_account_id TEXT NOT NULL,
      date TEXT NOT NULL,
      description TEXT,
      amount REAL NOT NULL,
      raw_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS vault (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      salt_b64 TEXT NOT NULL,
      iv_b64 TEXT NOT NULL,
      ciphertext_b64 TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      provider TEXT PRIMARY KEY,
      cursor TEXT,
      last_synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS seasons (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS client_seasons (
      client_id TEXT NOT NULL,
      season_id TEXT NOT NULL,
      status TEXT NOT NULL,
      paid INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (client_id, season_id)
    );
  `)

  ensureColumn(db, "clients", "address", "address TEXT NOT NULL DEFAULT ''")
  // Facture réellement générée par Stripe (Stripe Invoicing) pour cette charge, quand elle existe :
  // on préfère toujours la vraie facture Stripe à celle que l'on génère nous-mêmes.
  ensureColumn(db, "transactions", "stripe_invoice_pdf_url", "stripe_invoice_pdf_url TEXT")
}

/** Ajoute une colonne à une table existante si elle n'y est pas déjà (les CREATE TABLE IF NOT EXISTS ci-dessus ne touchent pas les tables déjà créées lors d'une version antérieure). */
function ensureColumn(database, table, column, columnDdl) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all()
  if (!columns.some((c) => c.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDdl}`)
  }
}

/* ---------- Users ---------- */
function getUsers() {
  return getDb()
    .prepare(
      "SELECT id, name, email, role, security_question FROM users ORDER BY created_at",
    )
    .all()
}

function countUsers() {
  return getDb().prepare("SELECT COUNT(*) AS n FROM users").get().n
}

function findUserByEmail(email) {
  return getDb()
    .prepare("SELECT * FROM users WHERE lower(email) = lower(?)")
    .get(email.trim())
}

function createUser({ id, name, email, passwordHash, role, securityQuestion, securityAnswerHash }) {
  getDb()
    .prepare(
      `INSERT INTO users (id, name, email, password_hash, role, security_question, security_answer_hash)
       VALUES (@id, @name, @email, @passwordHash, @role, @securityQuestion, @securityAnswerHash)`,
    )
    .run({
      id,
      name,
      email,
      passwordHash,
      role,
      securityQuestion: securityQuestion ?? null,
      securityAnswerHash: securityAnswerHash ?? null,
    })
}

function updateUser(id, patch) {
  const fields = []
  const params = { id }
  for (const [key, column] of [
    ["name", "name"],
    ["email", "email"],
    ["role", "role"],
    ["passwordHash", "password_hash"],
    ["securityQuestion", "security_question"],
    ["securityAnswerHash", "security_answer_hash"],
  ]) {
    if (patch[key] !== undefined) {
      fields.push(`${column} = @${key}`)
      params[key] = patch[key]
    }
  }
  if (fields.length === 0) return
  getDb()
    .prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = @id`)
    .run(params)
}

function deleteUser(id) {
  getDb().prepare("DELETE FROM users WHERE id = ?").run(id)
}

/* ---------- Clients ---------- */
function getClients() {
  return getDb().prepare("SELECT * FROM clients ORDER BY created_at").all()
}

function createClient(client) {
  getDb()
    .prepare(
      `INSERT INTO clients (id, stripe_customer_id, first_name, last_name, email, status, method, paid, address)
       VALUES (@id, @stripeCustomerId, @firstName, @lastName, @email, @status, @method, @paid, @address)`,
    )
    .run({
      ...client,
      stripeCustomerId: client.stripeCustomerId ?? null,
      paid: client.paid ? 1 : 0,
      address: client.address ?? "",
    })
}

function upsertClientByStripeId(client) {
  const existing = getDb()
    .prepare("SELECT id FROM clients WHERE stripe_customer_id = ?")
    .get(client.stripeCustomerId)
  if (existing) {
    getDb()
      .prepare(
        `UPDATE clients SET first_name=@firstName, last_name=@lastName, email=@email, method=@method
         WHERE stripe_customer_id=@stripeCustomerId`,
      )
      .run(client)
  } else {
    createClient({
      id: `stripe_${client.stripeCustomerId}`,
      status: "Non catégorisé",
      paid: true,
      ...client,
    })
  }
}

/** Retrouve un client "invité" (sans id Stripe) : par email si connu, sinon par nom exact (pas d'email chez les invités). */
function findGuestClient({ email, firstName, lastName }) {
  if (email) {
    return getDb()
      .prepare("SELECT id, status FROM clients WHERE stripe_customer_id IS NULL AND email = ?")
      .get(email)
  }
  return getDb()
    .prepare(
      `SELECT id, status FROM clients
       WHERE stripe_customer_id IS NULL AND (email IS NULL OR email = '') AND first_name = @firstName AND last_name = @lastName`,
    )
    .get({ firstName, lastName })
}

/** Retrouve le client lié à une transaction Stripe (pour préremplir la facture avec ses infos, notamment une adresse saisie à la main). */
function findClientForTransaction(tx) {
  if (tx.method !== "stripe" || !tx.stripe_raw_json) return null
  let charge = null
  try {
    charge = JSON.parse(tx.stripe_raw_json)
  } catch {
    return null
  }
  if (charge.customer) {
    return getDb().prepare("SELECT * FROM clients WHERE stripe_customer_id = ?").get(charge.customer) ?? null
  }
  const email = charge.billing_details?.email || charge.receipt_email || null
  if (email) {
    return (
      getDb().prepare("SELECT * FROM clients WHERE stripe_customer_id IS NULL AND email = ?").get(email) ?? null
    )
  }
  if (charge.billing_details?.name) {
    const parts = charge.billing_details.name.trim().split(/\s+/)
    const firstName = parts[0]
    const lastName = parts.slice(1).join(" ") || ""
    return (
      getDb()
        .prepare(
          `SELECT * FROM clients
           WHERE stripe_customer_id IS NULL AND (email IS NULL OR email = '') AND first_name = ? AND last_name = ?`,
        )
        .get(firstName, lastName) ?? null
    )
  }
  return null
}

/** Pose le cours détecté depuis la description d'une charge, sans jamais écraser un cours déjà choisi (manuellement ou par une charge précédente). */
function applyDetectedCourseType({ stripeCustomerId, email, firstName, lastName, courseType }) {
  if (!courseType) return
  const row = stripeCustomerId
    ? getDb().prepare("SELECT id, status FROM clients WHERE stripe_customer_id = ?").get(stripeCustomerId)
    : findGuestClient({ email, firstName, lastName })
  if (!row || row.status !== "Non catégorisé") return
  getDb().prepare("UPDATE clients SET status = @status WHERE id = @id").run({ status: courseType, id: row.id })
}

/** Clients Stripe "invités" (paiement sans compte Stripe) : pas d'id client Stripe, dédupliqués par email, ou par nom si aucun email n'est fourni par Stripe. */
function upsertGuestClient(client) {
  const existing = findGuestClient(client)
  if (existing) {
    getDb()
      .prepare(
        `UPDATE clients SET first_name=@firstName, last_name=@lastName, method=@method WHERE id=@id`,
      )
      .run({
        firstName: client.firstName,
        lastName: client.lastName,
        method: client.method,
        id: existing.id,
      })
  } else {
    createClient({
      id: `guest_${crypto.randomUUID()}`,
      status: "Non catégorisé",
      paid: true,
      ...client,
      email: client.email || "",
    })
  }
}

function updateClient(id, patch) {
  const fields = []
  const params = { id }
  for (const [key, column] of [
    ["firstName", "first_name"],
    ["lastName", "last_name"],
    ["email", "email"],
    ["status", "status"],
    ["method", "method"],
    ["paid", "paid"],
    ["address", "address"],
  ]) {
    if (patch[key] !== undefined) {
      fields.push(`${column} = @${key}`)
      params[key] = key === "paid" ? (patch[key] ? 1 : 0) : patch[key]
    }
  }
  if (fields.length === 0) return
  getDb().prepare(`UPDATE clients SET ${fields.join(", ")} WHERE id = @id`).run(params)
}

function deleteClient(id) {
  getDb().prepare("DELETE FROM clients WHERE id = ?").run(id)
}

/* ---------- Transactions ---------- */
function getTransactions() {
  return getDb().prepare("SELECT * FROM transactions ORDER BY date DESC").all()
}

function getTransactionById(id) {
  return getDb().prepare("SELECT * FROM transactions WHERE id = ?").get(id)
}

function createTransaction(tx) {
  getDb()
    .prepare(
      `INSERT INTO transactions
        (id, date, description, member, method, category, type, amount, status,
         justificatif_type, justificatif_name,
         stripe_payment_intent_id, stripe_charge_id, stripe_fee, stripe_net, stripe_raw_json)
       VALUES
        (@id, @date, @description, @member, @method, @category, @type, @amount, @status,
         @justificatifType, @justificatifName,
         @stripePaymentIntentId, @stripeChargeId, @stripeFee, @stripeNet, @stripeRawJson)`,
    )
    .run({
      member: null,
      category: null,
      justificatifType: null,
      justificatifName: null,
      stripePaymentIntentId: null,
      stripeChargeId: null,
      stripeFee: null,
      stripeNet: null,
      stripeRawJson: null,
      ...tx,
    })
}

/** Insère une transaction par id si elle n'existe pas déjà (jamais de mise à jour, comme upsertTransactionByChargeId). */
function upsertTransactionById(tx) {
  const existing = getDb().prepare("SELECT id FROM transactions WHERE id = ?").get(tx.id)
  if (existing) return
  createTransaction(tx)
}

function upsertTransactionByChargeId(tx) {
  const existing = getDb()
    .prepare("SELECT id, category, status FROM transactions WHERE stripe_charge_id = ?")
    .get(tx.stripeChargeId)
  if (existing) {
    // Ne jamais écraser une catégorisation ou un statut déjà validé manuellement.
    return
  }
  createTransaction(tx)
}

function updateTransaction(id, patch) {
  const fields = []
  const params = { id }
  for (const [key, column] of [
    ["category", "category"],
    ["status", "status"],
    ["description", "description"],
    ["amount", "amount"],
    ["method", "method"],
    ["member", "member"],
    ["stripeNet", "stripe_net"],
    ["stripeInvoicePdfUrl", "stripe_invoice_pdf_url"],
  ]) {
    if (patch[key] !== undefined) {
      fields.push(`${column} = @${key}`)
      params[key] = patch[key]
    }
  }
  if (fields.length === 0) return
  getDb().prepare(`UPDATE transactions SET ${fields.join(", ")} WHERE id = @id`).run(params)
}

/* ---------- Bank transactions (GoCardless) ---------- */
function getBankTransactions() {
  return getDb().prepare("SELECT * FROM bank_transactions ORDER BY date DESC").all()
}

function insertBankTransactions(rows) {
  const database = getDb()
  const stmt = database.prepare(
    `INSERT OR IGNORE INTO bank_transactions (id, gocardless_account_id, date, description, amount, raw_json)
     VALUES (@id, @accountId, @date, @description, @amount, @rawJson)`,
  )
  database.exec("BEGIN")
  try {
    for (const row of rows) stmt.run(row)
    database.exec("COMMIT")
  } catch (err) {
    database.exec("ROLLBACK")
    throw err
  }
}

/* ---------- Settings ---------- */
function getSettings() {
  const rows = getDb().prepare("SELECT key, value FROM settings").all()
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

function setSetting(key, value) {
  getDb()
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value)
}

/* ---------- Vault ---------- */
function getVault() {
  return getDb().prepare("SELECT salt_b64, iv_b64, ciphertext_b64 FROM vault WHERE id = 1").get()
}

function setVault({ salt_b64, iv_b64, ciphertext_b64 }) {
  getDb()
    .prepare(
      `INSERT INTO vault (id, salt_b64, iv_b64, ciphertext_b64) VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET salt_b64 = excluded.salt_b64, iv_b64 = excluded.iv_b64, ciphertext_b64 = excluded.ciphertext_b64`,
    )
    .run(salt_b64, iv_b64, ciphertext_b64)
}

/* ---------- Sync state ---------- */
function getSyncState(provider) {
  return getDb().prepare("SELECT cursor, last_synced_at FROM sync_state WHERE provider = ?").get(provider)
}

function setSyncState(provider, cursor) {
  getDb()
    .prepare(
      `INSERT INTO sync_state (provider, cursor, last_synced_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(provider) DO UPDATE SET cursor = excluded.cursor, last_synced_at = excluded.last_synced_at`,
    )
    .run(provider, cursor)
}

/* ---------- Saisons ---------- */
function getSeasons() {
  return getDb().prepare("SELECT * FROM seasons ORDER BY start_date DESC").all()
}

function createSeason({ id, label, startDate, endDate }) {
  getDb()
    .prepare("INSERT INTO seasons (id, label, start_date, end_date) VALUES (@id, @label, @startDate, @endDate)")
    .run({ id, label, startDate, endDate })
}

function updateSeason(id, patch) {
  const fields = []
  const params = { id }
  for (const [key, column] of [
    ["label", "label"],
    ["startDate", "start_date"],
    ["endDate", "end_date"],
  ]) {
    if (patch[key] !== undefined) {
      fields.push(`${column} = @${key}`)
      params[key] = patch[key]
    }
  }
  if (fields.length === 0) return
  getDb().prepare(`UPDATE seasons SET ${fields.join(", ")} WHERE id = @id`).run(params)
}

function deleteSeason(id) {
  getDb().prepare("DELETE FROM seasons WHERE id = ?").run(id)
  getDb().prepare("DELETE FROM client_seasons WHERE season_id = ?").run(id)
}

/** Statut ("cours") + paiement d'un client pour une saison donnée, uniquement pour celles où ils ont été modifiés explicitement. */
function getClientSeasonMap(seasonId) {
  const rows = getDb()
    .prepare("SELECT client_id, status, paid FROM client_seasons WHERE season_id = ?")
    .all(seasonId)
  return Object.fromEntries(rows.map((r) => [r.client_id, { status: r.status, paid: !!r.paid }]))
}

function setClientSeason(clientId, seasonId, { status, paid }) {
  getDb()
    .prepare(
      `INSERT INTO client_seasons (client_id, season_id, status, paid) VALUES (@clientId, @seasonId, @status, @paid)
       ON CONFLICT(client_id, season_id) DO UPDATE SET status = excluded.status, paid = excluded.paid`,
    )
    .run({ clientId, seasonId, status, paid: paid ? 1 : 0 })
}

function getDbFilePath() {
  return path.join(app.getPath("userData"), "compta.sqlite3")
}

function closeDb() {
  if (db) {
    db.close()
    db = null
  }
}

module.exports = {
  getDb,
  getDbFilePath,
  closeDb,
  getUsers,
  countUsers,
  findUserByEmail,
  createUser,
  updateUser,
  deleteUser,
  getClients,
  createClient,
  upsertClientByStripeId,
  upsertGuestClient,
  applyDetectedCourseType,
  findClientForTransaction,
  updateClient,
  deleteClient,
  getTransactions,
  getTransactionById,
  createTransaction,
  upsertTransactionByChargeId,
  upsertTransactionById,
  updateTransaction,
  getBankTransactions,
  insertBankTransactions,
  getSettings,
  setSetting,
  getVault,
  setVault,
  getSyncState,
  setSyncState,
  getSeasons,
  createSeason,
  updateSeason,
  deleteSeason,
  getClientSeasonMap,
  setClientSeason,
}
