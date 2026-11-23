const path = require("path")
const crypto = require("crypto")
const { app } = require("electron")
const { DatabaseSync } = require("node:sqlite")
const { migrate, TABLE_PRIMARY_KEYS, pkValuesFromRowId } = require("../shared/sync-schema")

let db = null
let cachedDeviceId = null

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

/* ---------- Sync NAS : journal de changements (voir shared/sync-schema.js pour les tables) ----------
 * Chaque fonction de mutation ci-dessous appelle recordChange() juste après avoir écrit, pour que la
 * synchronisation NAS (electron/nas-sync.js, pas encore implémentée à ce stade) ait un journal fiable
 * et complet à pousser/tirer. Jamais appelé lors de l'application d'un changement REÇU du NAS (qui
 * applique directement via applyRemotePayload, sans repasser par ces fonctions) — sinon un changement
 * reçu serait repoussé indéfiniment en boucle. */
function getDeviceId(database) {
  if (cachedDeviceId) return cachedDeviceId
  const row = database.prepare("SELECT value FROM sync_meta WHERE key = 'device_id'").get()
  cachedDeviceId = row?.value || "unknown"
  return cachedDeviceId
}

/** `payload` est la ligne complète (déjà relue en base) pour un upsert, ou `null` pour une
 * suppression. `version` est la valeur de sync_version déjà posée sur la ligne par l'appelant. */
function recordChange(database, table, rowId, op, payload, version) {
  database
    .prepare(
      `INSERT INTO sync_changes (table_name, row_id, op, payload_json, version, updated_at, device_id)
       VALUES (@table, @rowId, @op, @payloadJson, @version, datetime('now'), @deviceId)`,
    )
    .run({
      table,
      rowId: String(rowId),
      op,
      payloadJson: op === "delete" ? null : JSON.stringify(payload),
      version: version ?? 1,
      deviceId: getDeviceId(database),
    })
}

/** Incrémente sync_version + met à jour updated_at sur une ligne déjà écrite, puis journalise un
 * changement "upsert" avec la ligne complète relue en base (évite de reconstruire un payload complet
 * à partir d'un patch partiel, qui pourrait omettre des colonnes inconnues de l'appelant). */
function bumpAndRecord(database, table, pkColumn, pkValue, rowId) {
  database
    .prepare(
      `UPDATE ${table} SET sync_version = sync_version + 1, updated_at = datetime('now') WHERE ${pkColumn} = @pk`,
    )
    .run({ pk: pkValue })
  const row = database.prepare(`SELECT * FROM ${table} WHERE ${pkColumn} = @pk`).get({ pk: pkValue })
  recordChange(database, table, rowId ?? pkValue, "upsert", row, row?.sync_version)
}

/** Suppression douce (tombstone) : jamais de vrai DELETE sur une table synchronisée, pour que la
 * suppression puisse se propager au NAS et aux autres postes au lieu d'être invisible pour eux.
 * Idempotent (AND deleted_at IS NULL) : supprimer deux fois une ligne déjà supprimée ne journalise
 * rien de plus. */
function softDelete(database, table, pkColumn, pkValue, rowId) {
  const result = database
    .prepare(
      `UPDATE ${table} SET deleted_at = datetime('now'), sync_version = sync_version + 1, updated_at = datetime('now')
       WHERE ${pkColumn} = @pk AND deleted_at IS NULL`,
    )
    .run({ pk: pkValue })
  if (result.changes > 0) {
    recordChange(database, table, rowId ?? pkValue, "delete", null, null)
  }
}

/* ---------- Users ---------- */
function getUsers() {
  return getDb()
    .prepare(
      "SELECT id, name, email, role, security_question FROM users WHERE deleted_at IS NULL ORDER BY created_at",
    )
    .all()
}

function countUsers() {
  return getDb().prepare("SELECT COUNT(*) AS n FROM users WHERE deleted_at IS NULL").get().n
}

function findUserByEmail(email) {
  return getDb()
    .prepare("SELECT * FROM users WHERE lower(email) = lower(?) AND deleted_at IS NULL")
    .get(email.trim())
}

