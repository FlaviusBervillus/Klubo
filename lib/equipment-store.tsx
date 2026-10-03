"use client"

import { createContext, useContext, useEffect, useState } from "react"

import type { DbEquipmentItem } from "@/types/electron"

function api() {
  return typeof window !== "undefined" ? window.electronAPI : undefined
}

export interface EquipmentItem {
  id: string
  label: string
  stockQuantity: number
  purchasePrice: number
  salePrice: number
  notes: string
}

function rowToItem(row: DbEquipmentItem): EquipmentItem {
  return {
    id: row.id,
    label: row.label,
    stockQuantity: row.stock_quantity,
    purchasePrice: row.purchase_price,
    salePrice: row.sale_price,
    notes: row.notes ?? "",
  }
}

export interface NewEquipmentItem {
  [key: string]: unknown
  label: string
  stockQuantity: number
  purchasePrice: number
  salePrice: number
  notes: string
}

const EquipmentContext = createContext<{
  items: EquipmentItem[]
  loaded: boolean
  available: boolean
  addItem: (input: NewEquipmentItem) => Promise<void>
  updateItem: (id: string, patch: Partial<NewEquipmentItem>) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  refresh: () => Promise<void>
} | null>(null)

export function EquipmentProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<EquipmentItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const available = !!api()

  async function refresh() {
    const electronApi = api()
    if (!electronApi) {
      setLoaded(true)
      return
    }
    const rows = await electronApi.db.getEquipmentItems()
    setItems(rows.map(rowToItem))
    setLoaded(true)
  }

  useEffect(() => {
    refresh()
  }, [])

  async function addItem(input: NewEquipmentItem) {
    const electronApi = api()
    if (!electronApi) return
    await electronApi.db.createEquipmentItem(input)
    await refresh()
  }

  async function updateItem(id: string, patch: Partial<NewEquipmentItem>) {
    const electronApi = api()
    if (!electronApi) return
    await electronApi.db.updateEquipmentItem(id, patch)
    await refresh()
  }

  async function deleteItem(id: string) {
    const electronApi = api()
    if (!electronApi) return
    await electronApi.db.deleteEquipmentItem(id)
    await refresh()
  }

  return (
    <EquipmentContext.Provider value={{ items, loaded, available, addItem, updateItem, deleteItem, refresh }}>
      {children}
    </EquipmentContext.Provider>
  )
}

export function useEquipmentStore() {
  const ctx = useContext(EquipmentContext)
  if (!ctx) {
    throw new Error("useEquipmentStore must be used within an EquipmentProvider")
  }
  return ctx
}
