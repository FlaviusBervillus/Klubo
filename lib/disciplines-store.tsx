"use client"

import { createContext, useContext, useEffect, useState } from "react"

import type { DbDiscipline } from "@/types/electron"

function api() {
  return typeof window !== "undefined" ? window.electronAPI : undefined
}

export interface Discipline {
  id: string
  label: string
  price: number
}

function rowToDiscipline(row: DbDiscipline): Discipline {
  return { id: row.id, label: row.label, price: row.price }
}

export interface NewDiscipline {
  [key: string]: unknown
  label: string
  price: number
}

const DisciplinesContext = createContext<{
  disciplines: Discipline[]
  loaded: boolean
  available: boolean
  addDiscipline: (input: NewDiscipline) => Promise<{ ok: true } | { ok: false; error?: string }>
  updateDiscipline: (id: string, patch: Partial<NewDiscipline>) => Promise<void>
  deleteDiscipline: (id: string) => Promise<void>
  refresh: () => Promise<void>
} | null>(null)

export function DisciplinesProvider({ children }: { children: React.ReactNode }) {
  const [disciplines, setDisciplines] = useState<Discipline[]>([])
  const [loaded, setLoaded] = useState(false)
  const available = !!api()

  async function refresh() {
    const electronApi = api()
    if (!electronApi) {
      setLoaded(true)
      return
    }
    const rows = await electronApi.db.getDisciplines()
    setDisciplines(rows.map(rowToDiscipline))
    setLoaded(true)
  }

  useEffect(() => {
    refresh()
  }, [])

  async function addDiscipline(input: NewDiscipline) {
    const electronApi = api()
    if (!electronApi) return { ok: false as const, error: undefined }
    const result = await electronApi.db.createDiscipline(input)
    if (result.ok) await refresh()
    return result
  }

  async function updateDiscipline(id: string, patch: Partial<NewDiscipline>) {
    const electronApi = api()
    if (!electronApi) return
    await electronApi.db.updateDiscipline(id, patch)
    await refresh()
  }

  async function deleteDiscipline(id: string) {
    const electronApi = api()
    if (!electronApi) return
    await electronApi.db.deleteDiscipline(id)
    await refresh()
  }

  return (
    <DisciplinesContext.Provider
      value={{ disciplines, loaded, available, addDiscipline, updateDiscipline, deleteDiscipline, refresh }}
    >
      {children}
    </DisciplinesContext.Provider>
  )
}

export function useDisciplinesStore() {
  const ctx = useContext(DisciplinesContext)
  if (!ctx) {
    throw new Error("useDisciplinesStore must be used within a DisciplinesProvider")
  }
  return ctx
}
