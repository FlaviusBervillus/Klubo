"use client"

import { createContext, useContext, useEffect, useState } from "react"

import { hashPassword, verifyPassword } from "@/lib/crypto/password"
import type { Role } from "@/lib/mock-data"

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
  getSecurityQuestion: (email: string) => Promise<string | null>
  resetPasswordWithAnswer: (
    email: string,
    answer: string,
    newPassword: string,
  ) => Promise<boolean>
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
        const count = await electronApi.db.countUsers()
        setNeedsSetup(count === 0)
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

  async function getSecurityQuestion(email: string) {
    const electronApi = api()
    if (!electronApi) return null
    const user = await electronApi.db.findUserByEmail(email)
    return user?.security_question ?? null
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
        getSecurityQuestion,
        resetPasswordWithAnswer,
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
