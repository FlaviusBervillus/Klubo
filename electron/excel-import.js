const crypto = require("crypto")
const ExcelJS = require("exceljs")
const db = require("./db")

const COURSE_TYPES = [
  "Kung-fu Adulte",
  "Kung-fu Ado",
  "Kung-fu Enfant",
  "Fitness de combat",
  "Tai-chi",
  "Self-défense",
  "Non catégorisé",
]

/** camelCase (utilisé dans les patchs) -> colonne SQL, pour pouvoir sauvegarder la valeur
 * précédente d'un champ avant de l'écraser et ainsi permettre l'annulation d'un import. */
const FIELD_TO_COLUMN = {
  email: "email",
  phone: "phone",
  address: "address",
  postalCode: "postal_code",
  city: "city",
  birthDate: "birth_date",
  status: "status",
  guardianId: "guardian_id",
}

/** Insensible aux accents, à la casse, aux espaces/underscores/tirets — pour tolérer les
 * variantes d'écriture des en-têtes entre le fichier du club et nos clés internes. */
function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
}

const HEADER_MAP = {
  nom: "lastName",
  prenom: "firstName",
  categorie: "category",
  email: "email",
  email1: "email",
  telephone: "phone",
  telephone1: "phone",
  datenaissance: "birthDate",
  age: null, // recalculable depuis la date de naissance : on évite de stocker une donnée qui se périme
  adresse: "address",
  codepostal: "postalCode",
  ville: "city",
}

function matchCourseType(raw) {
  if (!raw) return null
  const norm = normalizeHeader(raw)
  const exact = COURSE_TYPES.find((c) => normalizeHeader(c) === norm)
  if (exact) return exact
  return COURSE_TYPES.find((c) => normalizeHeader(c).includes(norm) || norm.includes(normalizeHeader(c))) || null
}

function parseBirthDate(value) {
  if (!value) return null
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  const str = String(value).trim()
  const m = str.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) {
    let [, d, mo, y] = m
    if (y.length === 2) y = (Number(y) > 30 ? "19" : "20") + y
    return `${y.padStart(4, "0")}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`
  }
  return str || null
}

function cellText(cell) {
  let value = cell.value
  if (value && typeof value === "object" && "text" in value) value = value.text
  if (value && typeof value === "object" && "result" in value) value = value.result
  return value
}

function normalizeName(firstName, lastName) {
  return normalizeHeader(`${firstName} ${lastName}`)
}

function clientFullName(client) {
  return `${client.first_name} ${client.last_name}`.trim()
}

/** Lit le fichier Excel et le transforme en lignes exploitables (sans toucher à la base). */
async function parseExcelFile(filePath) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const sheet = workbook.worksheets[0]
  if (!sheet) return []

  const headerRow = sheet.getRow(1)
  const columnMap = {}
  headerRow.eachCell((cell, colNumber) => {
    const key = HEADER_MAP[normalizeHeader(cellText(cell))]
    if (key) columnMap[colNumber] = key
  })

  const rows = []
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber)
    if (row.cellCount === 0) continue
    const data = {}
    for (const [colNumber, key] of Object.entries(columnMap)) {
      data[key] = cellText(row.getCell(Number(colNumber)))
    }
    const firstName = String(data.firstName || "").trim()
    const lastName = String(data.lastName || "").trim()
    if (!firstName && !lastName) continue
    rows.push({
      firstName,
      lastName,
      email: String(data.email || "").trim(),
      phone: String(data.phone || "").trim(),
      address: String(data.address || "").trim(),
      postalCode: String(data.postalCode || "").trim(),
      city: String(data.city || "").trim(),
      birthDate: parseBirthDate(data.birthDate),
      category: data.category ? String(data.category).trim() : "",
    })
  }
  return rows
}

/** Compare une ligne du fichier à une fiche client existante et ne retient que les champs
 * actuellement vides côté client : on "complète" un dossier, on n'écrase jamais une valeur déjà saisie. */
function computeFillPatch(row, existing, courseType) {
  const patch = {}
  if (!existing.email && row.email) patch.email = row.email
  if (!existing.phone && row.phone) patch.phone = row.phone
  if (!existing.address && row.address) patch.address = row.address
  if (!existing.postal_code && row.postalCode) patch.postalCode = row.postalCode
  if (!existing.city && row.city) patch.city = row.city
  if (!existing.birth_date && row.birthDate) patch.birthDate = row.birthDate
  if ((!existing.status || existing.status === "Non catégorisé") && courseType) patch.status = courseType
  return patch
}

