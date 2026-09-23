const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron")
const path = require("path")
const fs = require("fs")
const https = require("https")
const crypto = require("crypto")
const { createStaticServer } = require("../scripts/static-server")
const db = require("./db")
const { stripeRequest } = require("./stripe-client")
const stripeSync = require("./stripe-sync")
const gocardlessSync = require("./gocardless-sync")
const megaSync = require("./mega-sync")
const { generateReceiptPdf, renderInvoiceHtml } = require("./invoice-pdf")
const { setupAutoUpdater } = require("./updater")

const PROTOCOL = "klubo"

// Renommage de l'app ("Electron" -> "Klubo" dans le menu, le Dock, la barre de titre) : le
// dossier de données utilisateur reste explicitement pointé sur l'ancien nom ("my-project",
// utilisé avant ce renommage) pour ne pas perdre l'accès à la base SQLite déjà existante.
app.setName("Klubo")
app.setPath("userData", path.join(app.getPath("appData"), "my-project"))

let mainWindow = null

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "Klubo",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  })
  mainWindow.loadURL(`http://127.0.0.1:${port}/`)
}

function handleProtocolUrl(url) {
  if (!mainWindow || !url) return
  try {
    const parsed = new URL(url)
    const requisitionId = parsed.searchParams.get("ref") || parsed.hostname
    mainWindow.webContents.send("gocardless:callback", requisitionId)
    mainWindow.focus()
  } catch {
    // URL de callback invalide — on ignore
  }
}

