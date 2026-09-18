"use client"

import { useEffect, useState } from "react"

export type WidgetId =
  | "alerts"
  | "balances"
  | "members"
  | "flow"
  | "quickActions"
  | "expenses"

export interface WidgetConfig {
  id: WidgetId
  visible: boolean
}

const STORAGE_KEY = "dashboard-layout"

const defaultLayout: WidgetConfig[] = [
  { id: "alerts", visible: true },
  { id: "balances", visible: true },
  { id: "members", visible: true },
  { id: "flow", visible: true },
  { id: "quickActions", visible: true },
  { id: "expenses", visible: true },
]

export function useDashboardLayout() {
  const [layout, setLayout] = useState<WidgetConfig[]>(defaultLayout)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const stored: WidgetConfig[] = JSON.parse(raw)
        const knownIds = new Set(stored.map((w) => w.id))
        const merged = [
          ...stored.filter((w) => defaultLayout.some((d) => d.id === w.id)),
          ...defaultLayout.filter((d) => !knownIds.has(d.id)),
        ]
        setLayout(merged)
      }
    } catch {
      // stockage indisponible — on garde la disposition par défaut
    }
    setLoaded(true)
  }, [])

  function persist(next: WidgetConfig[]) {
    setLayout(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // stockage indisponible — la disposition reste active pour la session
    }
  }

  function toggle(id: WidgetId) {
    persist(
      layout.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)),
    )
  }

  function move(id: WidgetId, direction: -1 | 1) {
    const index = layout.findIndex((w) => w.id === id)
    const target = index + direction
    if (index === -1 || target < 0 || target >= layout.length) return
    const next = [...layout]
    ;[next[index], next[target]] = [next[target], next[index]]
    persist(next)
  }

  function reset() {
    persist(defaultLayout)
  }

  return { layout, loaded, toggle, move, reset }
}
