const db = require("./db")

const BACKGROUND_INTERVAL_MS = 2 * 60 * 60 * 1000 // 2h, voir Phase C du plan de sync NAS
const PULL_PAGE_LIMIT = 500

let intervalHandle = null
let isSyncing = false
let onStatusChange = null // callback(status) — câblé par electron/main.js pour pousser vers le renderer

/** Configuration NAS — volontairement dans `settings` (texte en clair) et non dans le coffre-fort
 * chiffré : contrairement aux clés Stripe/GoCardless, elle doit être lisible par le process
 * principal SANS que le trésorier ait déverrouillé le coffre-fort, pour que la synchro en tâche de
 * fond (démarrage + toutes les 2h) fonctionne de façon totalement autonome. */
function getConfig() {
  const settings = db.getSettings()
  return {
    serverUrl: settings.nasSyncUrl || "",
    apiKey: settings.nasSyncApiKey || "",
  }
}

function setConfig({ serverUrl, apiKey }) {
  if (serverUrl !== undefined) db.setSetting("nasSyncUrl", serverUrl)
  if (apiKey !== undefined) db.setSetting("nasSyncApiKey", apiKey)
}

function getStatus() {
  const { serverUrl } = getConfig()
  return {
    configured: !!serverUrl,
    lastSyncedAt: db.getSyncMeta("nas_last_synced_at"),
    lastError: db.getSyncMeta("nas_last_error"),
    pendingConflictsCount: db.getConflicts().length,
    syncing: isSyncing,
  }
}

function setOnStatusChange(callback) {
  onStatusChange = callback
}

function emitStatus() {
  if (onStatusChange) onStatusChange(getStatus())
}

async function request(serverUrl, apiKey, path, options = {}) {
  const res = await fetch(`${serverUrl}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${apiKey}`,
    },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body) {
    throw new Error(body?.error || `Erreur serveur NAS (HTTP ${res.status})`)
  }
  return body
}

/** Tire les changements du NAS depuis le dernier curseur connu et les applique localement — voir
 * l'algorithme détaillé dans le plan (Phase C) : écho de nos propres changements ignoré (déjà
 * appliqué localement), changement d'un autre poste appliqué directement si la ligne locale n'a pas
 * de modification en attente, sinon mis en file de conflits. */
async function pull(serverUrl, apiKey, deviceId) {
  while (true) {
    const since = db.getPullCursor()
    const response = await request(serverUrl, apiKey, `/sync/pull?since=${since}&limit=${PULL_PAGE_LIMIT}`)
    const changes = response.changes || []
    if (changes.length === 0) break

    for (const change of changes) {
      const { table, rowId, op, payload, version, deviceId: originDeviceId } = change
      if (originDeviceId === deviceId) {
        // Écho de notre propre push déjà appliqué localement — juste confirmer le curseur par ligne.
        db.setRowSyncedVersion(table, rowId, version)
        continue
      }

      if (db.hasUnresolvedConflict(table, rowId)) {
        // Déjà en conflit pour cette ligne, en attente de résolution — ne pas en ajouter un second.
        continue
      }

      const syncedVersion = db.getRowSyncedVersion(table, rowId)
      const localVersion = db.getRowCurrentVersion(table, rowId) ?? 0
      if (localVersion <= syncedVersion) {
        // Aucune modification locale en attente pour cette ligne : on applique directement.
        if (op === "delete") {
          db.applyRemoteDelete(table, rowId, version)
        } else {
          db.applyRemoteUpsert(table, rowId, payload)
        }
        db.setRowSyncedVersion(table, rowId, version)
      } else {
        // Modifiée localement ET à distance depuis le dernier point commun : conflit, signalé au
        // trésorier plutôt que résolu seul (voir components/parametres/sync-conflict-dialog).
        db.addConflict({
          table,
          rowId,
          localPayload: db.getRowPayloadByRowId(table, rowId),
          remotePayload: payload,
          remoteVersion: version,
        })
      }
    }

    db.setPullCursor(response.latestSeq)
    if (changes.length < PULL_PAGE_LIMIT) break
  }
}

/** Pousse les changements locaux pas encore confirmés par le NAS, un par un (pas de gros lot
 * unique) : chaque envoi dépend du résultat du précédent pour la même ligne (le `baseVersion`
 * correct change dès qu'une version est appliquée), donc les traiter en séquence évite de calculer
 * un `baseVersion` obsolète pour une 2e modification de la même ligne dans le même cycle. */
async function push(serverUrl, apiKey, deviceId) {
  const unpushed = db.getUnpushedChanges()
  for (const change of unpushed) {
    const { seq, table_name: table, row_id: rowId, op, payload_json: payloadJson } = change
    if (db.hasUnresolvedConflict(table, rowId)) continue // en attente de résolution, ne pas retenter

    const baseVersion = db.getRowSyncedVersion(table, rowId)
    const payload = payloadJson ? JSON.parse(payloadJson) : null
    const response = await request(serverUrl, apiKey, "/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, changes: [{ table, rowId, op, payload, baseVersion }] }),
    })
    const result = response.results?.[0]
    if (!result) continue

    if (result.status === "applied") {
      db.markChangePushed(seq)
      db.setRowSyncedVersion(table, rowId, result.newVersion)
    } else if (result.status === "conflict") {
      db.addConflict({
        table,
        rowId,
        localPayload: payload ?? db.getRowPayloadByRowId(table, rowId),
        remotePayload: result.serverPayload,
        remoteVersion: result.serverVersion,
      })
    }
  }
}

async function runSyncCycle() {
  const { serverUrl, apiKey } = getConfig()
  if (!serverUrl || !apiKey) return { ok: false, error: "Synchronisation NAS non configurée" }
  if (isSyncing) return { ok: false, error: "Synchronisation déjà en cours" }

  isSyncing = true
  emitStatus()
  try {
    const deviceId = db.getSyncDeviceId()
    await pull(serverUrl, apiKey, deviceId)
    await push(serverUrl, apiKey, deviceId)
    db.setSyncMeta("nas_last_synced_at", new Date().toISOString())
    db.setSyncMeta("nas_last_error", "")
    return { ok: true, pendingConflicts: db.getConflicts().length }
  } catch (err) {
    // Échec silencieux côté UX (voir Phase C du plan) : le NAS est souvent hors du réseau local
    // (trésorier au travail, à la maison...) — ce n'est jamais une erreur bloquante, juste
    // consignée pour le badge "non synchronisé depuis...".
    const message = err instanceof Error ? err.message : String(err)
    db.setSyncMeta("nas_last_error", message)
    return { ok: false, error: message }
  } finally {
    isSyncing = false
    emitStatus()
  }
}

function startBackgroundSync() {
  if (intervalHandle) return
  runSyncCycle()
  intervalHandle = setInterval(runSyncCycle, BACKGROUND_INTERVAL_MS)
}

function stopBackgroundSync() {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}

async function resolveConflict(id, resolution) {
  if (resolution === "local") {
    db.resolveConflictKeepLocal(id)
  } else {
    db.resolveConflictKeepRemote(id)
  }
  emitStatus()
  // Propage la résolution tout de suite plutôt que d'attendre le prochain cycle programmé.
  return runSyncCycle()
}

module.exports = {
  getConfig,
  setConfig,
  getStatus,
  setOnStatusChange,
  runSyncCycle,
  startBackgroundSync,
  stopBackgroundSync,
  resolveConflict,
  getConflicts: db.getConflicts,
}
