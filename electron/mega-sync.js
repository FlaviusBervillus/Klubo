const fs = require("fs")
const { Storage } = require("megajs")
const db = require("./db")
const { generateExcelBuffer } = require("./excel-export")

const BACKUP_FOLDER_PATH = ["Éléments partagés", "Bureau USJA Kung Fu", "Trésorier", "Backup_Klubo"]

async function connect(email, password) {
  const storage = new Storage({ email, password })
  await storage.ready
  return storage
}

/** Crée (ou réutilise) chaque dossier du chemin, un niveau à la fois. */
async function ensureFolderPath(storage, segments) {
  let current = storage.root
  for (const segment of segments) {
    const existing = (current.children || []).find((f) => f.directory && f.name === segment)
    current = existing || (await current.mkdir({ name: segment }))
  }
  return current
}

function uploadBuffer(folder, name, data) {
  return new Promise((resolve, reject) => {
    folder.upload({ name, size: data.length }, data, (err, file) => {
      if (err) reject(err)
      else resolve(file)
    })
  })
}

async function backup(email, password) {
  const storage = await connect(email, password)
  try {
    const folder = await ensureFolderPath(storage, BACKUP_FOLDER_PATH)
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")

    const dbData = fs.readFileSync(db.getDbFilePath())
    const dbFileName = `compta_${timestamp}.sqlite3`
    await uploadBuffer(folder, dbFileName, dbData)

    // Le .sqlite3 sert à restaurer depuis l'app ; le .xlsx est là pour que n'importe qui
    // (bureau, commissaire aux comptes...) puisse consulter les données sans installer Klubo.
    const excelData = Buffer.from(await generateExcelBuffer())
    const excelFileName = `compta_${timestamp}.xlsx`
    await uploadBuffer(folder, excelFileName, excelData)

    return { fileName: dbFileName, size: dbData.length }
  } finally {
    await storage.close()
  }
}

async function listBackups(email, password) {
  const storage = await connect(email, password)
  try {
    const folder = await ensureFolderPath(storage, BACKUP_FOLDER_PATH)
    return (folder.children || [])
      .filter((f) => !f.directory && f.name.endsWith(".sqlite3"))
      .map((f) => ({ id: f.nodeId, name: f.name, size: f.size, timestamp: f.timestamp }))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
  } finally {
    await storage.close()
  }
}

async function restore(email, password, fileId) {
  const storage = await connect(email, password)
  try {
    const folder = await ensureFolderPath(storage, BACKUP_FOLDER_PATH)
    const file = (folder.children || []).find((f) => f.nodeId === fileId)
    if (!file) throw new Error("Sauvegarde introuvable sur Mega")
    const data = await file.downloadBuffer({})
    db.closeDb()
    fs.writeFileSync(db.getDbFilePath(), data)
    db.getDb()
    return true
  } finally {
    await storage.close()
  }
}

module.exports = { backup, listBackups, restore }