/* ---------- Enregistrement du schéma d'URL pour le retour de consentement GoCardless ---------- */
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on("second-instance", (_event, argv) => {
    const url = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`))
    if (url) handleProtocolUrl(url)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

app.on("open-url", (event, url) => {
  event.preventDefault()
  handleProtocolUrl(url)
})

/* ---------- IPC : base de données ---------- */
ipcMain.handle("db:getUsers", () => db.getUsers())
ipcMain.handle("db:countUsers", () => db.countUsers())
ipcMain.handle("db:findUserByEmail", (_e, email) => db.findUserByEmail(email) ?? null)
ipcMain.handle("db:createUser", (_e, user) => {
  db.createUser({ ...user, id: user.id || crypto.randomUUID() })
})
ipcMain.handle("db:updateUser", (_e, id, patch) => db.updateUser(id, patch))
ipcMain.handle("db:deleteUser", (_e, id) => db.deleteUser(id))

ipcMain.handle("db:getClients", () => db.getClients())
ipcMain.handle("db:createClient", (_e, client) => {
  db.createClient({ ...client, id: client.id || crypto.randomUUID() })
})
ipcMain.handle("db:updateClient", (_e, id, patch) => db.updateClient(id, patch))
ipcMain.handle("db:deleteClient", (_e, id) => db.deleteClient(id))

ipcMain.handle("db:getTransactions", () => db.getTransactions())
ipcMain.handle("db:createTransaction", (_e, tx) => {
  db.createTransaction({ ...tx, id: tx.id || crypto.randomUUID() })
})
ipcMain.handle("db:updateTransaction", (_e, id, patch) => db.updateTransaction(id, patch))

ipcMain.handle("db:getBankTransactions", () => db.getBankTransactions())

ipcMain.handle("db:getSettings", () => db.getSettings())
ipcMain.handle("db:getSyncState", (_e, provider) => db.getSyncState(provider) ?? null)
ipcMain.handle("db:setSetting", (_e, key, value) => db.setSetting(key, value))

ipcMain.handle("db:getSeasons", () => db.getSeasons())
ipcMain.handle("db:createSeason", (_e, season) => {
  db.createSeason({ ...season, id: season.id || crypto.randomUUID() })
})
ipcMain.handle("db:updateSeason", (_e, id, patch) => db.updateSeason(id, patch))
ipcMain.handle("db:deleteSeason", (_e, id) => db.deleteSeason(id))
ipcMain.handle("db:getClientSeasonMap", (_e, seasonId) => db.getClientSeasonMap(seasonId))
ipcMain.handle("db:setClientSeason", (_e, clientId, seasonId, payload) =>
  db.setClientSeason(clientId, seasonId, payload),
)

ipcMain.handle("vault:read", () => db.getVault() ?? null)
ipcMain.handle("vault:write", (_e, payload) => db.setVault(payload))

/* ---------- IPC : justificatifs de paiement (PDF) ---------- */

function getClubSettings() {
  const settings = db.getSettings()
  return {
    name: settings.clubName || "Club",
    address: settings.clubAddress || "",
    phone: settings.clubPhone || "",
    rna: settings.clubRna || "",
    logoUrl: settings.clubLogoUrl || null,
    stampUrl: settings.clubStampUrl || null,
    signatureUrl: settings.clubSignatureUrl || null,
  }
}

/** Client à facturer : celui retrouvé automatiquement (Stripe), sauf si le trésorier a lié/saisi autre chose dans l'aperçu. */
function resolveClient(tx, overrides) {
  if (!overrides) return db.findClientForTransaction(tx)
  return {
    id: overrides.clientId || null,
    first_name: overrides.firstName || "",
    last_name: overrides.lastName || "",
    email: overrides.email || "",
    address: overrides.address || "",
  }
}

ipcMain.handle("receipts:prepare", (_e, transactionId) => {
  const tx = db.getTransactionById(transactionId)
  if (!tx) return { ok: false, error: "Transaction introuvable" }
  const client = db.findClientForTransaction(tx)
  return {
    ok: true,
    tx: { id: tx.id, description: tx.description, amount: tx.amount, date: tx.date, method: tx.method },
    client: client ?? null,
    stripeInvoicePdfUrl: tx.stripe_invoice_pdf_url || null,
  }
})

/** Suit les redirections (les liens de facture Stripe en font parfois vers un CDN). */
function downloadUrlToBuffer(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirectsLeft <= 0) return reject(new Error("Trop de redirections"))
          res.resume()
          resolve(downloadUrlToBuffer(res.headers.location, redirectsLeft - 1))
          return
        }
        if (res.statusCode !== 200) {
          res.resume()
          reject(new Error(`Téléchargement de la facture Stripe échoué (HTTP ${res.statusCode})`))
          return
        }
        const chunks = []
        res.on("data", (chunk) => chunks.push(chunk))
        res.on("end", () => resolve(Buffer.concat(chunks)))
        res.on("error", reject)
      })
      .on("error", reject)
  })
}

/** Télécharge la vraie facture PDF émise par Stripe (Stripe Invoicing) pour une transaction. */
ipcMain.handle("receipts:download-stripe-invoice", async (_e, transactionId) => {
  try {
    const tx = db.getTransactionById(transactionId)
    if (!tx?.stripe_invoice_pdf_url) return { ok: false, error: "Aucune facture Stripe pour cette transaction" }
    const pdfBuffer = await downloadUrlToBuffer(tx.stripe_invoice_pdf_url)
    const safeName = (tx.member || tx.id).replace(/[^a-zA-Z0-9]+/g, "_")
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: "Enregistrer la facture Stripe",
      defaultPath: `Facture_Stripe_${safeName}.pdf`,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    fs.writeFileSync(filePath, pdfBuffer)
    return { ok: true, path: filePath }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle("receipts:render-preview", (_e, transactionId, overrides) => {
  try {
    const tx = db.getTransactionById(transactionId)
    if (!tx) return { ok: false, error: "Transaction introuvable" }
    const html = renderInvoiceHtml(tx, getClubSettings(), resolveClient(tx, overrides))
    return { ok: true, html }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle("receipts:download", async (_e, transactionId, overrides) => {
  try {
    const tx = db.getTransactionById(transactionId)
    if (!tx) return { ok: false, error: "Transaction introuvable" }
    let client = resolveClient(tx, overrides)
    if (overrides) {
      const clientId = overrides.clientId || db.findClientForTransaction(tx)?.id || null
      if (clientId) {
        db.updateClient(clientId, {
          firstName: overrides.firstName,
          lastName: overrides.lastName,
          email: overrides.email,
          address: overrides.address,
        })
        client = { ...client, id: clientId }
      }
    }
    const pdfBuffer = await generateReceiptPdf(tx, getClubSettings(), client)
    const safeName = (`${client?.first_name || ""} ${client?.last_name || ""}`.trim() || tx.member || tx.id).replace(
      /[^a-zA-Z0-9]+/g,
      "_",
    )
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: "Enregistrer le justificatif",
      defaultPath: `Facture_${safeName}.pdf`,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    fs.writeFileSync(filePath, pdfBuffer)
    return { ok: true, path: filePath }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

/**
 * Une fois la saison active terminée, on exige une sauvegarde Mega (donc un point de
 * restauration sûr) avant d'accepter d'y mélanger les paiements de la saison suivante.
 * Renvoie un message d'erreur si la synchro doit être bloquée, sinon null.
 */
function requireBackupBeforeStripeSync() {
  const settings = db.getSettings()
  const activeSeasonId = settings.activeSeasonId
  if (!activeSeasonId) return null
  const season = db.getSeasons().find((s) => s.id === activeSeasonId)
  if (!season) return null

  const today = new Date().toISOString().slice(0, 10)
  if (today <= season.end_date) return null // saison encore en cours

  const megaState = db.getSyncState("mega")
  if (!megaState?.last_synced_at || megaState.last_synced_at < season.end_date) {
    return `La saison "${season.label}" est terminée : faites une sauvegarde Mega avant de synchroniser Stripe pour la nouvelle saison (Paramètres → Sauvegarde).`
  }
  return null
}

/* ---------- IPC : Stripe ---------- */
ipcMain.handle("stripe:test-connection", async (_event, secretKey) => {
  if (!secretKey || typeof secretKey !== "string") {
    return { ok: false, error: "Clé secrète manquante" }
  }
  try {
    const balance = await stripeRequest("/v1/balance", secretKey)
    return { ok: true, available: balance.available ?? [] }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle("stripe:sync-all", async (_event, secretKey) => {
  const blockReason = requireBackupBeforeStripeSync()
  if (blockReason) return { ok: false, error: blockReason }
  try {
    const result = await stripeSync.syncAll(secretKey)
    return { ok: true, ...result }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

/* ---------- IPC : GoCardless ---------- */
ipcMain.handle("gocardless:list-institutions", async (_e, secretId, secretKey, country) => {
  try {
    const institutions = await gocardlessSync.listInstitutions(secretId, secretKey, country)
    return { ok: true, institutions }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle("gocardless:start-consent", async (_e, secretId, secretKey, institutionId) => {
  try {
    const { requisitionId, link } = await gocardlessSync.startConsent(
      secretId,
      secretKey,
      institutionId,
      `${PROTOCOL}://gocardless-callback`,
    )
    await shell.openExternal(link)
    return { ok: true, requisitionId }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle("gocardless:complete-sync", async (_e, secretId, secretKey, requisitionId) => {
  try {
    const count = await gocardlessSync.completeSync(secretId, secretKey, requisitionId)
    return { ok: true, count }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

/* ---------- IPC : Mega ---------- */
ipcMain.handle("mega:backup", async (_e, email, password) => {
  try {
    const result = await megaSync.backup(email, password)
    return { ok: true, ...result }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle("mega:list-backups", async (_e, email, password) => {
  try {
    const backups = await megaSync.listBackups(email, password)
    return { ok: true, backups }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle("mega:restore", async (_e, email, password, fileId) => {
  try {
    await megaSync.restore(email, password, fileId)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

/* ---------- Cycle de vie de l'app ---------- */
app.whenReady().then(() => {
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(path.join(__dirname, "..", "build", "icon.png"))
  }

  const outDir = path.join(__dirname, "..", "out")
  const server = createStaticServer(outDir)

  server.listen(0, "127.0.0.1", () => {
    const { port } = server.address()
    createWindow(port)
    // Inutile (et bruyant) en dev, où il n'y a pas de Release GitHub correspondant à la version locale.
    if (app.isPackaged) setupAutoUpdater(mainWindow)
  })

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const address = server.address()
      if (address) createWindow(address.port)
    }
  })
})

app.on("window-all-closed", () => {
  db.closeDb()
  if (process.platform !== "darwin") app.quit()
})
