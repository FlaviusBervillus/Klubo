"use client"

import { createContext, useContext, useEffect, useState } from "react"

import type { DbPayer } from "@/types/electron"

function api() {
  return typeof window !== "undefined" ? window.electronAPI : undefined
}

/** Le payeur est l'identité de facturation (nom, email, adresse, éventuel id client Stripe) — pas
 * forcément un adhérent : un parent qui règle pour son enfant, un sponsor, etc. Voir
 * lib/clients-store.tsx (Client.payerId) pour le lien adhérent -> payeur. */
export interface Payer {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  address: string
  postalCode: string
  city: string
  stripeCustomerId: string | null
}

function rowToPayer(row: DbPayer): Payer {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    postalCode: row.postal_code,
    city: row.city,
    stripeCustomerId: row.stripe_customer_id,
  }
}

export interface NewPayer {
  [key: string]: unknown
  firstName: string
  lastName: string
  email: string
  phone: string
  address: string
  postalCode: string
  city: string
}

const PayersContext = createContext<{
  payers: Payer[]
  loaded: boolean
  available: boolean
  addPayer: (input: NewPayer) => Promise<{ ok: true; id: string } | { ok: false; error?: string }>
  updatePayer: (id: string, patch: Partial<NewPayer>) => Promise<void>
  deletePayer: (id: string) => Promise<void>
  deletePayerCascade: (id: string) => Promise<{ ok: true; deletedClients: number } | { ok: false }>
  ensurePayerForClient: (clientId: string) => Promise<string | null>
  refresh: () => Promise<void>
} | null>(null)

export function PayersProvider({ children }: { children: React.ReactNode }) {
  const [payers, setPayers] = useState<Payer[]>([])
  const [loaded, setLoaded] = useState(false)
  const available = !!api()

  async function refresh() {
    const electronApi = api()
    if (!electronApi) {
      setLoaded(true)
      return
    }
    const rows = await electronApi.db.getPayers()
    setPayers(rows.map(rowToPayer))
    setLoaded(true)
  }

  useEffect(() => {
    refresh()
  }, [])

  async function addPayer(input: NewPayer) {
    const electronApi = api()
    if (!electronApi) return { ok: false as const, error: undefined }
    const result = await electronApi.db.createPayer(input)
    if (result.ok) await refresh()
    return result
  }

  async function updatePayer(id: string, patch: Partial<NewPayer>) {
    const electronApi = api()
    if (!electronApi) return
    await electronApi.db.updatePayer(id, patch)
    await refresh()
  }

  async function deletePayer(id: string) {
    const electronApi = api()
    if (!electronApi) return
    await electronApi.db.deletePayer(id)
    await refresh()
  }

  async function deletePayerCascade(id: string) {
    const electronApi = api()
    if (!electronApi) return { ok: false as const }
    const result = await electronApi.db.deletePayerCascade(id)
    await refresh()
    return result
  }

  async function ensurePayerForClient(clientId: string) {
    const electronApi = api()
    if (!electronApi) return null
    const payerId = await electronApi.db.ensurePayerForClient(clientId)
    await refresh()
    return payerId
  }

  return (
    <PayersContext.Provider
      value={{
        payers,
        loaded,
        available,
        addPayer,
        updatePayer,
        deletePayer,
        deletePayerCascade,
        ensurePayerForClient,
        refresh,
      }}
    >
      {children}
    </PayersContext.Provider>
  )
}

export function usePayersStore() {
  const ctx = useContext(PayersContext)
  if (!ctx) {
    throw new Error("usePayersStore must be used within a PayersProvider")
  }
  return ctx
}
