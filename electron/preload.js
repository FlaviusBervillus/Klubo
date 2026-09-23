const { contextBridge, ipcRenderer } = require("electron")

/**
 * Pont exposé au renderer. Toutes les opérations sensibles (Stripe, GoCardless,
 * Mega, base de données) transitent par IPC vers le process principal (Node) :
 * le renderer ne fait jamais lui-même de requête réseau vers un service tiers
 * ni d'accès disque direct.
 */
contextBridge.exposeInMainWorld("electronAPI", {
  db: {
    getUsers: () => ipcRenderer.invoke("db:getUsers"),
    countUsers: () => ipcRenderer.invoke("db:countUsers"),
    findUserByEmail: (email) => ipcRenderer.invoke("db:findUserByEmail", email),
    createUser: (user) => ipcRenderer.invoke("db:createUser", user),
    updateUser: (id, patch) => ipcRenderer.invoke("db:updateUser", id, patch),
    deleteUser: (id) => ipcRenderer.invoke("db:deleteUser", id),

    getClients: () => ipcRenderer.invoke("db:getClients"),
    createClient: (client) => ipcRenderer.invoke("db:createClient", client),
    updateClient: (id, patch) => ipcRenderer.invoke("db:updateClient", id, patch),
    deleteClient: (id) => ipcRenderer.invoke("db:deleteClient", id),

    getTransactions: () => ipcRenderer.invoke("db:getTransactions"),
    createTransaction: (tx) => ipcRenderer.invoke("db:createTransaction", tx),
    updateTransaction: (id, patch) => ipcRenderer.invoke("db:updateTransaction", id, patch),

    getBankTransactions: () => ipcRenderer.invoke("db:getBankTransactions"),

    getSettings: () => ipcRenderer.invoke("db:getSettings"),
    setSetting: (key, value) => ipcRenderer.invoke("db:setSetting", key, value),
    getSyncState: (provider) => ipcRenderer.invoke("db:getSyncState", provider),

    getSeasons: () => ipcRenderer.invoke("db:getSeasons"),
    createSeason: (season) => ipcRenderer.invoke("db:createSeason", season),
    updateSeason: (id, patch) => ipcRenderer.invoke("db:updateSeason", id, patch),
    deleteSeason: (id) => ipcRenderer.invoke("db:deleteSeason", id),
    getClientSeasonMap: (seasonId) => ipcRenderer.invoke("db:getClientSeasonMap", seasonId),
    setClientSeason: (clientId, seasonId, payload) =>
      ipcRenderer.invoke("db:setClientSeason", clientId, seasonId, payload),
  },
  vault: {
    read: () => ipcRenderer.invoke("vault:read"),
    write: (payload) => ipcRenderer.invoke("vault:write", payload),
  },
  prepareReceipt: (transactionId) => ipcRenderer.invoke("receipts:prepare", transactionId),
  renderReceiptPreview: (transactionId, overrides) =>
    ipcRenderer.invoke("receipts:render-preview", transactionId, overrides),
  downloadReceipt: (transactionId, overrides) =>
    ipcRenderer.invoke("receipts:download", transactionId, overrides),
  downloadStripeInvoice: (transactionId) =>
    ipcRenderer.invoke("receipts:download-stripe-invoice", transactionId),
  testStripeConnection: (secretKey) => ipcRenderer.invoke("stripe:test-connection", secretKey),
  syncStripe: (secretKey) => ipcRenderer.invoke("stripe:sync-all", secretKey),
  gocardless: {
    listInstitutions: (secretId, secretKey, country) =>
      ipcRenderer.invoke("gocardless:list-institutions", secretId, secretKey, country),
    startConsent: (secretId, secretKey, institutionId) =>
      ipcRenderer.invoke("gocardless:start-consent", secretId, secretKey, institutionId),
    completeSync: (secretId, secretKey, requisitionId) =>
      ipcRenderer.invoke("gocardless:complete-sync", secretId, secretKey, requisitionId),
    onCallback: (listener) => {
      const handler = (_event, requisitionId) => listener(requisitionId)
      ipcRenderer.on("gocardless:callback", handler)
      return () => ipcRenderer.removeListener("gocardless:callback", handler)
    },
  },
  mega: {
    backup: (email, password) => ipcRenderer.invoke("mega:backup", email, password),
    listBackups: (email, password) => ipcRenderer.invoke("mega:list-backups", email, password),
    restore: (email, password, fileId) =>
      ipcRenderer.invoke("mega:restore", email, password, fileId),
  },
})
