"use client"

import { createContext, useContext, useEffect, useState } from "react"

import type { CourseType } from "@/lib/mock-data"

function api() {
  return typeof window !== "undefined" ? window.electronAPI : undefined
}

export type CotisationPrices = Partial<Record<CourseType, number>>

const CotisationPricesContext = createContext<{
  prices: CotisationPrices
  loaded: boolean
  available: boolean
  setPrice: (courseType: CourseType, price: number) => Promise<void>
  refresh: () => Promise<void>
} | null>(null)

export function CotisationPricesProvider({ children }: { children: React.ReactNode }) {
  const [prices, setPrices] = useState<CotisationPrices>({})
  const [loaded, setLoaded] = useState(false)
  const available = !!api()

  async function refresh() {
    const electronApi = api()
    if (!electronApi) {
      setLoaded(true)
      return
    }
    const rows = await electronApi.db.getCotisationPrices()
    setPrices(rows as CotisationPrices)
    setLoaded(true)
  }

  useEffect(() => {
    refresh()
  }, [])

  async function setPrice(courseType: CourseType, price: number) {
    const electronApi = api()
    if (!electronApi) return
    await electronApi.db.setCotisationPrice(courseType, price)
    await refresh()
  }

  return (
    <CotisationPricesContext.Provider value={{ prices, loaded, available, setPrice, refresh }}>
      {children}
    </CotisationPricesContext.Provider>
  )
}

export function useCotisationPrices() {
  const ctx = useContext(CotisationPricesContext)
  if (!ctx) {
    throw new Error("useCotisationPrices must be used within a CotisationPricesProvider")
  }
  return ctx
}