function createUser({ id, name, email, passwordHash, role, securityQuestion, securityAnswerHash }) {
  const database = getDb()
  database
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
  bumpAndRecord(database, "users", "id", id)
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
    ["totpSecret", "totp_secret"],
  ]) {
    if (patch[key] !== undefined) {
      fields.push(`${column} = @${key}`)
      params[key] = patch[key]
    }
  }
  if (fields.length === 0) return
  const database = getDb()
  database.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = @id`).run(params)
  bumpAndRecord(database, "users", "id", id)
}

function deleteUser(id) {
  softDelete(getDb(), "users", "id", id)
}

/* ---------- Clients ---------- */
function getClients() {
  return getDb().prepare("SELECT * FROM clients WHERE deleted_at IS NULL ORDER BY created_at").all()
}

function createClient(client) {
  // node:sqlite refuse tout paramètre nommé non référencé dans la requête : on construit l'objet
  // passé à .run() champ par champ plutôt que de "spreader" `client` (qui peut porter d'autres clés
  // ajoutées côté renderer), pour ne jamais recasser silencieusement cet insert à chaque nouveau champ.
  const database = getDb()
  database
    .prepare(
      `INSERT INTO clients (id, first_name, last_name, email, status, method, paid, address, phone, birth_date, postal_code, city, payer_id, board_role, payer_relationship)
       VALUES (@id, @firstName, @lastName, @email, @status, @method, @paid, @address, @phone, @birthDate, @postalCode, @city, @payerId, @boardRole, @payerRelationship)`,
    )
    .run({
      id: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      status: client.status,
      method: client.method,
      paid: client.paid ? 1 : 0,
      address: client.address ?? "",
      phone: client.phone ?? "",
      birthDate: client.birthDate ?? null,
      postalCode: client.postalCode ?? "",
      city: client.city ?? "",
      payerId: client.payerId ?? null,
      boardRole: client.boardRole ?? null,
      payerRelationship: client.payerRelationship ?? null,
    })
  bumpAndRecord(database, "clients", "id", client.id)
}

function getClientById(id) {
  return getDb().prepare("SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL").get(id) ?? null
}

/* ---------- Payeurs (identité de facturation — distincte des adhérents, voir migratePayersBackfill) ---------- */
function getPayers() {
  return getDb().prepare("SELECT * FROM payers WHERE deleted_at IS NULL ORDER BY created_at").all()
}

function getPayerById(id) {
  if (!id) return null
  return getDb().prepare("SELECT * FROM payers WHERE id = ? AND deleted_at IS NULL").get(id) ?? null
}

function createPayer(payer) {
  const id = payer.id || crypto.randomUUID()
  const database = getDb()
  database
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
  bumpAndRecord(database, "payers", "id", id)
  return id
}

/** Retrouve le payeur portant exactement ce nom (insensible à la casse/espaces), sinon en crée un —
 * utilisé quand le trésorier tape un nom dans "Payeur lié" sur une transaction sans payeur
 * automatiquement détecté (ex. carte Stripe sans nom de facturation, stagiaire non-adhérent). */
function findOrCreatePayerByName(firstName, lastName) {
  const existing = getDb()
    .prepare(
      `SELECT id FROM payers WHERE lower(trim(first_name)) = lower(trim(@firstName)) AND lower(trim(last_name)) = lower(trim(@lastName)) AND deleted_at IS NULL`,
    )
    .get({ firstName, lastName })
  if (existing) return existing.id
  return createPayer({ firstName, lastName, email: "", phone: "", address: "", postalCode: "", city: "" })
}

/** Numéro de document basé sur une date, ex. "202611211" pour le 1er document du 21/11/2026
 * ("20261121" + rang du jour) — partagé par les factures (transactions.invoice_number) et les
 * devis (quotes.number) pour garder la même convention de numérotation. */
function nextNumberForDate(table, column, dateStr) {
  const datePart = (dateStr || new Date().toISOString()).slice(0, 10).replace(/-/g, "")
  const row = getDb()
    .prepare(`SELECT COUNT(*) as count FROM ${table} WHERE ${column} LIKE @prefix`)
    .get({ prefix: `${datePart}%` })
  return `${datePart}${(row?.count || 0) + 1}`
}

/** Attribue un numéro de facture à une transaction au premier appel (aperçu ou téléchargement) puis
 * le renvoie tel quel ensuite — ne doit jamais changer une fois posé, voir ensureColumn ci-dessus. */
function getOrAssignInvoiceNumber(transactionId) {
  const database = getDb()
  const tx = database.prepare("SELECT id, date, invoice_number FROM transactions WHERE id = ?").get(transactionId)
  if (!tx) return null
  if (tx.invoice_number) return tx.invoice_number
  const number = nextNumberForDate("transactions", "invoice_number", tx.date)
  database.prepare("UPDATE transactions SET invoice_number = @number WHERE id = @id").run({ number, id: transactionId })
  bumpAndRecord(database, "transactions", "id", transactionId)
  return number
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
  // Dès qu'un nom/prénom est corrigé à la main, on le protège définitivement d'un écrasement par la
  // prochaine synchro Stripe (voir upsertPayerByStripeId) — sans ça la correction disparaissait au
  // sync suivant, ce qui rendait l'édition manuelle inutile.
  if (patch.firstName !== undefined || patch.lastName !== undefined) {
    fields.push("name_manually_edited = 1")
  }
  const database = getDb()
  database.prepare(`UPDATE payers SET ${fields.join(", ")} WHERE id = @id`).run(params)
  bumpAndRecord(database, "payers", "id", id)
}

function deletePayer(id) {
  // Jamais de suppression en cascade : les adhérents liés perdent juste leur payeur (plutôt que
  // d'être supprimés eux aussi), le trésorier devra leur en choisir un autre s'il en faut un.
  const database = getDb()
  const linkedClients = database.prepare("SELECT id FROM clients WHERE payer_id = ? AND deleted_at IS NULL").all(id)
  database.prepare("UPDATE clients SET payer_id = NULL WHERE payer_id = ?").run(id)
  for (const c of linkedClients) bumpAndRecord(database, "clients", "id", c.id)
  softDelete(database, "payers", "id", id)
}

/** Retrouve un payeur existant pour l'import/le rapprochement : par email (insensible à la casse)
 * en priorité, sinon par prénom+nom exacts (insensible à la casse). */
function findPayerForImport({ email, firstName, lastName }) {
  if (email) {
    const match = getDb()
      .prepare("SELECT * FROM payers WHERE email <> '' AND lower(email) = lower(@email) AND deleted_at IS NULL")
      .get({ email })
    if (match) return match
  }
  return getDb()
    .prepare(
      `SELECT * FROM payers WHERE lower(first_name) = lower(@firstName) AND lower(last_name) = lower(@lastName) AND deleted_at IS NULL`,
    )
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
  const database = getDb()
  database.prepare("UPDATE clients SET payer_id = @payerId WHERE id = @id").run({ payerId, id: clientId })
  bumpAndRecord(database, "clients", "id", clientId)
  return payerId
}

/** Rattache un client Stripe à un payeur : par id Stripe déjà connu en priorité, sinon par email
 * — un payeur peut avoir été créé manuellement ou via un import (CSV, représentant légal...) avant
 * d'avoir jamais payé par Stripe ; sans ce repli par email, la synchro créerait un DOUBLON de ce
 * payeur (avec l'id Stripe cette fois), détaché des adhérents déjà liés au premier, et plus aucune
 * mise à jour automatique de cours ne fonctionnerait pour eux. */
function upsertPayerByStripeId(payer) {
  const database = getDb()
  const byStripeId = database
    .prepare("SELECT id, name_manually_edited FROM payers WHERE stripe_customer_id = ? AND deleted_at IS NULL")
    .get(payer.stripeCustomerId)
  if (byStripeId) {
    if (byStripeId.name_manually_edited) {
      // node:sqlite refuse les paramètres nommés surnuméraires : on ne peut pas réutiliser l'objet
      // "payer" tel quel (il porte aussi firstName/lastName, absents de cette requête).
      database
        .prepare(`UPDATE payers SET email=@email WHERE stripe_customer_id=@stripeCustomerId`)
        .run({ email: payer.email, stripeCustomerId: payer.stripeCustomerId })
    } else {
      database
        .prepare(
          `UPDATE payers SET first_name=@firstName, last_name=@lastName, email=@email WHERE stripe_customer_id=@stripeCustomerId`,
        )
        .run(payer)
    }
    bumpAndRecord(database, "payers", "id", byStripeId.id)
    return byStripeId.id
  }

  if (payer.email) {
    const byEmail = database
      .prepare(
        "SELECT id, stripe_customer_id, name_manually_edited FROM payers WHERE email <> '' AND lower(email) = lower(?) AND deleted_at IS NULL",
      )
      .get(payer.email)
    if (byEmail && !byEmail.stripe_customer_id) {
      if (byEmail.name_manually_edited) {
        database
          .prepare(`UPDATE payers SET stripe_customer_id=@stripeCustomerId WHERE id=@id`)
          .run({ stripeCustomerId: payer.stripeCustomerId, id: byEmail.id })
      } else {
        database
          .prepare(
            `UPDATE payers SET stripe_customer_id=@stripeCustomerId, first_name=@firstName, last_name=@lastName WHERE id=@id`,
          )
          .run({
            stripeCustomerId: payer.stripeCustomerId,
            firstName: payer.firstName,
            lastName: payer.lastName,
            id: byEmail.id,
          })
      }
      bumpAndRecord(database, "payers", "id", byEmail.id)
      return byEmail.id
    }
  }

  return createPayer(payer)
}

/** Payeur "invité" Stripe (paiement sans compte client Stripe) : pas d'id Stripe, déduplication par
 * email, ou par nom si Stripe ne fournit aucun email. */
function findGuestPayer({ email, firstName, lastName }) {
  if (email) {
    return getDb()
      .prepare(
        "SELECT id, name_manually_edited FROM payers WHERE stripe_customer_id IS NULL AND email = ? AND deleted_at IS NULL",
      )
      .get(email)
  }
  // Insensible à la casse : une fois le nom corrigé à la main (ex. mise en forme NOM/Prénom), le
  // texte brut renvoyé par Stripe à la prochaine synchro ne correspond plus caractère pour
  // caractère — sans ça, on créerait un doublon au lieu de retrouver ce payeur "invité".
  return getDb()
    .prepare(
      `SELECT id, name_manually_edited FROM payers
       WHERE stripe_customer_id IS NULL AND (email IS NULL OR email = '') AND deleted_at IS NULL
         AND lower(first_name) = lower(@firstName) AND lower(last_name) = lower(@lastName)`,
    )
    .get({ firstName, lastName })
}

function upsertGuestPayer(payer) {
  const existing = findGuestPayer(payer)
  if (existing) {
    if (!existing.name_manually_edited) {
      const database = getDb()
      database
        .prepare(`UPDATE payers SET first_name=@firstName, last_name=@lastName WHERE id=@id`)
        .run({ firstName: payer.firstName, lastName: payer.lastName, id: existing.id })
      bumpAndRecord(database, "payers", "id", existing.id)
    }
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
    return getDb().prepare("SELECT * FROM payers WHERE stripe_customer_id = ? AND deleted_at IS NULL").get(charge.customer) ?? null
  }
  const email = charge.billing_details?.email || charge.receipt_email || null
  if (email) {
    return (
      getDb()
        .prepare("SELECT * FROM payers WHERE stripe_customer_id IS NULL AND email = ? AND deleted_at IS NULL")
        .get(email) ?? null
    )
  }
  if (charge.billing_details?.name) {
    const parts = charge.billing_details.name.trim().split(/\s+/)
    const firstName = parts[0]
    const lastName = parts.slice(1).join(" ") || ""
    return (
      getDb()
        .prepare(
          `SELECT * FROM payers
           WHERE stripe_customer_id IS NULL AND (email IS NULL OR email = '') AND deleted_at IS NULL
             AND first_name = ? AND last_name = ?`,
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
    .prepare("SELECT 1 FROM client_seasons WHERE client_id = @clientId AND season_id = @activeSeasonId AND deleted_at IS NULL")
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
    .prepare("SELECT * FROM clients WHERE email <> '' AND lower(email) = lower(@email) AND deleted_at IS NULL")
    .all({ email })
}

/** Retrouve un client existant pour l'import Excel : par email (insensible à la casse) en priorité, sinon par prénom+nom exacts (insensible à la casse). */
function findClientForImport({ email, firstName, lastName }) {
  if (email) {
    const match = getDb()
      .prepare("SELECT * FROM clients WHERE email <> '' AND lower(email) = lower(@email) AND deleted_at IS NULL")
      .get({ email })
    if (match) return match
  }
  return getDb()
    .prepare(
      `SELECT * FROM clients WHERE lower(first_name) = lower(@firstName) AND lower(last_name) = lower(@lastName) AND deleted_at IS NULL`,
    )
    .get({ firstName, lastName })
}

/** Pose le cours détecté depuis la description d'une charge Stripe sur l'adhérent lié au payeur de
 * cette charge — jamais sur le payeur lui-même, qui n'a pas de cours. Si le payeur n'est lié à
 * aucun adhérent, ou à plusieurs (ex. deux enfants), on ne devine jamais lequel : le trésorier
 * catégorise à la main. N'écrase jamais non plus un cours déjà choisi. */
function applyDetectedCourseType({ stripeCustomerId, email, firstName, lastName, courseType }) {
  if (!courseType) return
  const database = getDb()
  const payer = stripeCustomerId
    ? database.prepare("SELECT id FROM payers WHERE stripe_customer_id = ? AND deleted_at IS NULL").get(stripeCustomerId)
    : findGuestPayer({ email, firstName, lastName })
  if (!payer) return

  const linkedClients = database
    .prepare("SELECT id, status FROM clients WHERE payer_id = ? AND status = 'Non catégorisé' AND deleted_at IS NULL")
    .all(payer.id)
  if (linkedClients.length !== 1) return
  const row = linkedClients[0]

  database.prepare("UPDATE clients SET status = @status WHERE id = @id").run({ status: courseType, id: row.id })
  bumpAndRecord(database, "clients", "id", row.id)

  // Si cet adhérent est déjà inscrit à la saison active avec un cours encore indéterminé, on
  // répercute le cours détecté sur son inscription (sinon la page Clients resterait figée
  // sur "Non catégorisé" malgré la mise à jour de sa fiche globale ci-dessus).
  const activeSeasonId = getSettings().activeSeasonId
  if (!activeSeasonId) return
  const seasonRow = database
    .prepare("SELECT status FROM client_seasons WHERE client_id = @id AND season_id = @activeSeasonId AND deleted_at IS NULL")
    .get({ id: row.id, activeSeasonId })
  if (seasonRow && seasonRow.status === "Non catégorisé") {
    database
      .prepare(
        "UPDATE client_seasons SET status = @status WHERE client_id = @id AND season_id = @activeSeasonId",
      )
      .run({ status: courseType, id: row.id, activeSeasonId })
    bumpAndRecord(database, "client_seasons", "client_id", row.id, `${row.id}:${activeSeasonId}`)
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
    ["boardRole", "board_role"],
    ["payerRelationship", "payer_relationship"],
  ]) {
    if (patch[key] !== undefined) {
      fields.push(`${column} = @${key}`)
      params[key] = key === "paid" ? (patch[key] ? 1 : 0) : patch[key]
    }
  }
  if (fields.length === 0) return
  const database = getDb()
  database.prepare(`UPDATE clients SET ${fields.join(", ")} WHERE id = @id`).run(params)
  bumpAndRecord(database, "clients", "id", id)
}

function deleteClient(id) {
  const database = getDb()
  softDelete(database, "clients", "id", id)
  const seasonRows = database.prepare("SELECT client_id, season_id FROM client_seasons WHERE client_id = ? AND deleted_at IS NULL").all(id)
  database.prepare("UPDATE client_seasons SET deleted_at = datetime('now'), sync_version = sync_version + 1, updated_at = datetime('now') WHERE client_id = ? AND deleted_at IS NULL").run(id)
  for (const row of seasonRows) {
    recordChange(database, "client_seasons", `${row.client_id}:${row.season_id}`, "delete", null, null)
  }
}

/* ---------- Lots d'import (Excel clients) : traçabilité pour permettre l'annulation ---------- */
function createImportBatch({ id, createdCount, updatedCount, skippedCount }) {
  const database = getDb()
  database
    .prepare(
      `INSERT INTO import_batches (id, created_count, updated_count, skipped_count)
       VALUES (@id, @createdCount, @updatedCount, @skippedCount)`,
    )
    .run({ id, createdCount, updatedCount, skippedCount })
  bumpAndRecord(database, "import_batches", "id", id)
}

function addImportBatchChange({ id, batchId, clientId, kind, previousJson }) {
  const database = getDb()
  database
    .prepare(
      `INSERT INTO import_batch_changes (id, batch_id, client_id, kind, previous_json)
       VALUES (@id, @batchId, @clientId, @kind, @previousJson)`,
    )
    .run({ id, batchId, clientId, kind, previousJson: previousJson ?? null })
  bumpAndRecord(database, "import_batch_changes", "id", id)
}

function getImportBatches() {
  return getDb()
    .prepare("SELECT * FROM import_batches WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 10")
    .all()
}

function getImportBatchChanges(batchId) {
  return getDb().prepare("SELECT * FROM import_batch_changes WHERE batch_id = ? AND deleted_at IS NULL").all(batchId)
}

function markImportBatchUndone(batchId) {
  const database = getDb()
  database.prepare("UPDATE import_batches SET undone = 1 WHERE id = ?").run(batchId)
  bumpAndRecord(database, "import_batches", "id", batchId)
}

/* ---------- Transactions ---------- */
function getTransactions() {
  return getDb().prepare("SELECT * FROM transactions WHERE deleted_at IS NULL ORDER BY date DESC").all()
}

function getTransactionById(id) {
  return getDb().prepare("SELECT * FROM transactions WHERE id = ? AND deleted_at IS NULL").get(id)
}

function createTransaction(tx) {
  const database = getDb()
  database
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
  bumpAndRecord(database, "transactions", "id", tx.id)
}

/** Insère une transaction par id si elle n'existe pas déjà (jamais de mise à jour, comme upsertTransactionByChargeId). */
function upsertTransactionById(tx) {
  const existing = getDb().prepare("SELECT id FROM transactions WHERE id = ?").get(tx.id)
  if (existing) return
  createTransaction(tx)
}

function upsertTransactionByChargeId(tx) {
  const database = getDb()
  const existing = database
    .prepare("SELECT id FROM transactions WHERE stripe_charge_id = ?")
    .get(tx.stripeChargeId)
  if (existing) {
    // On rafraîchit les champs purement issus de Stripe à chaque resynchro (ex. une description
    // modifiée depuis le Dashboard Stripe après coup, ou le payload brut dont dépend l'affichage
    // des remboursements) — mais jamais la catégorie, le statut ou l'adhérent lié : ce sont des
    // choix du trésorier, une resynchro ne doit jamais les écraser.
    database
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
    bumpAndRecord(database, "transactions", "id", existing.id)
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
    ["linkedClientId", "linked_client_id"],
    ["linkedPayerId", "linked_payer_id"],
    ["stripeNet", "stripe_net"],
    ["stripeInvoicePdfUrl", "stripe_invoice_pdf_url"],
  ]) {
    if (patch[key] !== undefined) {
      fields.push(`${column} = @${key}`)
      params[key] = patch[key]
    }
  }
  if (fields.length === 0) return
  const database = getDb()
  database.prepare(`UPDATE transactions SET ${fields.join(", ")} WHERE id = @id`).run(params)
  bumpAndRecord(database, "transactions", "id", id)
}

function deleteTransaction(id) {
  softDelete(getDb(), "transactions", "id", id)
}

/* ---------- Bank transactions (GoCardless) ---------- */
function getBankTransactions() {
  return getDb().prepare("SELECT * FROM bank_transactions WHERE deleted_at IS NULL ORDER BY date DESC").all()
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
  for (const row of rows) {
    const inserted = database.prepare("SELECT * FROM bank_transactions WHERE id = ?").get(row.id)
    if (inserted) recordChange(database, "bank_transactions", row.id, "upsert", inserted, inserted.sync_version)
  }
}

/* ---------- Settings ---------- */
function getSettings() {
  const rows = getDb().prepare("SELECT key, value FROM settings WHERE deleted_at IS NULL").all()
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

function setSetting(key, value) {
  const database = getDb()
  database
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value)
  bumpAndRecord(database, "settings", "key", key)
}

/* ---------- Vault ---------- */
function getVault() {
  return getDb().prepare("SELECT salt_b64, iv_b64, ciphertext_b64 FROM vault WHERE id = 1").get()
}

function setVault({ salt_b64, iv_b64, ciphertext_b64 }) {
  const database = getDb()
  database
    .prepare(
      `INSERT INTO vault (id, salt_b64, iv_b64, ciphertext_b64) VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET salt_b64 = excluded.salt_b64, iv_b64 = excluded.iv_b64, ciphertext_b64 = excluded.ciphertext_b64`,
    )
    .run(salt_b64, iv_b64, ciphertext_b64)
  bumpAndRecord(database, "vault", "id", 1)
}

/* ---------- Sync state (curseurs Stripe/GoCardless — différent de la sync NAS) ---------- */
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
  return getDb().prepare("SELECT * FROM seasons WHERE deleted_at IS NULL ORDER BY start_date DESC").all()
}

function findSeasonByLabel(label) {
  if (!label) return null
  return getDb().prepare("SELECT * FROM seasons WHERE lower(label) = lower(?) AND deleted_at IS NULL").get(label.trim()) ?? null
}

/** Retrouve une saison par son libellé (ex. import d'un fichier qui porte une colonne "Saison"),
 * ou la crée si elle n'existe pas encore — en déduisant ses dates du format "AAAA-AAAA" habituel
 * des clubs sportifs (1er août -> 31 juillet, les dates par défaut de ce club). */
function findOrCreateSeasonByLabel(label) {
  const existing = findSeasonByLabel(label)
  if (existing) return existing
  const match = label.trim().match(/^(\d{4})\s*-\s*(\d{4})$/)
  const startDate = match ? `${match[1]}-08-01` : `${new Date().getFullYear()}-08-01`
  const endDate = match ? `${match[2]}-07-31` : `${new Date().getFullYear() + 1}-07-31`
  const id = crypto.randomUUID()
  createSeason({ id, label: label.trim(), startDate, endDate })
  return { id, label: label.trim(), start_date: startDate, end_date: endDate }
}

function createSeason({ id, label, startDate, endDate }) {
  const database = getDb()
  database
    .prepare("INSERT INTO seasons (id, label, start_date, end_date) VALUES (@id, @label, @startDate, @endDate)")
    .run({ id, label, startDate, endDate })
  bumpAndRecord(database, "seasons", "id", id)
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
  const database = getDb()
  database.prepare(`UPDATE seasons SET ${fields.join(", ")} WHERE id = @id`).run(params)
  bumpAndRecord(database, "seasons", "id", id)
}

function deleteSeason(id) {
  const database = getDb()
  softDelete(database, "seasons", "id", id)
  const seasonRows = database.prepare("SELECT client_id, season_id FROM client_seasons WHERE season_id = ? AND deleted_at IS NULL").all(id)
  database.prepare("UPDATE client_seasons SET deleted_at = datetime('now'), sync_version = sync_version + 1, updated_at = datetime('now') WHERE season_id = ? AND deleted_at IS NULL").run(id)
  for (const row of seasonRows) {
    recordChange(database, "client_seasons", `${row.client_id}:${row.season_id}`, "delete", null, null)
  }
}

/** Même comparaison "date locale" que isDateInSeason côté renderer (lib/seasons-store.tsx) : une
 * transaction à 1h du matin heure de Paris le 1er septembre reste datée du 31 août en UTC, ce qui
 * la classerait à tort hors saison si on comparait la chaîne ISO brute. */
function isDateInRange(dateIso, startDate, endDate) {
  const d = new Date(dateIso)
  const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  return localDate >= startDate && localDate <= endDate
}

const SEASON_DELETE_MIN_AGE_YEARS = 5

/** Supprime définitivement une saison ET tout ce qui s'y rapporte : les transactions dont la date
 * tombe dans sa période, les adhérents qui n'étaient inscrits QUE dans cette saison (ceux inscrits
 * à d'autres saisons sont seulement désinscrits de celle-ci, leur fiche reste intacte), et leur
 * payeur si plus aucun adhérent ne le référence ensuite. Bloqué pour une saison trop récente — la
 * comptabilité associative doit être conservée au moins SEASON_DELETE_MIN_AGE_YEARS ans ; penser à
 * exporter la saison avant de la supprimer, l'opération est irréversible (même si, techniquement,
 * toutes ces suppressions restent des tombstones — voir softDelete — pour la synchronisation). */
function deleteSeasonCascade(id) {
  const season = getDb().prepare("SELECT * FROM seasons WHERE id = ?").get(id)
  if (!season) return { ok: false, error: "Saison introuvable" }

  const minEndDate = new Date()
  minEndDate.setFullYear(minEndDate.getFullYear() - SEASON_DELETE_MIN_AGE_YEARS)
  const minEndDateIso = minEndDate.toISOString().slice(0, 10)
  if (season.end_date > minEndDateIso) {
    return {
      ok: false,
      error: `Pour conserver la comptabilité au moins ${SEASON_DELETE_MIN_AGE_YEARS} ans, seule une saison terminée depuis plus de ${SEASON_DELETE_MIN_AGE_YEARS} ans peut être supprimée définitivement.`,
    }
  }

  const allTransactions = getDb().prepare("SELECT id, date FROM transactions WHERE deleted_at IS NULL").all()
  const transactionIds = allTransactions
    .filter((tx) => isDateInRange(tx.date, season.start_date, season.end_date))
    .map((tx) => tx.id)
  for (const txId of transactionIds) deleteTransaction(txId)

  const enrolledClientIds = getDb()
    .prepare("SELECT client_id FROM client_seasons WHERE season_id = ? AND deleted_at IS NULL")
    .all(id)
    .map((r) => r.client_id)

  // Désinscription de TOUS les clients de cette saison (pas seulement ceux qui vont être supprimés
  // ci-dessous) — c'est le même mécanisme que deleteSeason, dupliqué ici pour ne garder qu'un seul
  // appel à softDelete par saison/suppression plutôt que deux passes.
  const database = getDb()
  const seasonRows = database.prepare("SELECT client_id, season_id FROM client_seasons WHERE season_id = ? AND deleted_at IS NULL").all(id)
  database.prepare("UPDATE client_seasons SET deleted_at = datetime('now'), sync_version = sync_version + 1, updated_at = datetime('now') WHERE season_id = ? AND deleted_at IS NULL").run(id)
  for (const row of seasonRows) {
    recordChange(database, "client_seasons", `${row.client_id}:${row.season_id}`, "delete", null, null)
  }

  let deletedClients = 0
  let deletedPayers = 0
  for (const clientId of enrolledClientIds) {
    const stillElsewhere = getDb()
      .prepare("SELECT 1 FROM client_seasons WHERE client_id = ? AND deleted_at IS NULL")
      .get(clientId)
    if (stillElsewhere) continue // inscrit à une autre saison : fiche conservée, juste désinscrit d'ici

    const client = getClientById(clientId)
    deleteClient(clientId)
    deletedClients++

    if (client?.payer_id) {
      const payerStillUsed = getDb().prepare("SELECT 1 FROM clients WHERE payer_id = ? AND deleted_at IS NULL").get(client.payer_id)
      if (!payerStillUsed) {
        deletePayer(client.payer_id)
        deletedPayers++
      }
    }
  }

  softDelete(getDb(), "seasons", "id", id)

  return {
    ok: true,
    deletedTransactions: transactionIds.length,
    deletedClients,
    deletedPayers,
  }
}

/** Supprime un payeur et les adhérents qui lui sont liés (une fiche "payeur-only" n'a plus lieu
 * d'être si on supprime tous les adhérents qu'elle finançait). Ne touche JAMAIS aux transactions :
 * elles ne sont reliées à un payeur que par correspondance de nom (texte libre), un lien bien trop
 * incertain pour en déduire une suppression — voir deleteSeasonCascade pour la suppression fiable
 * par plage de dates. */
function deletePayerCascade(id) {
  const linkedClients = getDb().prepare("SELECT id FROM clients WHERE payer_id = ? AND deleted_at IS NULL").all(id)
  for (const c of linkedClients) deleteClient(c.id)
  deletePayer(id)
  return { ok: true, deletedClients: linkedClients.length }
}

/** Statut ("cours") + paiement des clients INSCRITS à cette saison : une ligne "client_seasons"
 * vaut à la fois appartenance (le client fait partie de l'effectif de la saison) et surclassement
 * de son cours/paiement pour cette période. */
function getClientSeasonMap(seasonId) {
  const rows = getDb()
    .prepare("SELECT client_id, status, paid FROM client_seasons WHERE season_id = ? AND deleted_at IS NULL")
    .all(seasonId)
  return Object.fromEntries(rows.map((r) => [r.client_id, { status: r.status, paid: !!r.paid }]))
}

function setClientSeason(clientId, seasonId, { status, paid }) {
  const database = getDb()
  database
    .prepare(
      `INSERT INTO client_seasons (client_id, season_id, status, paid) VALUES (@clientId, @seasonId, @status, @paid)
       ON CONFLICT(client_id, season_id) DO UPDATE SET status = excluded.status, paid = excluded.paid, deleted_at = NULL`,
    )
    .run({ clientId, seasonId, status, paid: paid ? 1 : 0 })
  bumpAndRecord(database, "client_seasons", "client_id", clientId, `${clientId}:${seasonId}`)
}

/** Désinscrit un client d'une saison (la fiche client elle-même n'est jamais supprimée). */
function deleteClientSeason(clientId, seasonId) {
  const database = getDb()
  softDelete(database, "client_seasons", "client_id", clientId, `${clientId}:${seasonId}`)
}

/** Vide l'effectif d'une saison (tous les clients désinscrits) sans supprimer la saison elle-même. */
function resetSeasonClients(seasonId) {
  const database = getDb()
  const rows = database.prepare("SELECT client_id, season_id FROM client_seasons WHERE season_id = ? AND deleted_at IS NULL").all(seasonId)
  database.prepare("UPDATE client_seasons SET deleted_at = datetime('now'), sync_version = sync_version + 1, updated_at = datetime('now') WHERE season_id = ? AND deleted_at IS NULL").run(seasonId)
  for (const row of rows) {
    recordChange(database, "client_seasons", `${row.client_id}:${row.season_id}`, "delete", null, null)
  }
}

/* ---------- Immobilisations (matériel à amortir) ---------- */
function getFixedAssets() {
  return getDb().prepare("SELECT * FROM fixed_assets WHERE deleted_at IS NULL ORDER BY purchase_date DESC").all()
}

function createFixedAsset(asset) {
  const database = getDb()
  database
    .prepare(
      `INSERT INTO fixed_assets (id, label, purchase_amount, purchase_date, depreciation_years, disposed, notes)
       VALUES (@id, @label, @purchaseAmount, @purchaseDate, @depreciationYears, @disposed, @notes)`,
    )
    .run({
      ...asset,
      disposed: asset.disposed ? 1 : 0,
      notes: asset.notes ?? "",
    })
  bumpAndRecord(database, "fixed_assets", "id", asset.id)
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
  const database = getDb()
  database.prepare(`UPDATE fixed_assets SET ${fields.join(", ")} WHERE id = @id`).run(params)
  bumpAndRecord(database, "fixed_assets", "id", id)
}

function deleteFixedAsset(id) {
  softDelete(getDb(), "fixed_assets", "id", id)
}

/* ---------- Dettes ---------- */
function getDebts() {
  return getDb().prepare("SELECT * FROM debts WHERE deleted_at IS NULL ORDER BY date DESC").all()
}

function createDebt(debt) {
  const database = getDb()
  database
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
  bumpAndRecord(database, "debts", "id", debt.id)
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
  const database = getDb()
  database.prepare(`UPDATE debts SET ${fields.join(", ")} WHERE id = @id`).run(params)
  bumpAndRecord(database, "debts", "id", id)
}

function deleteDebt(id) {
  softDelete(getDb(), "debts", "id", id)
}

/* ---------- Tarifs des cotisations (par cours), pour retrouver automatiquement le cours payé ---------- */
function getCotisationPrices() {
  const rows = getDb().prepare("SELECT course_type, price FROM cotisation_prices WHERE deleted_at IS NULL").all()
  return Object.fromEntries(rows.map((r) => [r.course_type, r.price]))
}

function setCotisationPrice(courseType, price) {
  const database = getDb()
  database
    .prepare(
      `INSERT INTO cotisation_prices (course_type, price) VALUES (@courseType, @price)
       ON CONFLICT(course_type) DO UPDATE SET price = excluded.price, deleted_at = NULL`,
    )
    .run({ courseType, price })
  bumpAndRecord(database, "cotisation_prices", "course_type", courseType)
}

/* ---------- Matériel / stock d'équipements ---------- */
function getEquipmentItems() {
  return getDb().prepare("SELECT * FROM equipment_items WHERE deleted_at IS NULL ORDER BY label").all()
}

function createEquipmentItem(item) {
  const database = getDb()
  database
    .prepare(
      `INSERT INTO equipment_items (id, label, stock_quantity, purchase_price, sale_price, notes)
       VALUES (@id, @label, @stockQuantity, @purchasePrice, @salePrice, @notes)`,
    )
    .run({ ...item, notes: item.notes ?? "" })
  bumpAndRecord(database, "equipment_items", "id", item.id)
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
  const database = getDb()
  database.prepare(`UPDATE equipment_items SET ${fields.join(", ")} WHERE id = @id`).run(params)
  bumpAndRecord(database, "equipment_items", "id", id)
}

function deleteEquipmentItem(id) {
  softDelete(getDb(), "equipment_items", "id", id)
}

/* ---------- Disciplines (cours proposés par le club), librement gérées par le trésorier ---------- */
function getDisciplines() {
  return getDb().prepare("SELECT * FROM disciplines WHERE deleted_at IS NULL ORDER BY label").all()
}

function createDiscipline(discipline) {
  const database = getDb()
  database.prepare("INSERT INTO disciplines (id, label, price) VALUES (@id, @label, @price)").run(discipline)
  bumpAndRecord(database, "disciplines", "id", discipline.id)
}

function findDisciplineByLabel(label) {
  if (!label) return null
  return getDb().prepare("SELECT * FROM disciplines WHERE lower(label) = lower(?) AND deleted_at IS NULL").get(label.trim()) ?? null
}

/** Retrouve une discipline par son libellé exact, ou la crée (tarif à 0, à ajuster ensuite sur la
 * page /disciplines) — utilisé par l'import pour ne jamais laisser un adhérent avec un cours
 * "deviné à vide" simplement parce que le club a renommé/ajouté une discipline depuis le dernier
 * import : toute valeur non vide de la colonne devient une vraie discipline, jamais un statut
 * orphelin invisible sur la page Disciplines. */
function findOrCreateDisciplineByLabel(label) {
  const existing = findDisciplineByLabel(label)
  if (existing) return existing
  const id = crypto.randomUUID()
  const trimmed = label.trim()
  createDiscipline({ id, label: trimmed, price: 0 })
  return { id, label: trimmed, price: 0 }
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
  const database = getDb()
  database.prepare(`UPDATE disciplines SET ${fields.join(", ")} WHERE id = @id`).run(params)
  bumpAndRecord(database, "disciplines", "id", id)
}

function deleteDiscipline(id) {
  softDelete(getDb(), "disciplines", "id", id)
}

/* ---------- Devis (document libre, non rattaché à un adhérent/une transaction) ---------- */
function getQuotes() {
  return getDb().prepare("SELECT * FROM quotes WHERE deleted_at IS NULL ORDER BY date DESC, created_at DESC").all()
}

function getQuoteById(id) {
  return getDb().prepare("SELECT * FROM quotes WHERE id = ? AND deleted_at IS NULL").get(id) ?? null
}

const QUOTE_FIELD_TO_COLUMN = {
  number: "number",
  date: "date",
  title: "title",
  subtitle: "subtitle",
  seasonLabel: "season_label",
  emitterLines: "emitter_lines",
  recipientLines: "recipient_lines",
  infoTitle: "info_title",
  infoText: "info_text",
  prestationTitle: "prestation_title",
  prestationText: "prestation_text",
  itemsJson: "items_json",
  termsTitle: "terms_title",
  termsText: "terms_text",
  validityText: "validity_text",
  signatureLeftLabel: "signature_left_label",
  signatureRightLabel: "signature_right_label",
}

function createQuote(quote) {
  const id = quote.id || crypto.randomUUID()
  // Même convention que les factures (voir nextNumberForDate/getOrAssignInvoiceNumber) : si le
  // trésorier n'a pas saisi de numéro à la main, on en attribue un basé sur la date du devis.
  const number = quote.number?.trim() ? quote.number : nextNumberForDate("quotes", "number", quote.date)
  const columns = ["id"]
  const placeholders = ["@id"]
  const params = { id }
  for (const [key, column] of Object.entries(QUOTE_FIELD_TO_COLUMN)) {
    columns.push(column)
    placeholders.push(`@${key}`)
    params[key] = (key === "number" ? number : quote[key]) ?? ""
  }
  const database = getDb()
  database.prepare(`INSERT INTO quotes (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`).run(params)
  bumpAndRecord(database, "quotes", "id", id)
  return id
}

function updateQuote(id, patch) {
  const fields = []
  const params = { id }
  for (const [key, column] of Object.entries(QUOTE_FIELD_TO_COLUMN)) {
    if (patch[key] !== undefined) {
      fields.push(`${column} = @${key}`)
      params[key] = patch[key]
    }
  }
  if (fields.length === 0) return
  const database = getDb()
  database.prepare(`UPDATE quotes SET ${fields.join(", ")} WHERE id = @id`).run(params)
  bumpAndRecord(database, "quotes", "id", id)
}

function deleteQuote(id) {
  softDelete(getDb(), "quotes", "id", id)
}

/* ---------- Moteur de sync NAS (voir electron/nas-sync.js pour le cycle push/pull lui-même) ---------- */

function getTableColumns(database, table) {
  return database.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
}

function getSyncDeviceId() {
  return getDeviceId(getDb())
}

/** Changements locaux pas encore confirmés reçus par le NAS — à repousser au prochain cycle. */
function getUnpushedChanges(limit = 200) {
  return getDb().prepare("SELECT * FROM sync_changes WHERE pushed_at IS NULL ORDER BY seq ASC LIMIT ?").all(limit)
}

function markChangePushed(seq) {
  getDb().prepare("UPDATE sync_changes SET pushed_at = datetime('now') WHERE seq = ?").run(seq)
}

/** Dernière version de cette ligne que CE poste sait être en accord avec le NAS (ni en avance avec
 * une modification locale pas encore poussée, ni en retard par rapport à un pull pas encore tiré).
 * Sert à la fois de `baseVersion` envoyé au push et de référence pour détecter un conflit au pull. */
function getRowSyncedVersion(table, rowId) {
  const row = getDb()
    .prepare("SELECT last_synced_version FROM sync_row_state WHERE table_name = ? AND row_id = ?")
    .get(table, rowId)
  return row ? row.last_synced_version : 0
}

function setRowSyncedVersion(table, rowId, version) {
  getDb()
    .prepare(
      `INSERT INTO sync_row_state (table_name, row_id, last_synced_version, last_synced_at)
       VALUES (@table, @rowId, @version, datetime('now'))
       ON CONFLICT(table_name, row_id) DO UPDATE SET last_synced_version = excluded.last_synced_version, last_synced_at = excluded.last_synced_at`,
    )
    .run({ table, rowId, version })
}

/** Curseur de pull (dernier `seq` du journal serveur déjà reçu et appliqué) — purement local,
 * jamais dans `settings` (voir sync_meta dans shared/sync-schema.js). */
function getPullCursor() {
  const row = getDb().prepare("SELECT value FROM sync_meta WHERE key = 'server_seq_cursor'").get()
  return row ? Number(row.value) : 0
}

function setPullCursor(seq) {
  getDb()
    .prepare(
      `INSERT INTO sync_meta (key, value) VALUES ('server_seq_cursor', @seq)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run({ seq: String(seq) })
}

