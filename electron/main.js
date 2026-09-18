const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron")
const path = require("path")
const fs = require("fs")
const crypto = require("crypto")
const { createStaticServer } = require("../scripts/static-server")
const db = require("./db")
const { stripeRequest } = require("./stripe-client")
const stripeSync = require("./stripe-sync")
const gocardlessSync = require("./gocardless-sync")
const megaSync = require("./mega-sync")
const { generateReceiptPdf, renderInvoiceHtml } = require("./invoice-pdf")
const { setupAutoUpdater } = require("./updater")

const PROTOCOL = "comptakungfu"

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
