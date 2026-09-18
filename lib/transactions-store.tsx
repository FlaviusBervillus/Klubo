"use client"

import { createContext, useContext, useEffect, useState } from "react"

import type {
  Category,
  PaymentMethod,
  Transaction,
  TransactionStatus,
  TransactionType,
} from "@/lib/mock-data"
import type { DbTransaction } from "@/types/electron"

function api() {
  return typeof window !== "undefined" ? window.electronAPI : undefined
}

function rowToTransaction(row: DbTransaction): Transaction {
  return {
    id: row.id,
    date: row.date,
    description: row.description,
    member: row.member,
    method: row.method as PaymentMethod,
    category: (row.category ?? "Non catégorisé") as Category,
    type: row.type as TransactionType,
    amount: row.amount,
    status: row.status as TransactionStatus,
    stripe: row.stripe_charge_id
      ? {
          paymentIntentId: row.stripe_payment_intent_id ?? "",
          chargeId: row.stripe_charge_id,
          fee: row.stripe_fee ?? 0,
          net: row.stripe_net ?? 0,
          raw: row.stripe_raw_json ? JSON.parse(row.stripe_raw_json) : {},
        }
      : undefined,
    justificatif: row.justificatif_type
      ? {
          type: row.justificatif_type as "pdf" | "image",
          name: row.justificatif_name ?? "",
        }
      : undefined,
  }
}

export interface NewTransaction {
  [key: string]: unknown
  date: string
  description: string
  member: string | null
  method: PaymentMethod
  category: Category
  type: TransactionType
  amount: number
  status: TransactionStatus
}

const TransactionsContext = createContext<{
  transactions: Transaction[]
  loaded: boolean
  available: boolean
  getTransaction: (id: string) => Transaction | undefined
  categorize: (id: string, category: Category) => Promise<void>
  addTransaction: (input: NewTransaction) => Promise<void>
  refresh: () => Promise<void>
} | null>(null)

export function TransactionsProvider({ children }: { children: React.ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loaded, setLoaded] = useState(false)
  const available = !!api()

  async function refresh() {
    const electronApi = api()
    if (!electronApi) {
      setLoaded(true)
      return
    }
    const rows = await electronApi.db.getTransactions()
    setTransactions(rows.map(rowToTransaction))
    setLoaded(true)
  }

  useEffect(() => {
    refresh()
  }, [])

  async function categorize(id: string, category: Category) {
    const electronApi = api()
    if (!electronApi) return
    await electronApi.db.updateTransaction(id, { category, status: "valide" })
    setTransactions((prev) =>
      prev.map((tx) => (tx.id === id ? { ...tx, category, status: "valide" } : tx)),
    )
  }

  async function addTransaction(input: NewTransaction) {
    const electronApi = api()
    if (!electronApi) return
    await electronApi.db.createTransaction(input)
    await refresh()
  }

  function getTransaction(id: string) {
    return transactions.find((tx) => tx.id === id)
  }

  return (
    <TransactionsContext.Provider
      value={{ transactions, loaded, available, getTransaction, categorize, addTransaction, refresh }}
    >
      {children}
    </TransactionsContext.Provider>
  )
}

export function useTransactionsStore() {
  const ctx = useContext(TransactionsContext)
  if (!ctx) {
    throw new Error("useTransactionsStore must be used within a TransactionsProvider")
  }
  return ctx
}