/** Applique un changement REÇU du NAS directement sur la table, sans repasser par recordChange —
 * sinon ce changement serait aussitôt rejournalisé et repoussé vers le NAS, boucle infinie. Ne
 * retient que les colonnes réellement présentes sur cette base (PRAGMA table_info), pour rester
 * robuste si le schéma local a légèrement dérivé de celui du serveur. */
function applyRemoteUpsert(table, rowId, payload) {
  const database = getDb()
  const pk = TABLE_PRIMARY_KEYS[table]
  if (!pk) throw new Error(`Table non synchronisée : ${table}`)
  const columns = getTableColumns(database, table)
  const presentCols = columns.filter(
    (c) => Object.prototype.hasOwnProperty.call(payload, c) && payload[c] !== undefined,
  )
  const updateCols = presentCols.filter((c) => !pk.includes(c))
  const sql = `INSERT INTO ${table} (${presentCols.join(", ")})
    VALUES (${presentCols.map((c) => `@${c}`).join(", ")})
    ON CONFLICT(${pk.join(", ")}) DO UPDATE SET ${updateCols.map((c) => `${c} = excluded.${c}`).join(", ")}`
  database.prepare(sql).run(payload)
}

function applyRemoteDelete(table, rowId, version) {
  const database = getDb()
  const pk = TABLE_PRIMARY_KEYS[table]
  const pkValues = pkValuesFromRowId(table, rowId)
  const where = pk.map((c) => `${c} = @${c}`).join(" AND ")
  database
    .prepare(
      `UPDATE ${table} SET deleted_at = datetime('now'), sync_version = @version, updated_at = datetime('now') WHERE ${where}`,
    )
    .run({ ...pkValues, version })
}

