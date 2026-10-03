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

    CREATE TABLE IF NOT EXISTS import_batches (
      id TEXT PRIMARY KEY,
      created_count INTEGER NOT NULL DEFAULT 0,
      updated_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      undone INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS import_batch_changes (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      previous_json TEXT
    );

    CREATE TABLE IF NOT EXISTS fixed_assets (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      purchase_amount REAL NOT NULL,
      purchase_date TEXT NOT NULL,
      depreciation_years INTEGER NOT NULL,
      disposed INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS debts (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      due_date TEXT,
      settled INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cotisation_prices (
      course_type TEXT PRIMARY KEY,
      price REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS equipment_items (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      stock_quantity INTEGER NOT NULL DEFAULT 0,
      purchase_price REAL NOT NULL DEFAULT 0,
      sale_price REAL NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS disciplines (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL UNIQUE,
      price REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payers (
      id TEXT PRIMARY KEY,
      stripe_customer_id TEXT UNIQUE,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      postal_code TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  ensureColumn(db, "clients", "address", "address TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, "clients", "phone", "phone TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, "clients", "birth_date", "birth_date TEXT")
  ensureColumn(db, "clients", "postal_code", "postal_code TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, "clients", "city", "city TEXT NOT NULL DEFAULT ''")
  // "guardian_id" n'est plus utilisé par le code (voir payer_id / migratePayersBackfill ci-dessous)
  // mais la colonne reste en base — comme pour cotisation_prices, on ne DROP jamais une colonne qui
  // contenait des données réelles, au cas où une ancienne sauvegarde/export y ferait encore référence.
  ensureColumn(db, "clients", "guardian_id", "guardian_id TEXT")
  ensureColumn(db, "clients", "payer_id", "payer_id TEXT")
  // Facture réellement générée par Stripe (Stripe Invoicing) pour cette charge, quand elle existe :
  // on préfère toujours la vraie facture Stripe à celle que l'on génère nous-mêmes.
  ensureColumn(db, "transactions", "stripe_invoice_pdf_url", "stripe_invoice_pdf_url TEXT")

  migrateSeasonMembershipBackfill(db)
  migrateDisciplinesBackfill(db)
  migratePayersBackfill(db)
}

/** Les disciplines étaient une liste fixe codée en dur ("Kung-fu Adulte", "Ado", "Enfant"…) : on la
 * transforme en liste librement modifiable par le trésorier (ajout, suppression, prix), comme pour
 * le matériel. Pour ne rien perdre, on importe une fois pour toutes les anciennes disciplines fixes
 * (avec leur tarif déjà configuré dans cotisation_prices, s'il existe) et toute valeur de "cours"
 * déjà utilisée par un client — ainsi aucune fiche existante ne se retrouve avec un cours orphelin. */
function migrateDisciplinesBackfill(db) {
  const already = db.prepare("SELECT value FROM settings WHERE key = 'disciplinesMigrated'").get()
  if (already) return

  const legacyCourseTypes = [
    "Kung-fu Adulte",
    "Kung-fu Ado",
    "Kung-fu Enfant",
    "Fitness de combat",
    "Tai-chi",
    "Self-défense",
  ]
  const usedStatuses = db
    .prepare("SELECT DISTINCT status FROM clients WHERE status IS NOT NULL AND status <> 'Non catégorisé'")
    .all()
    .map((r) => r.status)
  const prices = Object.fromEntries(
    db.prepare("SELECT course_type, price FROM cotisation_prices").all().map((r) => [r.course_type, r.price]),
  )

  const labels = new Set([...legacyCourseTypes, ...usedStatuses])
  const insert = db.prepare(
    `INSERT INTO disciplines (id, label, price) VALUES (@id, @label, @price)
     ON CONFLICT(label) DO NOTHING`,
  )
  for (const label of labels) {
    insert.run({ id: crypto.randomUUID(), label, price: prices[label] ?? 0 })
  }

  db.prepare("INSERT INTO settings (key, value) VALUES ('disciplinesMigrated', '1')").run()
}

/** Un "client" mélangeait jusqu'ici deux rôles différents : l'adhérent (celui qui suit un cours) et
 * le payeur (celui qui règle — souvent un parent, pas forcément lui-même adhérent). On les sépare :
 * chaque adhérent garde sa fiche (cours, statut payé) mais pointe désormais vers une fiche "payeur"
 * distincte (payer_id) au lieu de pointer vers une autre fiche client (guardian_id). Ne s'exécute
 * qu'une fois ; ne supprime jamais de fiche existante (trop risqué sur des données réelles) — les
 * anciennes fiches "tuteur" qui n'étaient en fait que des payeurs restent visibles dans Adhérents
 * jusqu'à ce que le trésorier les nettoie lui-même depuis l'écran dédié. */
function migratePayersBackfill(db) {
  const already = db.prepare("SELECT value FROM settings WHERE key = 'payersMigrated'").get()
  if (already) return

  const clients = db.prepare("SELECT * FROM clients").all()
  const insertPayer = db.prepare(
    `INSERT INTO payers (id, stripe_customer_id, first_name, last_name, email, phone, address, postal_code, city)
     VALUES (@id, @stripeCustomerId, @firstName, @lastName, @email, @phone, @address, @postalCode, @city)`,
  )
  const setPayerId = db.prepare("UPDATE clients SET payer_id = @payerId WHERE id = @clientId")

  // clientId de la personne "résolue" comme payeur -> id du payer déjà créé pour elle (une fratrie
  // partageant le même tuteur ne doit donner naissance qu'à un seul payeur, pas un par enfant).
  const payerIdByResolvedClientId = new Map()

  function resolvePayerClientId(client) {
    if (!client.guardian_id) return client.id
    const guardian = clients.find((c) => c.id === client.guardian_id)
    return guardian ? guardian.id : client.id
  }

  for (const client of clients) {
    const resolvedId = resolvePayerClientId(client)
    let payerId = payerIdByResolvedClientId.get(resolvedId)
    if (!payerId) {
      const source = clients.find((c) => c.id === resolvedId) || client
      payerId = crypto.randomUUID()
      insertPayer.run({
        id: payerId,
        stripeCustomerId: source.stripe_customer_id || null,
        firstName: source.first_name,
        lastName: source.last_name,
        email: source.email || "",
        phone: source.phone || "",
        address: source.address || "",
        postalCode: source.postal_code || "",
        city: source.city || "",
      })
      payerIdByResolvedClientId.set(resolvedId, payerId)
    }
    setPayerId.run({ payerId, clientId: client.id })
  }

  db.prepare("INSERT INTO settings (key, value) VALUES ('payersMigrated', '1')").run()
}

/** Avant cette fonctionnalité, "client_seasons" ne servait qu'à surclasser cours/payé : une
 * saison sans ligne explicite affichait quand même tous les clients (repli sur la fiche globale).
 * On bascule désormais vers une vraie appartenance par saison (un client n'apparaît que s'il a une
 * ligne "client_seasons"), donc pour ne pas vider d'un coup une saison déjà utilisée, on inscrit une
 * fois pour toutes tous les clients actuels dans chaque saison existante qui n'a encore aucune ligne.
 * Ne s'exécute qu'une seule fois (marqueur en base) : les saisons créées après ce passage démarrent
 * volontairement avec un effectif vide, comme demandé. */
function migrateSeasonMembershipBackfill(db) {
  const already = db.prepare("SELECT value FROM settings WHERE key = 'seasonMembershipMigrated'").get()
  if (already) return

  const seasons = db.prepare("SELECT id FROM seasons").all()
  const clients = db.prepare("SELECT id, status, paid FROM clients").all()
  const insert = db.prepare(
    `INSERT INTO client_seasons (client_id, season_id, status, paid)
     VALUES (@clientId, @seasonId, @status, @paid)
     ON CONFLICT(client_id, season_id) DO NOTHING`,
  )
  for (const season of seasons) {
    const count = db.prepare("SELECT COUNT(*) AS n FROM client_seasons WHERE season_id = ?").get(season.id).n
    if (count > 0) continue
    for (const client of clients) {
      insert.run({ clientId: client.id, seasonId: season.id, status: client.status, paid: client.paid })
    }
  }
  db.prepare("INSERT INTO settings (key, value) VALUES ('seasonMembershipMigrated', '1')").run()
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
      `INSERT INTO clients (id, first_name, last_name, email, status, method, paid, address, phone, birth_date, postal_code, city, payer_id)
       VALUES (@id, @firstName, @lastName, @email, @status, @method, @paid, @address, @phone, @birthDate, @postalCode, @city, @payerId)`,
    )
    .run({
      ...client,
      paid: client.paid ? 1 : 0,
      address: client.address ?? "",
      phone: client.phone ?? "",
      birthDate: client.birthDate ?? null,
      postalCode: client.postalCode ?? "",
      city: client.city ?? "",
      payerId: client.payerId ?? null,
    })
}

function getClientById(id) {
  return getDb().prepare("SELECT * FROM clients WHERE id = ?").get(id) ?? null
}

/* ---------- Payeurs (identité de facturation — distincte des adhérents, voir migratePayersBackfill) ---------- */
function getPayers() {
  return getDb().prepare("SELECT * FROM payers ORDER BY created_at").all()
}

function getPayerById(id) {
  if (!id) return null
  return getDb().prepare("SELECT * FROM payers WHERE id = ?").get(id) ?? null
}

function createPayer(payer) {
  const id = payer.id || crypto.randomUUID()
  getDb()
    .prepare(
      `INSERT INTO payers (id, stripe_customer_id, first_name, last_name, email, phone, address, postal_code, city)
       VALUES (@id, @stripeCustomerId, @firstName, @lastName, @email, @phone, @address, @postalCode, @city)`,
    )
    .run({
      id,
      stripeCustomerId: payer.stripeCustomerId ?? null,
      firstName: payer.firstName || "",
      lastName: payer.lastName || "",
      email: payer.email || "",
      phone: payer.phone || "",
      address: payer.address || "",
      postalCode: payer.postalCode || "",
      city: payer.city || "",
    })
  return id
}

function updatePayer(id, patch) {
  const fields = []
  const params = { id }
  for (const [key, column] of [
    ["firstName", "first_name"],
    ["lastName", "last_name"],
    ["email", "email"],
    ["phone", "phone"],
    ["address", "address"],
    ["postalCode", "postal_code"],
    ["city", "city"],
  ]) {
    if (patch[key] !== undefined) {
      fields.push(`${column} = @${key}`)
      params[key] = patch[key]
    }
  }
  if (fields.length === 0) return
  getDb().prepare(`UPDATE payers SET ${fields.join(", ")} WHERE id = @id`).run(params)
}

function deletePayer(id) {
  // Jamais de suppression en cascade : les adhérents liés perdent juste leur payeur (plutôt que
  // d'être supprimés eux aussi), le trésorier devra leur en choisir un autre s'il en faut un.
  getDb().prepare("UPDATE clients SET payer_id = NULL WHERE payer_id = ?").run(id)
  getDb().prepare("DELETE FROM payers WHERE id = ?").run(id)
}

/** Retrouve un payeur existant pour l'import/le rapprochement : par email (insensible à la casse)
 * en priorité, sinon par prénom+nom exacts (insensible à la casse). */
function findPayerForImport({ email, firstName, lastName }) {
  if (email) {
    const match = getDb()
      .prepare("SELECT * FROM payers WHERE email <> '' AND lower(email) = lower(@email)")
      .get({ email })
    if (match) return match
  }
  return getDb()
    .prepare(`SELECT * FROM payers WHERE lower(first_name) = lower(@firstName) AND lower(last_name) = lower(@lastName)`)
    .get({ firstName, lastName })
}

/** S'assure qu'un adhérent a un payeur (le crée depuis sa propre fiche s'il n'en a pas déjà un) et
 * retourne son id — utilisé quand on choisit "cet adhérent" comme payeur d'un autre (ex. un grand
 * frère qui règle pour sa sœur) : on réutilise son payeur existant plutôt que d'en recréer un. */
function ensurePayerForClient(clientId) {
  const client = getClientById(clientId)
  if (!client) return null
  if (client.payer_id) return client.payer_id
  const payerId = createPayer({
    firstName: client.first_name,
    lastName: client.last_name,
    email: client.email || "",
    phone: client.phone || "",
    address: client.address || "",
    postalCode: client.postal_code || "",
    city: client.city || "",
  })
  getDb().prepare("UPDATE clients SET payer_id = @payerId WHERE id = @id").run({ payerId, id: clientId })
  return payerId
}

function upsertPayerByStripeId(payer) {
  const existing = getDb().prepare("SELECT id FROM payers WHERE stripe_customer_id = ?").get(payer.stripeCustomerId)
  if (existing) {
    getDb()
      .prepare(
        `UPDATE payers SET first_name=@firstName, last_name=@lastName, email=@email WHERE stripe_customer_id=@stripeCustomerId`,
      )
      .run(payer)
    return existing.id
  }
  return createPayer(payer)
}

/** Payeur "invité" Stripe (paiement sans compte client Stripe) : pas d'id Stripe, déduplication par
 * email, ou par nom si Stripe ne fournit aucun email. */
function findGuestPayer({ email, firstName, lastName }) {
  if (email) {
    return getDb().prepare("SELECT id FROM payers WHERE stripe_customer_id IS NULL AND email = ?").get(email)
  }
  return getDb()
    .prepare(
      `SELECT id FROM payers
       WHERE stripe_customer_id IS NULL AND (email IS NULL OR email = '') AND first_name = @firstName AND last_name = @lastName`,
    )
    .get({ firstName, lastName })
}

function upsertGuestPayer(payer) {
  const existing = findGuestPayer(payer)
  if (existing) {
    getDb()
      .prepare(`UPDATE payers SET first_name=@firstName, last_name=@lastName WHERE id=@id`)
      .run({ firstName: payer.firstName, lastName: payer.lastName, id: existing.id })
    return existing.id
  }
  return createPayer({ ...payer, email: payer.email || "" })
}

/** Retrouve le payeur lié à une transaction Stripe (pour préremplir la facture avec son identité de
 * facturation — nom/adresse —, qui n'est pas forcément celle de l'adhérent qui suit le cours). */
function findPayerForTransaction(tx) {
  if (tx.method !== "stripe" || !tx.stripe_raw_json) return null
  let charge = null
  try {
    charge = JSON.parse(tx.stripe_raw_json)
  } catch {
    return null
  }
  if (charge.customer) {
    return getDb().prepare("SELECT * FROM payers WHERE stripe_customer_id = ?").get(charge.customer) ?? null
  }
  const email = charge.billing_details?.email || charge.receipt_email || null
  if (email) {
    return getDb().prepare("SELECT * FROM payers WHERE stripe_customer_id IS NULL AND email = ?").get(email) ?? null
  }
  if (charge.billing_details?.name) {
    const parts = charge.billing_details.name.trim().split(/\s+/)
    const firstName = parts[0]
    const lastName = parts.slice(1).join(" ") || ""
    return (
      getDb()
        .prepare(
          `SELECT * FROM payers
           WHERE stripe_customer_id IS NULL AND (email IS NULL OR email = '') AND first_name = ? AND last_name = ?`,
        )
        .get(firstName, lastName) ?? null
    )
  }
  return null
}

/** Inscrit un client dans la saison active s'il n'y est pas déjà (les saisons démarrent vides,
 * donc tout client créé/retrouvé par une synchro doit explicitement les rejoindre pour être
 * visible) ; sans saison active, ne fait rien (comportement historique, aucun filtre). */
function enrollInActiveSeasonIfNeeded(clientId, status) {
  const activeSeasonId = getSettings().activeSeasonId
  if (!activeSeasonId) return
  const already = getDb()
    .prepare("SELECT 1 FROM client_seasons WHERE client_id = @clientId AND season_id = @activeSeasonId")
    .get({ clientId, activeSeasonId })
  if (already) return
  setClientSeason(clientId, activeSeasonId, { status: status || "Non catégorisé", paid: false })
}

/** Retrouve TOUS les clients partageant un même email exact (insensible à la casse), sans repli
 * sur le nom — un email peut être partagé par plusieurs personnes différentes (ex. parent/enfant),
 * donc on ne s'arrête jamais au premier résultat trouvé. */
function findClientsByEmail(email) {
  if (!email) return []
  return getDb()
    .prepare("SELECT * FROM clients WHERE email <> '' AND lower(email) = lower(@email)")
    .all({ email })
}

/** Retrouve un client existant pour l'import Excel : par email (insensible à la casse) en priorité, sinon par prénom+nom exacts (insensible à la casse). */
function findClientForImport({ email, firstName, lastName }) {
  if (email) {
    const match = getDb()
      .prepare("SELECT * FROM clients WHERE email <> '' AND lower(email) = lower(@email)")
      .get({ email })
    if (match) return match
  }
  return getDb()
    .prepare(
      `SELECT * FROM clients WHERE lower(first_name) = lower(@firstName) AND lower(last_name) = lower(@lastName)`,
    )
    .get({ firstName, lastName })
}

/** Pose le cours détecté depuis la description d'une charge Stripe sur l'adhérent lié au payeur de
 * cette charge — jamais sur le payeur lui-même, qui n'a pas de cours. Si le payeur n'est lié à
 * aucun adhérent, ou à plusieurs (ex. deux enfants), on ne devine jamais lequel : le trésorier
 * catégorise à la main. N'écrase jamais non plus un cours déjà choisi. */
function applyDetectedCourseType({ stripeCustomerId, email, firstName, lastName, courseType }) {
  if (!courseType) return
  const payer = stripeCustomerId
    ? getDb().prepare("SELECT id FROM payers WHERE stripe_customer_id = ?").get(stripeCustomerId)
    : findGuestPayer({ email, firstName, lastName })
  if (!payer) return

  const linkedClients = getDb()
    .prepare("SELECT id, status FROM clients WHERE payer_id = ? AND status = 'Non catégorisé'")
    .all(payer.id)
  if (linkedClients.length !== 1) return
  const row = linkedClients[0]

  getDb().prepare("UPDATE clients SET status = @status WHERE id = @id").run({ status: courseType, id: row.id })

  // Si cet adhérent est déjà inscrit à la saison active avec un cours encore indéterminé, on
  // répercute le cours détecté sur son inscription (sinon la page Clients resterait figée
  // sur "Non catégorisé" malgré la mise à jour de sa fiche globale ci-dessus).
  const activeSeasonId = getSettings().activeSeasonId
  if (!activeSeasonId) return
  const seasonRow = getDb()
    .prepare("SELECT status FROM client_seasons WHERE client_id = @id AND season_id = @activeSeasonId")
    .get({ id: row.id, activeSeasonId })
  if (seasonRow && seasonRow.status === "Non catégorisé") {
    getDb()
      .prepare(
        "UPDATE client_seasons SET status = @status WHERE client_id = @id AND season_id = @activeSeasonId",
      )
      .run({ status: courseType, id: row.id, activeSeasonId })
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
    ["phone", "phone"],
    ["birthDate", "birth_date"],
    ["postalCode", "postal_code"],
    ["city", "city"],
    ["payerId", "payer_id"],
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
  getDb().prepare("DELETE FROM client_seasons WHERE client_id = ?").run(id)
}

/* ---------- Lots d'import (Excel clients) : traçabilité pour permettre l'annulation ---------- */
function createImportBatch({ id, createdCount, updatedCount, skippedCount }) {
  getDb()
    .prepare(
      `INSERT INTO import_batches (id, created_count, updated_count, skipped_count)
       VALUES (@id, @createdCount, @updatedCount, @skippedCount)`,
    )
    .run({ id, createdCount, updatedCount, skippedCount })
}

function addImportBatchChange({ id, batchId, clientId, kind, previousJson }) {
  getDb()
    .prepare(
      `INSERT INTO import_batch_changes (id, batch_id, client_id, kind, previous_json)
       VALUES (@id, @batchId, @clientId, @kind, @previousJson)`,
    )
    .run({ id, batchId, clientId, kind, previousJson: previousJson ?? null })
}

function getImportBatches() {
  return getDb()
    .prepare("SELECT * FROM import_batches ORDER BY created_at DESC LIMIT 10")
    .all()
}

function getImportBatchChanges(batchId) {
  return getDb().prepare("SELECT * FROM import_batch_changes WHERE batch_id = ?").all(batchId)
}

function markImportBatchUndone(batchId) {
  getDb().prepare("UPDATE import_batches SET undone = 1 WHERE id = ?").run(batchId)
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
    .prepare("SELECT id FROM transactions WHERE stripe_charge_id = ?")
    .get(tx.stripeChargeId)
  if (existing) {
    // On rafraîchit les champs purement issus de Stripe à chaque resynchro (ex. une description
    // modifiée depuis le Dashboard Stripe après coup, ou le payload brut dont dépend l'affichage
    // des remboursements) — mais jamais la catégorie, le statut ou l'adhérent lié : ce sont des
    // choix du trésorier, une resynchro ne doit jamais les écraser.
    getDb()
      .prepare(
        `UPDATE transactions
         SET description = @description, amount = @amount, stripe_fee = @stripeFee,
             stripe_net = @stripeNet, stripe_payment_intent_id = @stripePaymentIntentId,
             stripe_raw_json = @stripeRawJson
         WHERE id = @id`,
      )
      .run({
        id: existing.id,
        description: tx.description,
        amount: tx.amount,
        stripeFee: tx.stripeFee ?? null,
        stripeNet: tx.stripeNet ?? null,
        stripePaymentIntentId: tx.stripePaymentIntentId ?? null,
        stripeRawJson: tx.stripeRawJson ?? null,
      })
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

/** Statut ("cours") + paiement des clients INSCRITS à cette saison : une ligne "client_seasons"
 * vaut à la fois appartenance (le client fait partie de l'effectif de la saison) et surclassement
 * de son cours/paiement pour cette période. */
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

/** Désinscrit un client d'une saison (la fiche client elle-même n'est jamais supprimée). */
function deleteClientSeason(clientId, seasonId) {
  getDb().prepare("DELETE FROM client_seasons WHERE client_id = ? AND season_id = ?").run(clientId, seasonId)
}

/** Vide l'effectif d'une saison (tous les clients désinscrits) sans supprimer la saison elle-même. */
function resetSeasonClients(seasonId) {
  getDb().prepare("DELETE FROM client_seasons WHERE season_id = ?").run(seasonId)
}

/* ---------- Immobilisations (matériel à amortir) ---------- */
function getFixedAssets() {
  return getDb().prepare("SELECT * FROM fixed_assets ORDER BY purchase_date DESC").all()
}

function createFixedAsset(asset) {
  getDb()
    .prepare(
      `INSERT INTO fixed_assets (id, label, purchase_amount, purchase_date, depreciation_years, disposed, notes)
       VALUES (@id, @label, @purchaseAmount, @purchaseDate, @depreciationYears, @disposed, @notes)`,
    )
    .run({
      ...asset,
      disposed: asset.disposed ? 1 : 0,
      notes: asset.notes ?? "",
    })
}

function updateFixedAsset(id, patch) {
  const fields = []
  const params = { id }
  for (const [key, column] of [
    ["label", "label"],
    ["purchaseAmount", "purchase_amount"],
    ["purchaseDate", "purchase_date"],
    ["depreciationYears", "depreciation_years"],
    ["disposed", "disposed"],
    ["notes", "notes"],
  ]) {
    if (patch[key] !== undefined) {
      fields.push(`${column} = @${key}`)
      params[key] = key === "disposed" ? (patch[key] ? 1 : 0) : patch[key]
    }
  }
  if (fields.length === 0) return
  getDb().prepare(`UPDATE fixed_assets SET ${fields.join(", ")} WHERE id = @id`).run(params)
}

function deleteFixedAsset(id) {
  getDb().prepare("DELETE FROM fixed_assets WHERE id = ?").run(id)
}

/* ---------- Dettes ---------- */
function getDebts() {
  return getDb().prepare("SELECT * FROM debts ORDER BY date DESC").all()
}

function createDebt(debt) {
  getDb()
    .prepare(
      `INSERT INTO debts (id, label, amount, date, due_date, settled, notes)
       VALUES (@id, @label, @amount, @date, @dueDate, @settled, @notes)`,
    )
    .run({
      ...debt,
      dueDate: debt.dueDate ?? null,
      settled: debt.settled ? 1 : 0,
      notes: debt.notes ?? "",
    })
}

function updateDebt(id, patch) {
  const fields = []
  const params = { id }
  for (const [key, column] of [
    ["label", "label"],
    ["amount", "amount"],
    ["date", "date"],
    ["dueDate", "due_date"],
    ["settled", "settled"],
    ["notes", "notes"],
  ]) {
    if (patch[key] !== undefined) {
      fields.push(`${column} = @${key}`)
      params[key] = key === "settled" ? (patch[key] ? 1 : 0) : patch[key]
    }
  }
  if (fields.length === 0) return
  getDb().prepare(`UPDATE debts SET ${fields.join(", ")} WHERE id = @id`).run(params)
}

function deleteDebt(id) {
  getDb().prepare("DELETE FROM debts WHERE id = ?").run(id)
}

/* ---------- Tarifs des cotisations (par cours), pour retrouver automatiquement le cours payé ---------- */
function getCotisationPrices() {
  const rows = getDb().prepare("SELECT course_type, price FROM cotisation_prices").all()
  return Object.fromEntries(rows.map((r) => [r.course_type, r.price]))
}

function setCotisationPrice(courseType, price) {
  getDb()
    .prepare(
      `INSERT INTO cotisation_prices (course_type, price) VALUES (@courseType, @price)
       ON CONFLICT(course_type) DO UPDATE SET price = excluded.price`,
    )
    .run({ courseType, price })
}

/* ---------- Matériel / stock d'équipements ---------- */
function getEquipmentItems() {
  return getDb().prepare("SELECT * FROM equipment_items ORDER BY label").all()
}

function createEquipmentItem(item) {
  getDb()
    .prepare(
      `INSERT INTO equipment_items (id, label, stock_quantity, purchase_price, sale_price, notes)
       VALUES (@id, @label, @stockQuantity, @purchasePrice, @salePrice, @notes)`,
    )
    .run({ ...item, notes: item.notes ?? "" })
}

function updateEquipmentItem(id, patch) {
  const fields = []
  const params = { id }
  for (const [key, column] of [
    ["label", "label"],
    ["stockQuantity", "stock_quantity"],
    ["purchasePrice", "purchase_price"],
    ["salePrice", "sale_price"],
    ["notes", "notes"],
  ]) {
    if (patch[key] !== undefined) {
      fields.push(`${column} = @${key}`)
      params[key] = patch[key]
    }
  }
  if (fields.length === 0) return
  getDb().prepare(`UPDATE equipment_items SET ${fields.join(", ")} WHERE id = @id`).run(params)
}

function deleteEquipmentItem(id) {
  getDb().prepare("DELETE FROM equipment_items WHERE id = ?").run(id)
}

/* ---------- Disciplines (cours proposés par le club), librement gérées par le trésorier ---------- */
function getDisciplines() {
  return getDb().prepare("SELECT * FROM disciplines ORDER BY label").all()
}

function createDiscipline(discipline) {
  getDb()
    .prepare("INSERT INTO disciplines (id, label, price) VALUES (@id, @label, @price)")
    .run(discipline)
}

function updateDiscipline(id, patch) {
  const fields = []
  const params = { id }
  for (const [key, column] of [
    ["label", "label"],
    ["price", "price"],
  ]) {
    if (patch[key] !== undefined) {
      fields.push(`${column} = @${key}`)
      params[key] = patch[key]
    }
  }
  if (fields.length === 0) return
  getDb().prepare(`UPDATE disciplines SET ${fields.join(", ")} WHERE id = @id`).run(params)
}

function deleteDiscipline(id) {
  getDb().prepare("DELETE FROM disciplines WHERE id = ?").run(id)
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
  getClientById,
  applyDetectedCourseType,
  findClientsByEmail,
  findClientForImport,
  updateClient,
  deleteClient,
  getPayers,
  getPayerById,
  createPayer,
  updatePayer,
  deletePayer,
  findPayerForImport,
  ensurePayerForClient,
  upsertPayerByStripeId,
  upsertGuestPayer,
  findPayerForTransaction,
  createImportBatch,
  addImportBatchChange,
  getImportBatches,
  getImportBatchChanges,
  markImportBatchUndone,
  getFixedAssets,
  createFixedAsset,
  updateFixedAsset,
  deleteFixedAsset,
  getDebts,
  createDebt,
  updateDebt,
  deleteDebt,
  getCotisationPrices,
  setCotisationPrice,
  getEquipmentItems,
  createEquipmentItem,
  updateEquipmentItem,
  deleteEquipmentItem,
  getDisciplines,
  createDiscipline,
  updateDiscipline,
  deleteDiscipline,
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
  deleteClientSeason,
  resetSeasonClients,
}
