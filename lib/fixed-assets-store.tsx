"use client"

import { createContext, useContext, useEffect, useState } from "react"

import type { FixedAsset } from "@/lib/depreciation"
import type { DbFixedAsset } from "@/types/electron"

function api() {
  return typeof window !== "undefined" ? window.electronAPI : undefined
}

function rowToAsset(row: DbFixedAsset): FixedAsset {
  return {
    id: row.id,
    label: row.label,
    purchaseAmount: row.purchase_amount,
    purchaseDate: row.purchase_date,
    depreciationYears: row.depreciation_years,
    disposed: !!row.disposed,
    notes: row.notes ?? "",
  }
}

export interface NewFixedAsset {
  [key: string]: unknown
  label: string
  purchaseAmount: number
  purchaseDate: string
  depreciationYears: number
  disposed: boolean
  notes: string
}

const FixedAssetsContext = createContext<{
  assets: FixedAsset[]
  loaded: boolean
  available: boolean
  addAsset: (input: NewFixedAsset) => Promise<void>
  updateAsset: (id: string, patch: Partial<NewFixedAsset>) => Promise<void>
  deleteAsset: (id: string) => Promise<void>
  refresh: () => Promise<void>
} | null>(null)

export function FixedAssetsProvider({ children }: { children: React.ReactNode }) {
  const [assets, setAssets] = useState<FixedAsset[]>([])
  const [loaded, setLoaded] = useState(false)
  const available = !!api()

  async function refresh() {
    const electronApi = api()
    if (!electronApi) {
      setLoaded(true)
      return
    }
    const rows = await electronApi.db.getFixedAssets()
    setAssets(rows.map(rowToAsset))
    setLoaded(true)
  }

  useEffect(() => {
    refresh()
  }, [])

  async function addAsset(input: NewFixedAsset) {
    const electronApi = api()
    if (!electronApi) return
    await electronApi.db.createFixedAsset(input)
    await refresh()
  }

  async function updateAsset(id: string, patch: Partial<NewFixedAsset>) {
    const electronApi = api()
    if (!electronApi) return
    await electronApi.db.updateFixedAsset(id, patch)
    await refresh()
  }

  async function deleteAsset(id: string) {
    const electronApi = api()
    if (!electronApi) return
    await electronApi.db.deleteFixedAsset(id)
    await refresh()
  }

  return (
    <FixedAssetsContext.Provider value={{ assets, loaded, available, addAsset, updateAsset, deleteAsset, refresh }}>
      {children}
    </FixedAssetsContext.Provider>
  )
}

export function useFixedAssetsStore() {
  const ctx = useContext(FixedAssetsContext)
  if (!ctx) {
    throw new Error("useFixedAssetsStore must be used within a FixedAssetsProvider")
  }
  return ctx
}