/** File d'attente des conflits détectés (même ligne modifiée des deux côtés depuis le dernier point
 * de sync commun) — jamais résolus automatiquement, voir components/parametres/sync-conflict-dialog. */
function addConflict({ table, rowId, localPayload, remotePayload }) {
  const id = crypto.randomUUID()
  getDb()
    .prepare(
      `INSERT INTO sync_conflicts (id, table_name, row_id, local_payload_json, remote_payload_json, detected_at)
       VALUES (@id, @table, @rowId, @localPayloadJson, @remotePayloadJson, datetime('now'))`,
    )
    .run({
      id,
      table,
      rowId,
      localPayloadJson: JSON.stringify(localPayload),
      remotePayloadJson: JSON.stringify(remotePayload),
    })
  return id
}

function parseConflictRow(r) {
  return {
    id: r.id,
    table: r.table_name,
    rowId: r.row_id,
    localPayload: JSON.parse(r.local_payload_json),
    remotePayload: JSON.parse(r.remote_payload_json),
    detectedAt: r.detected_at,
  }
}

function getConflicts() {
  return getDb()
    .prepare("SELECT * FROM sync_conflicts WHERE resolved_at IS NULL ORDER BY detected_at")
    .all()
    .map(parseConflictRow)
}

function getConflictById(id) {
  const r = getDb().prepare("SELECT * FROM sync_conflicts WHERE id = ?").get(id)
  return r ? parseConflictRow(r) : null
}

