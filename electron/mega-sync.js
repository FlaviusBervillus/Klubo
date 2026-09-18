const fs = require("fs")
const { Storage } = require("megajs")
const db = require("./db")

const BACKUP_FOLDER = "ComptaKungFu"

async function connect(email, password) {
  const storage = new Storage({ email, password })
  await storage.ready
  return storage
}

async function ensureBackupFolder(storage) {
  const existing = (storage.root.children || []).find(
    (f) => f.directory && f.name === BACKUP_FOLDER,
  )
  if (existing) return existing
  return storage.root.mkdir({ name: BACKUP_FOLDER })
}

async function backup(email, password) {
  const storage = await connect(email, password)
  try {
    const folder = await ensureBackupFolder(storage)
    const data = fs.readFileSync(db.getDbFilePath())
    const fileName = `compta_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.sqlite3`
    await new Promise((resolve, reject) => {
      folder.upload({ name: fileName, size: data.length }, data, (err, file) => {
        if (err) reject(err)
        else resolve(file)
      })
    })
    return { fileName, size: data.length }
  } finally {
    await storage.close()
  }
}

async function listBackups(email, password) {
  const storage = await connect(email, password)
  try {
    const folder = await ensureBackupFolder(storage)
    return (folder.children || [])
      .filter((f) => !f.directory)
      .map((f) => ({ id: f.nodeId, name: f.name, size: f.size, timestamp: f.timestamp }))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
  } finally {
    await storage.close()
  }
}

async function restore(email, password, fileId) {
  const storage = await connect(email, password)
  try {
    const folder = await ensureBackupFolder(storage)
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