/** Analyse un fichier Excel et prépare un plan d'import (créations/complétions proposées), sans
 * rien écrire en base : l'utilisateur vérifie et valide chaque ligne avant application. Détecte
 * aussi les cas où plusieurs personnes (fichier ou base) partagent le même email — souvent un
 * parent et son enfant — pour proposer un lien tuteur/enfant, sans jamais le forcer. */
async function analyzeImport(filePath) {
  const rows = await parseExcelFile(filePath)

  const items = rows.map((row, rowIndex) => {
    const courseType = matchCourseType(row.category)
    const normName = normalizeName(row.firstName, row.lastName)

    let kind = "create"
    let matchedClientId = null
    let existingSnapshot = null
    let patch = null
    let relatedClientId = null
    let relatedClientName = null

    // Un email peut être partagé par plusieurs personnes (parent + enfant) : on cherche d'abord
    // celle dont le nom correspond exactement, et seulement si aucune ne correspond on considère
    // qu'il s'agit d'une personne différente (candidate au lien tuteur/enfant).
    const emailMatches = row.email ? db.findClientsByEmail(row.email) : []
    if (emailMatches.length > 0) {
      const sameName = emailMatches.find((c) => normalizeName(c.first_name, c.last_name) === normName)
      if (sameName) {
        kind = "update"
        matchedClientId = sameName.id
      } else {
        relatedClientId = emailMatches[0].id
        relatedClientName = clientFullName(emailMatches[0])
      }
    }
    if (kind === "create" && !relatedClientId) {
      const nameMatch = db.findClientForImport({ email: "", firstName: row.firstName, lastName: row.lastName })
      if (nameMatch) {
        kind = "update"
        matchedClientId = nameMatch.id
      }
    }

    if (kind === "update") {
      existingSnapshot = db.getClientById(matchedClientId)
      patch = computeFillPatch(row, existingSnapshot, courseType)
    }

    return {
      rowIndex,
      ...row,
      courseType,
      kind,
      matchedClientId,
      existingSnapshot: existingSnapshot
        ? {
            firstName: existingSnapshot.first_name,
            lastName: existingSnapshot.last_name,
            email: existingSnapshot.email,
            phone: existingSnapshot.phone,
            address: existingSnapshot.address,
            postalCode: existingSnapshot.postal_code,
            city: existingSnapshot.city,
            birthDate: existingSnapshot.birth_date,
            status: existingSnapshot.status,
          }
        : null,
      patch,
      relatedClientId,
      relatedClientName,
      clusterRowIndexes: [],
    }
  })

  // Regroupe les lignes du fichier qui partagent un même email mais des identités différentes
  // (ex. le parent et l'enfant) : on le signale, l'utilisateur choisit s'il veut les lier.
  const byEmail = new Map()
  for (const item of items) {
    if (!item.email) continue
    const key = item.email.toLowerCase()
    if (!byEmail.has(key)) byEmail.set(key, [])
    byEmail.get(key).push(item)
  }
  for (const group of byEmail.values()) {
    if (group.length < 2) continue
    const distinctNames = new Set(group.map((i) => normalizeName(i.firstName, i.lastName)))
    if (distinctNames.size < 2) continue
    for (const item of group) {
      item.clusterRowIndexes = group
        .filter((other) => other !== item && normalizeName(other.firstName, other.lastName) !== normalizeName(item.firstName, item.lastName))
        .map((other) => other.rowIndex)
    }
  }

  return items
}

/** Applique le plan validé par l'utilisateur (après édition/décoche éventuelle) et enregistre
 * chaque changement dans un lot d'import, pour pouvoir tout annuler d'un coup plus tard. */