/** "Garder la version locale" : rien à écrire sur la table (la ligne locale porte déjà l'édition
 * voulue) — on avance juste le curseur local jusqu'à la version distante qui causait le conflit,
 * pour que le prochain push reparte avec le bon `baseVersion` et s'applique proprement. */
function resolveConflictKeepLocal(id) {
  const conflict = getConflictById(id)
  if (!conflict) return
  const remoteVersion = conflict.remotePayload?.sync_version ?? getRowSyncedVersion(conflict.table, conflict.rowId)
  setRowSyncedVersion(conflict.table, conflict.rowId, remoteVersion)
  getDb().prepare("UPDATE sync_conflicts SET resolved_at = datetime('now') WHERE id = ?").run(id)
}

/** "Garder la version du NAS" : on adopte le payload distant tel quel (déjà à la version que le
 * serveur reconnaît), donc ce poste est immédiatement de nouveau à jour — pas besoin de le repousser,
 * on était simplement en retard. L'éventuel changement local pas encore poussé pour cette ligne reste
 * dans sync_changes mais ne sera plus jamais appliqué (son row_id est désormais à une version plus
 * récente que celle sur laquelle il se basait) : marqué poussé pour ne pas le retenter en boucle. */
function resolveConflictKeepRemote(id) {
  const conflict = getConflictById(id)
  if (!conflict) return
  const remoteVersion = conflict.remotePayload?.sync_version ?? getRowSyncedVersion(conflict.table, conflict.rowId)
  if (conflict.remotePayload) {
    applyRemoteUpsert(conflict.table, conflict.rowId, conflict.remotePayload)
  } else {
    applyRemoteDelete(conflict.table, conflict.rowId, remoteVersion)
  }
  setRowSyncedVersion(conflict.table, conflict.rowId, remoteVersion)
  const database = getDb()
  database
    .prepare("UPDATE sync_changes SET pushed_at = datetime('now') WHERE table_name = @table AND row_id = @rowId AND pushed_at IS NULL")
    .run({ table: conflict.table, rowId: conflict.rowId })
  database.prepare("UPDATE sync_conflicts SET resolved_at = datetime('now') WHERE id = ?").run(id)
}

