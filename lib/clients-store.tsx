"use client"

import { createContext, useContext, useEffect, useState } from "react"

import type { Client, CourseType, PaymentMethod } from "@/lib/mock-data"
import type { DbClient } from "@/types/electron"

function api() {
  return typeof window !== "undefined" ? window.electronAPI : undefined
}

function rowToClient(row: DbClient): Client {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    address: row.address,
    status: row.status as CourseType,
    method: row.method as PaymentMethod,
    paid: !!row.paid,
  }
}

export interface NewClient {
  [key: string]: unknown
  firstName: string
  lastName: string
  email: string
  address: string
  status: CourseType
  method: PaymentMethod
  paid: boolean
}

const ClientsContext = createContext<{
  clients: Client[]
  loaded: boolean
  available: boolean
  addClient: (input: NewClient) => Promise<void>
  updateClient: (id: string, patch: Partial<NewClient>) => Promise<void>
  refresh: () => Promise<void>
} | null>(null)

export function ClientsProvider({ children }: { children: React.ReactNode }) {
  const [clients, setClients] = useState<Client[]>([])
  const [loaded, setLoaded] = useState(false)
  const available = !!api()

  async function refresh() {
    const electronApi = api()
    if (!electronApi) {
      setLoaded(true)
      return
    }
    const rows = await electronApi.db.getClients()
    setClients(rows.map(rowToClient))
    setLoaded(true)
  }

  useEffect(() => {
    refresh()
  }, [])

  async function addClient(input: NewClient) {
    const electronApi = api()
    if (!electronApi) return
    await electronApi.db.createClient(input)
    await refresh()
  }

  async function updateClient(id: string, patch: Partial<NewClient>) {
    const electronApi = api()
    if (!electronApi) return
    await electronApi.db.updateClient(id, patch)
    await refresh()
  }

  return (
    <ClientsContext.Provider value={{ clients, loaded, available, addClient, updateClient, refresh }}>
      {children}
    </ClientsContext.Provider>
  )
}

export function useClientsStore() {
  const ctx = useContext(ClientsContext)
  if (!ctx) {
    throw new Error("useClientsStore must be used within a ClientsProvider")
  }
  return ctx
}
