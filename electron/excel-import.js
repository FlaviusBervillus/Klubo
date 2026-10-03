const crypto = require("crypto")
const path = require("path")
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
  saison: "season",
  categorie: "category",
  discipline: "category", // colonne plus spécifique que "categorie" quand les deux existent (ex. export Notion) : voir le filtrage "valeur non vide" dans parseRows, qui la fait primer
  email: "email",
  email1: "email",
  telephone: "phone",
  telephone1: "phone",
  datenaissance: "birthDate",
  age: null, // recalculable depuis la date de naissance : on évite de stocker une donnée qui se périme
  adresse: "address",
  codepostal: "postalCode",
  ville: "city",
  nomrepresentantlegal: "guardianLastName",
  prenomrepresentantlegal: "guardianFirstName",
  nomrepresentantlegal2: "guardianLastName2",
  prenomrepresentantlegal2: "guardianFirstName2",
}

/** Rapproche la catégorie lue dans le fichier avec une discipline connue (celles configurées sur
 * la page /disciplines, en plus des 6 historiques) — toujours relu et confirmé par l'utilisateur
 * dans l'écran de vérification avant application, donc une approximation reste sans risque ici. */
function matchCourseType(raw, disciplineLabels) {
  if (!raw) return null
  const norm = normalizeHeader(raw)
  const candidates = [...new Set([...COURSE_TYPES, ...disciplineLabels])]
  const exact = candidates.find((c) => normalizeHeader(c) === norm)
  if (exact) return exact
  return candidates.find((c) => normalizeHeader(c).includes(norm) || norm.includes(normalizeHeader(c))) || null
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

/** Lit le fichier (Excel ou CSV — un export Notion sort en CSV) et le transforme en lignes
 * exploitables (sans toucher à la base). */
async function parseExcelFile(filePath) {
  const workbook = new ExcelJS.Workbook()
  const isCsv = path.extname(filePath).toLowerCase() === ".csv"
  const sheet = isCsv
    ? await workbook.csv.readFile(filePath)
    : await workbook.xlsx.readFile(filePath).then(() => workbook.worksheets[0])
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
      // Plusieurs colonnes peuvent viser le même champ (ex. "CATEGORIE" et "DISCIPLINE") : on ne
      // laisse une colonne vide écraser une valeur déjà lue par une colonne précédente.
      const value = cellText(row.getCell(Number(colNumber)))
      if (value !== null && value !== undefined && String(value).trim() !== "") data[key] = value
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
      season: data.season ? String(data.season).trim() : "",
      // Représentant légal (parent/tuteur) : utilisé uniquement pour proposer un lien
      // tuteur/enfant à la vérification — ne touche jamais au statut/cours de qui que ce soit.
      guardianFirstName: String(data.guardianFirstName || "").trim(),
      guardianLastName: String(data.guardianLastName || "").trim(),
      guardianFirstName2: String(data.guardianFirstName2 || "").trim(),
      guardianLastName2: String(data.guardianLastName2 || "").trim(),
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
  const disciplineLabels = db.getDisciplines().map((d) => d.label)

  const items = rows.map((row, rowIndex) => {
    const courseType = matchCourseType(row.category, disciplineLabels)
    const normName = normalizeName(row.firstName, row.lastName)

    let kind = "create"
    let matchedClientId = null
    let existingSnapshot = null
    let patch = null
    let relatedClientId = null
    let relatedClientName = null
    let relatedPayerId = null
    let relatedPayerName = null

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
      relatedPayerId,
      relatedPayerName,
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

  // Repère le·s représentant·s légal·aux (parent/tuteur = payeur) indiqué·s nommément sur la
  // ligne (ex. colonnes "NOM/PRENOM REPRESENTANT LEGAL" d'un export Notion) : un signal plus
  // fiable qu'un email partagé, lui aussi proposé en complément, jamais imposé — seul le cours de
  // l'enfant (déjà calculé plus haut, sur sa propre ligne) détermine son statut, le lien ne fait
  // que relier les deux fiches. On préfère, dans l'ordre : une ligne du même fichier, un payeur
  // déjà connu, puis un adhérent existant (qui deviendra aussi payeur si on le choisit).
  for (const item of items) {
    const guardianNamePairs = [
      [item.guardianFirstName, item.guardianLastName],
      [item.guardianFirstName2, item.guardianLastName2],
    ].filter(([first, last]) => first || last)

    for (const [guardianFirst, guardianLast] of guardianNamePairs) {
      const guardianNorm = normalizeName(guardianFirst, guardianLast)
      if (!guardianNorm || guardianNorm === normalizeName(item.firstName, item.lastName)) continue

      const peerRow = items.find(
        (other) => other !== item && normalizeName(other.firstName, other.lastName) === guardianNorm,
      )
      if (peerRow) {
        if (!item.clusterRowIndexes.includes(peerRow.rowIndex)) item.clusterRowIndexes.push(peerRow.rowIndex)
        continue
      }
      if (!item.relatedPayerId) {
        const existingPayer = db.findPayerForImport({ email: "", firstName: guardianFirst, lastName: guardianLast })
        if (existingPayer) {
          item.relatedPayerId = existingPayer.id
          item.relatedPayerName = clientFullName({ first_name: existingPayer.first_name, last_name: existingPayer.last_name })
          continue
        }
      }
      if (!item.relatedClientId) {
        const existingGuardian = db.findClientForImport({ email: "", firstName: guardianFirst, lastName: guardianLast })
        if (existingGuardian && existingGuardian.id !== item.matchedClientId) {
          item.relatedClientId = existingGuardian.id
          item.relatedClientName = clientFullName(existingGuardian)
        }
      }
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

  // Un client importé doit apparaître dans l'effectif d'une saison (les saisons démarrent
  // vides) : s'il vient d'une ligne qui précise sa saison (ex. colonne "Saison" d'un export
  // Notion), on l'inscrit/le met à jour sur CETTE saison précisément (recherchée par libellé, ou
  // créée au besoin) ; sinon on retombe sur l'ancien comportement : inscription dans la saison
  // active si pas déjà présent, sans jamais écraser une saison où il est déjà inscrit.
  const settings = db.getSettings()
  const activeSeasonId = settings.activeSeasonId || null
  const seasonRosterCache = new Map()

  function rosterFor(seasonId) {
    if (!seasonRosterCache.has(seasonId)) {
      seasonRosterCache.set(seasonId, db.getClientSeasonMap(seasonId))
    }
    return seasonRosterCache.get(seasonId)
  }

  function enrollForItem(item, clientId, status) {
    if (item.season) {
      const season = db.findOrCreateSeasonByLabel(item.season)
      const roster = rosterFor(season.id)
      const paid = roster[clientId]?.paid ?? false
      db.setClientSeason(clientId, season.id, { status: status || "Non catégorisé", paid })
      roster[clientId] = { status: status || "Non catégorisé", paid }
      db.addImportBatchChange({
        id: crypto.randomUUID(),
        batchId,
        clientId,
        kind: "enroll",
        previousJson: JSON.stringify({ seasonId: season.id }),
      })
      return
    }
    if (!activeSeasonId) return
    const roster = rosterFor(activeSeasonId)
    if (clientId in roster) return
    db.setClientSeason(clientId, activeSeasonId, { status: status || "Non catégorisé", paid: false })
    roster[clientId] = { status: status || "Non catégorisé", paid: false }
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
        enrollForItem(item, item.matchedClientId, item.existingSnapshot?.status)
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
      enrollForItem(item, item.matchedClientId, patch.status || before.status)
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
      })
      db.addImportBatchChange({ id: crypto.randomUUID(), batchId, clientId: id, kind: "create", previousJson: null })
      enrollForItem(item, id, item.courseType)
      rowIndexToClientId[item.rowIndex] = id
      created++
    }
  }

  // Le lien choisi désigne toujours un PAYEUR (jamais directement un autre adhérent) : s'il s'agit
  // d'une ligne du fichier ou d'un adhérent existant, on lui garantit un payeur (le sien, créé au
  // besoin depuis sa propre fiche) plutôt que de créer un doublon à chaque import.
  let linked = 0
  for (const item of items) {
    const decision = decisions[item.rowIndex]
    if (!decision || decision.proceed === false || !decision.guardian) continue
    const childClientId = rowIndexToClientId[item.rowIndex]
    if (!childClientId) continue

    let payerId = null
    if (decision.guardian.type === "row") {
      const peerClientId = rowIndexToClientId[decision.guardian.rowIndex] || null
      if (peerClientId && peerClientId !== childClientId) payerId = db.ensurePayerForClient(peerClientId)
    } else if (decision.guardian.type === "client") {
      if (decision.guardian.clientId && decision.guardian.clientId !== childClientId) {
        payerId = db.ensurePayerForClient(decision.guardian.clientId)
      }
    } else if (decision.guardian.type === "payer") {
      payerId = decision.guardian.payerId || null
    }
    if (!payerId) continue

    const before = db.getClientById(childClientId)
    db.updateClient(childClientId, { payerId })
    db.addImportBatchChange({
      id: crypto.randomUUID(),
      batchId,
      clientId: childClientId,
      kind: "update",
      previousJson: JSON.stringify({ payerId: before.payer_id ?? null }),
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