/** Version sync_version actuelle de la ligne elle-même (colonne de la table), à distinguer de
 * sync_row_state.last_synced_version (ce que CE poste sait être déjà confirmé par le NAS) — l'écart
 * entre les deux indique une modification locale pas encore poussée. */
function getRowCurrentVersion(table, rowId) {
  const pk = TABLE_PRIMARY_KEYS[table]
  if (!pk) return null
  const pkValues = pkValuesFromRowId(table, rowId)
  const where = pk.map((c) => `${c} = @${c}`).join(" AND ")
  const row = getDb().prepare(`SELECT sync_version FROM ${table} WHERE ${where}`).get(pkValues)
  return row ? row.sync_version : null
}

function getRowPayloadByRowId(table, rowId) {
  const pk = TABLE_PRIMARY_KEYS[table]
  if (!pk) return null
  const pkValues = pkValuesFromRowId(table, rowId)
  const where = pk.map((c) => `${c} = @${c}`).join(" AND ")
  return getDb().prepare(`SELECT * FROM ${table} WHERE ${where}`).get(pkValues) ?? null
}

function hasUnresolvedConflict(table, rowId) {
  return !!getDb()
    .prepare("SELECT 1 FROM sync_conflicts WHERE table_name = ? AND row_id = ? AND resolved_at IS NULL")
    .get(table, rowId)
}

