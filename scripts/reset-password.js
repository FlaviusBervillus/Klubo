/**
 * Outil de secours : réinitialise le mot de passe d'un compte Klubo directement dans la base
 * SQLite locale, sans passer par l'appli — pour le cas où PERSONNE ne peut se connecter (mot de
 * passe oublié ET aucune question de sécurité configurée, ou réponse oubliée aussi). Si un admin
 * peut encore se connecter, préférer la page Utilisateurs de l'appli (bouton "Réinitialiser le mot
 * de passe"), plus simple.
 *
 * Usage :
 *   bun scripts/reset-password.js                      -> liste les comptes, demande lequel choisir
 *   bun scripts/reset-password.js email@exemple.com     -> réinitialise directement ce compte
 *
 * ⚠️ Fermer complètement Klubo avant de lancer cet outil (Cmd+Q / fermer toutes les fenêtres) :
 * l'appli garde la base ouverte tant qu'elle tourne, écrire dedans en même temps risquerait de la
 * corrompre.
 */

const path = require("path")
const os = require("os")
const fs = require("fs")
const crypto = require("crypto")
const readline = require("readline/promises")
const { stdin, stdout } = require("process")
const { Database } = require("bun:sqlite")
const { argon2id } = require("hash-wasm")

const APP_FOLDER_NAME = "my-project" // nom historique du dossier userData, voir electron/main.js

function defaultAppDataDir() {
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support")
  if (process.platform === "win32") return process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config")
}

function dbPath() {
  // KLUBO_USERDATA_DIR : repli pour un profil personnalisé (ou pour les tests de ce script même).
  const userDataDir = process.env.KLUBO_USERDATA_DIR || path.join(defaultAppDataDir(), APP_FOLDER_NAME)
  return path.join(userDataDir, "compta.sqlite3")
}

function isAppRunning(userDataDir) {
  // Electron pose ce verrou (lien symbolique) tant que l'appli tourne — même mécanisme utilisé
  // pour empêcher deux instances de se lancer en même temps.
  return fs.existsSync(path.join(userDataDir, "SingletonLock"))
}

const TEMP_PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
function generateTempPassword(length = 12) {
  const bytes = crypto.randomBytes(length)
  return Array.from(bytes, (b) => TEMP_PASSWORD_CHARS[b % TEMP_PASSWORD_CHARS.length]).join("")
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  return argon2id({
    password,
    salt,
    iterations: 3,
    parallelism: 1,
    memorySize: 19456,
    hashLength: 32,
    outputType: "encoded",
  })
}

/** Un seul point de sortie (à la fin de main(), ou via le .catch ci-dessous) : sortir plus tôt via
 * process.exit() peut couper la sortie console en cours de vidage (flush) quand stdout n'est pas
 * un vrai terminal — ex. quand ce script est lancé depuis un autre outil. */
async function main() {
  const file = dbPath()
  const userDataDir = path.dirname(file)

  if (!fs.existsSync(file)) {
    throw new Error(
      `Base introuvable : ${file}\nL'appli n'a peut-être jamais été lancée sur cette machine, ou un profil différent est utilisé.`,
    )
  }

  if (isAppRunning(userDataDir)) {
    throw new Error(
      "Klubo est actuellement ouvert.\nFerme complètement l'application (Cmd+Q, pas juste la fenêtre) puis relance cet outil.",
    )
  }

  const db = new Database(file)
  const users = db.query("SELECT id, name, email, role FROM users ORDER BY name").all()

  if (users.length === 0) {
    throw new Error("Aucun compte utilisateur dans cette base.")
  }

  const emailArg = process.argv[2]
  const rl = readline.createInterface({ input: stdin, output: stdout })

  // Une seule question posée dans chaque cas (plutôt que choisir puis confirmer séparément) :
  // choisir un numéro dans la liste, ou lancer le script avec un email précis et confirmer une
  // seule fois, sont déjà chacun un geste délibéré.
  let target
  try {
    if (emailArg) {
      target = users.find((u) => u.email.toLowerCase() === emailArg.toLowerCase())
      if (!target) {
        throw new Error(
          `Aucun compte avec l'email "${emailArg}".\nComptes existants : ${users.map((u) => u.email).join(", ")}`,
        )
      }
      const confirm = await rl.question(
        `Réinitialiser le mot de passe de ${target.name} <${target.email}> ? (o/N) `,
      )
      if (confirm.trim().toLowerCase() !== "o") {
        console.log("Annulé.")
        return
      }
    } else {
      console.log("Comptes disponibles :")
      users.forEach((u, i) => console.log(`  ${i + 1}. ${u.name} <${u.email}> — ${u.role}`))
      console.log("  0. Annuler")
      const answer = await rl.question("\nNuméro du compte dont réinitialiser le mot de passe : ")
      const index = Number(answer.trim()) - 1
      if (answer.trim() === "0") {
        console.log("Annulé.")
        return
      }
      target = users[index]
      if (!target) throw new Error("Choix invalide.")
    }
  } finally {
    rl.close()
  }

  const tempPassword = generateTempPassword()
  const passwordHash = await hashPassword(tempPassword)
  db.query("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, target.id)
  db.close()

  console.log("\n✅ Mot de passe réinitialisé.")
  console.log(`   Compte          : ${target.email}`)
  console.log(`   Nouveau mot de passe : ${tempPassword}`)
  console.log("\nRelance Klubo, connecte-toi avec ce mot de passe, puis change-le immédiatement")
  console.log("(Mon compte → Mot de passe) et configure une question de sécurité si ce n'est pas déjà fait.")
}

main().catch((err) => {
  console.error("❌", err instanceof Error ? err.message : err)
  process.exitCode = 1
})
