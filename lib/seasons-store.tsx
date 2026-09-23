"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"

import { useClientsStore } from "@/lib/clients-store"
import type { Client, CourseType } from "@/lib/mock-data"
import { useTransactionsStore } from "@/lib/transactions-store"
import type { DbSeason } from "@/types/electron"

export interface Season {
  id: string
  label: string
  startDate: string
  endDate: string
}

function api() {
  return typeof window !== "undefined" ? window.electronAPI : undefined
}

function rowToSeason(row: DbSeason): Season {
  return { id: row.id, label: row.label, startDate: row.start_date, endDate: row.end_date }
}

const ACTIVE_SEASON_SETTING_KEY = "activeSeasonId"

const SeasonsContext = createContext<{
  seasons: Season[]
  activeSeasonId: string | null
  activeSeason: Season | null
  loaded: boolean
  setActiveSeasonId: (id: string) => Promise<void>
  createSeason: (input: { label: string; startDate: string; endDate: string }) => Promise<void>
} | null>(null)

export function SeasonsProvider({ children }: { children: React.ReactNode }) {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [activeSeasonId, setActiveSeasonIdState] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  async function refresh() {
    const electronApi = api()
    if (!electronApi) {
      setLoaded(true)
      return
    }
    const rows = await electronApi.db.getSeasons()
    const list = rows.map(rowToSeason)
    setSeasons(list)

    const settings = await electronApi.db.getSettings()
    const stored = settings[ACTIVE_SEASON_SETTING_KEY]
    if (stored && list.some((s) => s.id === stored)) {
      setActiveSeasonIdState(stored)
    } else if (list.length > 0) {
      // Saisons triées par date de début décroissante côté DB : la plus récente en premier.
      setActiveSeasonIdState(list[0].id)
    }
    setLoaded(true)
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function setActiveSeasonId(id: string) {
    setActiveSeasonIdState(id)
    const electronApi = api()
    if (!electronApi) return
    await electronApi.db.setSetting(ACTIVE_SEASON_SETTING_KEY, id)
  }

  async function createSeason(input: { label: string; startDate: string; endDate: string }) {
    const electronApi = api()
    if (!electronApi) return
    await electronApi.db.createSeason(input)
    await refresh()
  }

  const activeSeason = seasons.find((s) => s.id === activeSeasonId) ?? null

  return (
    <SeasonsContext.Provider
      value={{ seasons, activeSeasonId, activeSeason, loaded, setActiveSeasonId, createSeason }}
    >
      {children}
    </SeasonsContext.Provider>
  )
}

export function useSeasons() {
  const ctx = useContext(SeasonsContext)
  if (!ctx) {
    throw new Error("useSeasons must be used within a SeasonsProvider")
  }
  return ctx
}

/** Pas de saison sélectionnée = pas de filtre (toutes les données, comportement historique). */
export function isDateInSeason(dateIso: string, season: Season | null): boolean {
  if (!season) return true
  // Date locale (pas la date UTC brute) : un paiement à 1h du matin heure de Paris le
  // 1er septembre reste daté du 31 août en UTC, ce qui le classerait à tort dans la
  // saison précédente si on comparait la chaîne ISO telle quelle.
  const d = new Date(dateIso)
  const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  return localDate >= season.startDate && localDate <= season.endDate
}

/** Transactions du store, filtrées sur la saison active (toutes si aucune n'est sélectionnée). */
export function useSeasonTransactions() {
  const { transactions } = useTransactionsStore()
  const { activeSeason } = useSeasons()
  return useMemo(
    () => transactions.filter((tx) => isDateInSeason(tx.date, activeSeason)),
    [transactions, activeSeason],
  )
}

/**
 * Clients avec leur cours/statut de paiement propres à la saison active : la fiche client
 * (nom, email, adresse) reste commune à toutes les saisons, seuls "cours" et "payé" en sont
 * extraits ici, avec repli sur les valeurs de la fiche tant qu'aucune saison n'a de valeur
 * explicite pour ce client (ex. saisons créées avant l'ajout de cette fonctionnalité).
 */
export function useSeasonClients() {
  const { clients } = useClientsStore()
  const { activeSeasonId } = useSeasons()
  const [seasonMap, setSeasonMap] = useState<Record<string, { status: string; paid: boolean }>>({})

  useEffect(() => {
    let cancelled = false
    async function load() {
      const electronApi = api()
      if (!electronApi || !activeSeasonId) {
        setSeasonMap({})
        return
      }
      const map = await electronApi.db.getClientSeasonMap(activeSeasonId)
      if (!cancelled) setSeasonMap(map)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [activeSeasonId, clients])

  const seasonClients: Client[] = clients.map((c) => {
    const override = seasonMap[c.id]
    if (!override) return c
    return { ...c, status: override.status as CourseType, paid: override.paid }
  })

  async function setClientSeasonInfo(clientId: string, payload: { status: CourseType; paid: boolean }) {
    const electronApi = api()
    if (!electronApi || !activeSeasonId) return
    await electronApi.db.setClientSeason(clientId, activeSeasonId, payload)
    const map = await electronApi.db.getClientSeasonMap(activeSeasonId)
    setSeasonMap(map)
  }

  return { clients: seasonClients, setClientSeasonInfo, hasActiveSeason: !!activeSeasonId }
}