/** Petit bookkeeping local additionnel (statut de la dernière synchro NAS : date, erreur) — jamais
 * dans `settings`, par le même principe que device_id/server_seq_cursor. */
function getSyncMeta(key) {
  const row = getDb().prepare("SELECT value FROM sync_meta WHERE key = ?").get(key)
  return row ? row.value : null
}

function setSyncMeta(key, value) {
  getDb()
    .prepare(
      `INSERT INTO sync_meta (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run({ key, value })
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
  findOrCreatePayerByName,
  getOrAssignInvoiceNumber,
  updatePayer,
  deletePayer,
  deletePayerCascade,
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
  findDisciplineByLabel,
  findOrCreateDisciplineByLabel,
  updateDiscipline,
  deleteDiscipline,
  getQuotes,
  getQuoteById,
  createQuote,
  updateQuote,
  deleteQuote,
  getTransactions,
  getTransactionById,
  createTransaction,
  upsertTransactionByChargeId,
  upsertTransactionById,
  updateTransaction,
  deleteTransaction,
  getBankTransactions,
  insertBankTransactions,
  getSettings,
  setSetting,
  getVault,
  setVault,
  getSyncState,
  setSyncState,
  getSeasons,
  findSeasonByLabel,
  findOrCreateSeasonByLabel,
  createSeason,
  updateSeason,
  deleteSeason,
  deleteSeasonCascade,
  getClientSeasonMap,
  setClientSeason,
  deleteClientSeason,
  resetSeasonClients,
  getSyncDeviceId,
  getUnpushedChanges,
  markChangePushed,
  getRowSyncedVersion,
  setRowSyncedVersion,
  getPullCursor,
  setPullCursor,
  applyRemoteUpsert,
  applyRemoteDelete,
  addConflict,
  getConflicts,
  getConflictById,
  resolveConflictKeepLocal,
  resolveConflictKeepRemote,
  getRowCurrentVersion,
  getRowPayloadByRowId,
  hasUnresolvedConflict,
  getSyncMeta,
  setSyncMeta,
}