function applyImport(items, decisions) {
  const batchId = crypto.randomUUID()
  const rowIndexToClientId = {}
  let created = 0
  let updated = 0
  let skipped = 0

  // Un client importé doit apparaître dans l'effectif de la saison active (les saisons démarrent
  // vides) : on l'y inscrit automatiquement s'il n'y est pas déjà, sans jamais toucher à celles où il l'est déjà.
  const settings = db.getSettings()
  const activeSeasonId = settings.activeSeasonId || null
  const existingSeasonRoster = activeSeasonId ? db.getClientSeasonMap(activeSeasonId) : {}

  function enrollInActiveSeasonIfNeeded(clientId, status) {
    if (!activeSeasonId || clientId in existingSeasonRoster) return
    db.setClientSeason(clientId, activeSeasonId, { status: status || "Non catégorisé", paid: false })
    db.addImportBatchChange({
      id: crypto.randomUUID(),
      batchId,
      clientId,
      kind: "enroll",
      previousJson: JSON.stringify({ seasonId: activeSeasonId }),
    })
  }

  for (const item of items) {
    const decision = decisions[item.rowIndex] || {}
    if (decision.proceed === false) {
      skipped++
      continue
    }

    if (item.kind === "update") {
      rowIndexToClientId[item.rowIndex] = item.matchedClientId
      const patch = item.patch || {}
      if (Object.keys(patch).length === 0) {
        enrollInActiveSeasonIfNeeded(item.matchedClientId, item.existingSnapshot?.status)
        skipped++
        continue
      }
      const before = db.getClientById(item.matchedClientId)
      db.updateClient(item.matchedClientId, patch)
      const previous = {}
      for (const key of Object.keys(patch)) previous[key] = before[FIELD_TO_COLUMN[key]] ?? null
      db.addImportBatchChange({
        id: crypto.randomUUID(),
        batchId,
        clientId: item.matchedClientId,
        kind: "update",
        previousJson: JSON.stringify(previous),
      })
      enrollInActiveSeasonIfNeeded(item.matchedClientId, patch.status || before.status)
      updated++
    } else {
      const id = `import_${crypto.randomUUID()}`
      db.createClient({
        id,
        firstName: item.firstName,
        lastName: item.lastName,
        email: item.email,
        phone: item.phone,
        address: item.address,
        postalCode: item.postalCode,
        city: item.city,
        birthDate: item.birthDate,
        status: item.courseType || "Non catégorisé",
        method: "especes",
        paid: false,
        guardianId: null,
      })
      db.addImportBatchChange({ id: crypto.randomUUID(), batchId, clientId: id, kind: "create", previousJson: null })
      enrollInActiveSeasonIfNeeded(id, item.courseType)
      rowIndexToClientId[item.rowIndex] = id
      created++
    }
  }

  let linked = 0
  for (const item of items) {
    const decision = decisions[item.rowIndex]
    if (!decision || decision.proceed === false || !decision.guardian) continue
    const childClientId = rowIndexToClientId[item.rowIndex]
    if (!childClientId) continue
    const guardianClientId =
      decision.guardian.type === "row"
        ? rowIndexToClientId[decision.guardian.rowIndex] || null
        : decision.guardian.clientId || null
    if (!guardianClientId || guardianClientId === childClientId) continue

    const before = db.getClientById(childClientId)
    db.updateClient(childClientId, { guardianId: guardianClientId })
    db.addImportBatchChange({
      id: crypto.randomUUID(),
      batchId,
      clientId: childClientId,
      kind: "update",
      previousJson: JSON.stringify({ guardianId: before.guardian_id ?? null }),
    })
    linked++
  }

  db.createImportBatch({ id: batchId, createdCount: created, updatedCount: updated, skippedCount: skipped })
  return { batchId, created, updated, skipped, linked }
}

/** Annule un lot d'import : supprime les fiches créées et restaure les champs complétés à leur
 * valeur d'avant import, en défaisant les changements dans l'ordre inverse. */
function undoImport(batchId) {
  const changes = db.getImportBatchChanges(batchId)
  for (let i = changes.length - 1; i >= 0; i--) {
    const change = changes[i]
    if (change.kind === "create") {
      db.deleteClient(change.client_id)
    } else if (change.kind === "enroll") {
      const previous = change.previous_json ? JSON.parse(change.previous_json) : {}
      if (previous.seasonId) db.deleteClientSeason(change.client_id, previous.seasonId)
    } else {
      const previous = change.previous_json ? JSON.parse(change.previous_json) : {}
      if (Object.keys(previous).length > 0) db.updateClient(change.client_id, previous)
    }
  }
  db.markImportBatchUndone(batchId)
  return { ok: true }
}

module.exports = { analyzeImport, applyImport, undoImport }
