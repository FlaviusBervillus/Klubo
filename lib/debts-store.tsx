"use client"

import { createContext, useContext, useEffect, useState } from "react"

import type { DbDebt } from "@/types/electron"

function api() {
  return typeof window !== "undefined" ? window.electronAPI : undefined
}

export interface Debt {
  id: string
  label: string
  amount: number
  date: string
  dueDate: string | null
  settled: boolean
  notes: string
}

function rowToDebt(row: DbDebt): Debt {
  return {
    id: row.id,
    label: row.label,
    amount: row.amount,
    date: row.date,
    dueDate: row.due_date ?? null,
    settled: !!row.settled,
    notes: row.notes ?? "",
  }
}

export interface NewDebt {
  [key: string]: unknown
  label: string
  amount: number
  date: string
  dueDate: string | null
  settled: boolean
  notes: string
}

const DebtsContext = createContext<{
  debts: Debt[]
  loaded: boolean
  available: boolean
  addDebt: (input: NewDebt) => Promise<void>
  updateDebt: (id: string, patch: Partial<NewDebt>) => Promise<void>
  deleteDebt: (id: string) => Promise<void>
  refresh: () => Promise<void>
} | null>(null)

export function DebtsProvider({ children }: { children: React.ReactNode }) {
  const [debts, setDebts] = useState<Debt[]>([])
  const [loaded, setLoaded] = useState(false)
  const available = !!api()

  async function refresh() {
    const electronApi = api()
    if (!electronApi) {
      setLoaded(true)
      return
    }
    const rows = await electronApi.db.getDebts()
    setDebts(rows.map(rowToDebt))
    setLoaded(true)
  }

  useEffect(() => {
    refresh()
  }, [])

  async function addDebt(input: NewDebt) {
    const electronApi = api()
    if (!electronApi) return
    await electronApi.db.createDebt(input)
    await refresh()
  }

  async function updateDebt(id: string, patch: Partial<NewDebt>) {
    const electronApi = api()
    if (!electronApi) return
    await electronApi.db.updateDebt(id, patch)
    await refresh()
  }

  async function deleteDebt(id: string) {
    const electronApi = api()
    if (!electronApi) return
    await electronApi.db.deleteDebt(id)
    await refresh()
  }

  return (
    <DebtsContext.Provider value={{ debts, loaded, available, addDebt, updateDebt, deleteDebt, refresh }}>
      {children}
    </DebtsContext.Provider>
  )
}

export function useDebtsStore() {
  const ctx = useContext(DebtsContext)
  if (!ctx) {
    throw new Error("useDebtsStore must be used within a DebtsProvider")
  }
  return ctx
}
