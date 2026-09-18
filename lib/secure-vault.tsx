"use client"

import { createContext, useContext, useEffect, useState } from "react"

import { decryptVault, encryptVault, type EncryptedVault } from "@/lib/crypto/vault"

export interface VaultData {
  [key: string]: string
  stripeSecretKey: string
  stripeWebhookSecret: string
  gocardlessSecretId: string
  gocardlessSecretKey: string
  megaEmail: string
  megaPassword: string
}

const emptyVault: VaultData = {
  stripeSecretKey: "",
  stripeWebhookSecret: "",
  gocardlessSecretId: "",
  gocardlessSecretKey: "",
  megaEmail: "",
  megaPassword: "",
}

function api() {
  return typeof window !== "undefined" ? window.electronAPI : undefined
}

const SecureVaultContext = createContext<{
  available: boolean
  hasVault: boolean
  unlocked: boolean
  loaded: boolean
  data: VaultData
  unlock: (passphrase: string) => Promise<boolean>
  createVault: (passphrase: string) => Promise<void>
  lock: () => void
  setSecret: (patch: Record<string, string>) => Promise<void>
  changePassphrase: (
    currentPassphrase: string,
    newPassphrase: string,
  ) => Promise<boolean>
} | null>(null)

export function SecureVaultProvider({ children }: { children: React.ReactNode }) {
  const [hasVault, setHasVault] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [data, setData] = useState<VaultData>(emptyVault)
  const [passphrase, setPassphraseState] = useState<string | null>(null)
  const available = !!api()

  useEffect(() => {
    async function init() {
      const electronApi = api()
      if (electronApi) {
        const row = await electronApi.vault.read()
        setHasVault(!!row)
      }
      setLoaded(true)
    }
    init()
  }, [])

  async function persist(next: VaultData, pass: string) {
    const electronApi = api()
    if (!electronApi) return
    const encrypted = await encryptVault(pass, JSON.stringify(next))
    await electronApi.vault.write({
      salt_b64: encrypted.saltB64,
      iv_b64: encrypted.ivB64,
      ciphertext_b64: encrypted.ciphertextB64,
    })
  }

  async function unlock(pass: string) {
    const electronApi = api()
    if (!electronApi) return false
    try {
      const row = await electronApi.vault.read()
      if (!row) return false
      const vault: EncryptedVault = {
        saltB64: row.salt_b64,
        ivB64: row.iv_b64,
        ciphertextB64: row.ciphertext_b64,
      }
      const plaintext = await decryptVault(pass, vault)
      setData({ ...emptyVault, ...JSON.parse(plaintext) })
      setPassphraseState(pass)
      setUnlocked(true)
      return true
    } catch {
      return false
    }
  }

  async function createVault(pass: string) {
    setData(emptyVault)
    setPassphraseState(pass)
    setUnlocked(true)
    setHasVault(true)
    await persist(emptyVault, pass)
  }

  function lock() {
    setUnlocked(false)
    setPassphraseState(null)
    setData(emptyVault)
  }

  async function setSecret(patch: Record<string, string>) {
    if (!passphrase) return
    const next: VaultData = { ...data, ...patch }
    setData(next)
    await persist(next, passphrase)
  }

  async function changePassphrase(currentPassphrase: string, newPassphrase: string) {
    const electronApi = api()
    if (!electronApi) return false
    try {
      const row = await electronApi.vault.read()
      if (!row) return false
      const vault: EncryptedVault = {
        saltB64: row.salt_b64,
        ivB64: row.iv_b64,
        ciphertextB64: row.ciphertext_b64,
      }
      const plaintext = await decryptVault(currentPassphrase, vault)
      const current: VaultData = { ...emptyVault, ...JSON.parse(plaintext) }
      await persist(current, newPassphrase)
      if (unlocked) {
        setData(current)
        setPassphraseState(newPassphrase)
      }
      return true
    } catch {
      return false
    }
  }

  return (
    <SecureVaultContext.Provider
      value={{
        available,
        hasVault,
        unlocked,
        loaded,
        data,
        unlock,
        createVault,
        lock,
        setSecret,
        changePassphrase,
      }}
    >
      {children}
    </SecureVaultContext.Provider>
  )
}

export function useSecureVault() {
  const ctx = useContext(SecureVaultContext)
  if (!ctx) {
    throw new Error("useSecureVault must be used within a SecureVaultProvider")
  }
  return ctx
}
