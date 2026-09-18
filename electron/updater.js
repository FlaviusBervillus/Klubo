const { dialog, shell } = require("electron")
const { autoUpdater } = require("electron-updater")

const RELEASES_URL = "https://github.com/FlaviusBervillus/kung-fu-accounting-dashboard/releases/latest"

/**
 * Vérifie les mises à jour via les Releases GitHub. L'app n'étant pas signée par Apple,
 * l'installation silencieuse (Squirrel.Mac) est impossible sur macOS : on se contente d'y
 * prévenir et de renvoyer vers la page de téléchargement. Sur Windows/Linux, la mise à jour
 * est téléchargée puis installée au redémarrage, sans jamais toucher au dossier de données
 * utilisateur (userData) — les données du club sont donc conservées automatiquement.
 */
function setupAutoUpdater(mainWindow) {
  autoUpdater.autoDownload = process.platform !== "darwin"
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on("update-available", (info) => {
    if (process.platform !== "darwin") return
    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "Mise à jour disponible",
        message: `Klubo ${info.version} est disponible.`,
        detail:
          "L'app n'étant pas signée par Apple, la mise à jour automatique n'est pas possible sur Mac : téléchargez et installez le nouveau DMG manuellement.",
        buttons: ["Ouvrir la page de téléchargement", "Plus tard"],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) shell.openExternal(RELEASES_URL)
      })
  })

  autoUpdater.on("update-downloaded", (info) => {
    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "Mise à jour prête",
        message: `Klubo ${info.version} a été téléchargé.`,
        detail: "L'application va redémarrer pour terminer l'installation. Vos données sont conservées.",
        buttons: ["Redémarrer maintenant", "Plus tard"],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall()
      })
  })

  autoUpdater.on("error", (err) => {
    console.error("Vérification de mise à jour échouée :", err)
  })

  autoUpdater.checkForUpdates().catch((err) => {
    console.error("Vérification de mise à jour échouée :", err)
  })
}

module.exports = { setupAutoUpdater }
