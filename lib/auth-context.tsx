"use client"

import { createContext, useContext, useEffect, useState } from "react"

import { hashPassword, verifyPassword } from "@/lib/crypto/password"
import { generateTotpSecret, generateTotpUri, verifyTotpCode } from "@/lib/crypto/totp"
import type { Role } from "@/lib/mock-data"

export type RecoveryMethod =
  | { method: "totp" }
  | { method: "question"; question: string }
  | { method: "none" }

export interface Session {
  id: string
  name: string
  email: string
  role: Role
}

const SESSION_KEY = "auth-session"

function api() {
  return typeof window !== "undefined" ? window.electronAPI : undefined
}

const AuthContext = createContext<{
  session: Session | null
  loaded: boolean
  available: boolean
  needsSetup: boolean
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
  createFirstAdmin: (input: { name: string; email: string; password: string }) => Promise<boolean>
  updateProfile: (patch: { name: string; email: string }) => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>
  setSecurityQuestion: (question: string, answer: string) => Promise<void>
  getRecoveryMethod: (email: string) => Promise<RecoveryMethod>
  resetPasswordWithAnswer: (
    email: string,
    answer: string,
    newPassword: string,
  ) => Promise<boolean>
  resetPasswordWithTotp: (email: string, code: string, newPassword: string) => Promise<boolean>
  hasTotp: () => Promise<boolean>
  setupTotp: () => Promise<{ secret: string; uri: string } | null>
  confirmTotp: (secret: string, code: string) => Promise<boolean>
  disableTotp: () => Promise<void>
} | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [needsSetup, setNeedsSetup] = useState(false)
  const available = !!api()

  useEffect(() => {
    async function init() {
      try {
        const raw = window.localStorage.getItem(SESSION_KEY)
        if (raw) setSession(JSON.parse(raw))
      } catch {
        // stockage indisponible — l'utilisateur devra se reconnecter
      }
      const electronApi = api()
      if (electronApi) {
        try {
          const count = await electronApi.db.countUsers()
          setNeedsSetup(count === 0)
        } catch (err) {
          // Une erreur ici (ex. migration SQLite en échec) ne doit jamais bloquer l'app sur l'écran
          // de chargement indéfiniment : on la journalise et on laisse l'utilisateur voir l'écran de
          // connexion plutôt qu'un écran figé sans aucun indice.
          console.error("Échec de l'initialisation de la base locale :", err)
        }
      }
      setLoaded(true)
    }
    init()
  }, [])

  function persistSession(next: Session | null) {
    setSession(next)
    try {
      if (next) {
        window.localStorage.setItem(SESSION_KEY, JSON.stringify(next))
      } else {
        window.localStorage.removeItem(SESSION_KEY)
      }
    } catch {
      // stockage indisponible — la session reste active pour cet onglet
    }
  }

  async function login(email: string, password: string) {
    const electronApi = api()
    if (!electronApi) return false
    const user = await electronApi.db.findUserByEmail(email)
    if (!user) return false
    const ok = await verifyPassword(password, user.password_hash)
    if (!ok) return false
    persistSession({ id: user.id, name: user.name, email: user.email, role: user.role as Role })
    return true
  }

  function logout() {
    persistSession(null)
  }

  async function createFirstAdmin({
    name,
    email,
    password,
  }: {
    name: string
    email: string
    password: string
  }) {
    const electronApi = api()
    if (!electronApi) return false
    const passwordHash = await hashPassword(password)
    await electronApi.db.createUser({ name, email, passwordHash, role: "admin" })
    const user = await electronApi.db.findUserByEmail(email)
    if (!user) return false
    setNeedsSetup(false)
    persistSession({ id: user.id, name: user.name, email: user.email, role: user.role as Role })
    return true
  }

  async function updateProfile(patch: { name: string; email: string }) {
    const electronApi = api()
    if (!electronApi || !session) return
    await electronApi.db.updateUser(session.id, patch)
    persistSession({ ...session, ...patch })
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    const electronApi = api()
    if (!electronApi || !session) return false
    const user = await electronApi.db.findUserByEmail(session.email)
    if (!user) return false
    const ok = await verifyPassword(currentPassword, user.password_hash)
    if (!ok) return false
    const passwordHash = await hashPassword(newPassword)
    await electronApi.db.updateUser(session.id, { passwordHash })
    return true
  }

  async function setSecurityQuestion(question: string, answer: string) {
    const electronApi = api()
    if (!electronApi || !session) return
    const securityAnswerHash = await hashPassword(answer.trim().toLowerCase())
    await electronApi.db.updateUser(session.id, { securityQuestion: question, securityAnswerHash })
  }

  /** La 2FA (TOTP) prime sur la question de sécurité si les deux sont configurées — c'est le
   * facteur le plus fiable (la question de sécurité reste disponible pour les comptes qui n'ont
   * pas encore activé la 2FA). */
  async function getRecoveryMethod(email: string): Promise<RecoveryMethod> {
    const electronApi = api()
    if (!electronApi) return { method: "none" }
    const user = await electronApi.db.findUserByEmail(email)
    if (!user) return { method: "none" }
    if (user.totp_secret) return { method: "totp" }
    if (user.security_question) return { method: "question", question: user.security_question }
    return { method: "none" }
  }

  async function resetPasswordWithAnswer(email: string, answer: string, newPassword: string) {
    const electronApi = api()
    if (!electronApi) return false
    const user = await electronApi.db.findUserByEmail(email)
    if (!user || !user.security_answer_hash) return false
    const ok = await verifyPassword(answer.trim().toLowerCase(), user.security_answer_hash)
    if (!ok) return false
    const passwordHash = await hashPassword(newPassword)
    await electronApi.db.updateUser(user.id, { passwordHash })
    return true
  }

  async function resetPasswordWithTotp(email: string, code: string, newPassword: string) {
    const electronApi = api()
    if (!electronApi) return false
    const user = await electronApi.db.findUserByEmail(email)
    if (!user || !user.totp_secret) return false
    const ok = await verifyTotpCode(user.totp_secret, code)
    if (!ok) return false
    const passwordHash = await hashPassword(newPassword)
    await electronApi.db.updateUser(user.id, { passwordHash })
    return true
  }

  async function hasTotp() {
    const electronApi = api()
    if (!electronApi || !session) return false
    const user = await electronApi.db.findUserByEmail(session.email)
    return !!user?.totp_secret
  }

  /** Génère une nouvelle clé — pas encore enregistrée (voir confirmTotp) tant que l'utilisateur n'a
   * pas prouvé qu'il l'a bien configurée dans son appli d'authentification. */
  async function setupTotp() {
    if (!session) return null
    const secret = generateTotpSecret()
    const uri = generateTotpUri(secret, session.email)
    return { secret, uri }
  }

  async function confirmTotp(secret: string, code: string) {
    const electronApi = api()
    if (!electronApi || !session) return false
    const ok = await verifyTotpCode(secret, code)
    if (!ok) return false
    await electronApi.db.updateUser(session.id, { totpSecret: secret })
    return true
  }

  async function disableTotp() {
    const electronApi = api()
    if (!electronApi || !session) return
    await electronApi.db.updateUser(session.id, { totpSecret: null })
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        loaded,
        available,
        needsSetup,
        login,
        logout,
        createFirstAdmin,
        updateProfile,
        changePassword,
        setSecurityQuestion,
        getRecoveryMethod,
        resetPasswordWithAnswer,
        resetPasswordWithTotp,
        hasTotp,
        setupTotp,
        confirmTotp,
        disableTotp,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider")
  return ctx
}
