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

/** Insensible aux accents, à la casse, aux espaces et aux underscores — pour tolérer les
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

/** Le cours indiqué dans le fichier (ex. "Adulte") ne correspond pas forcément mot pour mot à
 * nos libellés internes (ex. "Kung-fu Adulte") : on cherche une correspondance exacte, puis partielle. */
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

/** Importe/complète les fiches clients depuis un fichier Excel (.xlsx/.xls). Ne modifie que les
 * champs actuellement vides des clients déjà connus (on "complète", on n'écrase jamais une valeur
 * déjà saisie) ; les lignes sans correspondance deviennent de nouvelles fiches client. */
async function importClientsFromExcel(filePath) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const sheet = workbook.worksheets[0]
  if (!sheet) return { created: 0, updated: 0, skipped: 0 }

  const headerRow = sheet.getRow(1)
  const columnMap = {}
  headerRow.eachCell((cell, colNumber) => {
    const key = HEADER_MAP[normalizeHeader(cellText(cell))]
    if (key) columnMap[colNumber] = key
  })

  let created = 0
  let updated = 0
  let skipped = 0

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber)
    if (row.cellCount === 0) continue

    const data = {}
    for (const [colNumber, key] of Object.entries(columnMap)) {
      data[key] = cellText(row.getCell(Number(colNumber)))
    }

    const firstName = String(data.firstName || "").trim()
    const lastName = String(data.lastName || "").trim()
    if (!firstName && !lastName) {
      skipped++
      continue
    }

    const email = String(data.email || "").trim()
    const phone = String(data.phone || "").trim()
    const address = String(data.address || "").trim()
    const postalCode = String(data.postalCode || "").trim()
    const city = String(data.city || "").trim()
    const birthDate = parseBirthDate(data.birthDate)
    const courseType = matchCourseType(data.category)

    const existing = db.findClientForImport({ email, firstName, lastName })

    if (existing) {
      const patch = {}
      if (!existing.email && email) patch.email = email
      if (!existing.phone && phone) patch.phone = phone
      if (!existing.address && address) patch.address = address
      if (!existing.postal_code && postalCode) patch.postalCode = postalCode
      if (!existing.city && city) patch.city = city
      if (!existing.birth_date && birthDate) patch.birthDate = birthDate
      if ((!existing.status || existing.status === "Non catégorisé") && courseType) patch.status = courseType

      if (Object.keys(patch).length > 0) {
        db.updateClient(existing.id, patch)
        updated++
      } else {
        skipped++
      }
    } else {
      db.createClient({
        id: `import_${crypto.randomUUID()}`,
        firstName,
        lastName,
        email,
        phone,
        address,
        postalCode,
        city,
        birthDate,
        status: courseType || "Non catégorisé",
        method: "especes",
        paid: false,
      })
      created++
    }
  }

  return { created, updated, skipped }
}

module.exports = { importClientsFromExcel }
