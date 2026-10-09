"use client"

import { createContext, useContext, useEffect, useState } from "react"

import type { DbQuote } from "@/types/electron"

function api() {
  return typeof window !== "undefined" ? window.electronAPI : undefined
}

export interface QuoteItem {
  id: string
  label: string
  description: string
  qty: number
  unitPrice: number
}

/** Devis librement rempli (pas rattaché à un adhérent/une transaction, voir components/devis). */
export interface Quote {
  id: string
  number: string
  date: string
  title: string
  subtitle: string
  seasonLabel: string
  emitterLines: string
  recipientLines: string
  infoTitle: string
  infoText: string
  prestationTitle: string
  prestationText: string
  items: QuoteItem[]
  termsTitle: string
  termsText: string
  signatureLeftLabel: string
  signatureRightLabel: string
  createdAt: string
}

function rowToQuote(row: DbQuote): Quote {
  let items: QuoteItem[] = []
  try {
    items = JSON.parse(row.items_json || "[]")
  } catch {
    items = []
  }
  return {
    id: row.id,
    number: row.number,
    date: row.date,
    title: row.title,
    subtitle: row.subtitle,
    seasonLabel: row.season_label,
    emitterLines: row.emitter_lines,
    recipientLines: row.recipient_lines,
    infoTitle: row.info_title,
    infoText: row.info_text,
    prestationTitle: row.prestation_title,
    prestationText: row.prestation_text,
    items,
    termsTitle: row.terms_title,
    termsText: row.terms_text,
    signatureLeftLabel: row.signature_left_label,
    signatureRightLabel: row.signature_right_label,
    createdAt: row.created_at,
  }
}

export type NewQuote = Omit<Quote, "id" | "createdAt">

function toRowPatch(input: Partial<NewQuote>): Record<string, unknown> {
  const patch: Record<string, unknown> = { ...input }
  if (input.items !== undefined) {
    patch.itemsJson = JSON.stringify(input.items)
    delete patch.items
  }
  return patch
}

const QuotesContext = createContext<{
  quotes: Quote[]
  loaded: boolean
  available: boolean
  addQuote: (input: NewQuote) => Promise<string | null>
  updateQuote: (id: string, patch: Partial<NewQuote>) => Promise<void>
  deleteQuote: (id: string) => Promise<void>
  refresh: () => Promise<void>
} | null>(null)

export function QuotesProvider({ children }: { children: React.ReactNode }) {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loaded, setLoaded] = useState(false)
  const available = !!api()

  async function refresh() {
    const electronApi = api()
    if (!electronApi) {
      setLoaded(true)
      return
    }
    const rows = await electronApi.db.getQuotes()
    setQuotes(rows.map(rowToQuote))
    setLoaded(true)
  }

  useEffect(() => {
    refresh()
  }, [])

  async function addQuote(input: NewQuote) {
    const electronApi = api()
    if (!electronApi) return null
    const result = await electronApi.db.createQuote(toRowPatch(input))
    await refresh()
    return result.id
  }

  async function updateQuote(id: string, patch: Partial<NewQuote>) {
    const electronApi = api()
    if (!electronApi) return
    await electronApi.db.updateQuote(id, toRowPatch(patch))
    await refresh()
  }

  async function deleteQuote(id: string) {
    const electronApi = api()
    if (!electronApi) return
    await electronApi.db.deleteQuote(id)
    await refresh()
  }

  return (
    <QuotesContext.Provider value={{ quotes, loaded, available, addQuote, updateQuote, deleteQuote, refresh }}>
      {children}
    </QuotesContext.Provider>
  )
}

export function useQuotesStore() {
  const ctx = useContext(QuotesContext)
  if (!ctx) {
    throw new Error("useQuotesStore must be used within a QuotesProvider")
  }
  return ctx
}
