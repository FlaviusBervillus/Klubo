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

type SeasonMap = Record<string, { status: string; paid: boolean }>

const SeasonsContext = createContext<{
  seasons: Season[]
  activeSeasonId: string | null
  activeSeason: Season | null
  loaded: boolean
  setActiveSeasonId: (id: string) => Promise<void>
  createSeason: (input: { label: string; startDate: string; endDate: string }) => Promise<void>
  updateSeason: (id: string, patch: Partial<{ label: string; startDate: string; endDate: string }>) => Promise<void>
  deleteSeason: (id: string) => Promise<void>
  deleteSeasonCascade: (
    id: string,
  ) => Promise<
    | { ok: true; deletedTransactions: number; deletedClients: number; deletedPayers: number }
    | { ok: false; error?: string }
  >
  // Effectif (cours + payé) de la saison active — tenu ici (et non dans useSeasonClients, qui n'est
  // qu'un hook utilitaire sans état propre) pour que toute mise à jour soit immédiatement visible
  // partout où elle est utilisée, pas seulement dans le composant qui l'a déclenchée.
  activeSeasonMap: SeasonMap
  setClientSeasonInfo: (clientId: string, payload: { status: CourseType; paid: boolean }) => Promise<void>
  removeClientFromSeason: (clientId: string) => Promise<void>
  resetActiveSeasonClients: () => Promise<void>
  getOtherSeasonRoster: (seasonId: string) => Promise<SeasonMap>
  bringClientForward: (clientId: string, previousStatus: CourseType) => Promise<void>
} | null>(null)

export function SeasonsProvider({ children }: { children: React.ReactNode }) {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [activeSeasonId, setActiveSeasonIdState] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [activeSeasonMap, setActiveSeasonMap] = useState<SeasonMap>({})

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

  async function updateSeason(
    id: string,
    patch: Partial<{ label: string; startDate: string; endDate: string }>,
  ) {
    const electronApi = api()
    if (!electronApi) return
    await electronApi.db.updateSeason(id, patch)
    await refresh()
  }

  async function deleteSeason(id: string) {
    const electronApi = api()
    if (!electronApi) return
    await electronApi.db.deleteSeason(id)
    if (activeSeasonId === id) {
      const remaining = seasons.filter((s) => s.id !== id)
      await setActiveSeasonId(remaining[0]?.id ?? "")
    }
    await refresh()
  }

  async function deleteSeasonCascade(id: string) {
    const electronApi = api()
    if (!electronApi) return { ok: false as const, error: undefined }
    const result = await electronApi.db.deleteSeasonCascade(id)
    if (result.ok) {
      if (activeSeasonId === id) {
        const remaining = seasons.filter((s) => s.id !== id)
        await setActiveSeasonId(remaining[0]?.id ?? "")
      }
      await refresh()
    }
    return result
  }

  async function reloadActiveSeasonMap() {
    const electronApi = api()
    if (!electronApi || !activeSeasonId) {
      setActiveSeasonMap({})
      return
    }
    const map = await electronApi.db.getClientSeasonMap(activeSeasonId)
    setActiveSeasonMap(map)
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      const electronApi = api()
      if (!electronApi || !activeSeasonId) {
        if (!cancelled) setActiveSeasonMap({})
        return
      }
      const map = await electronApi.db.getClientSeasonMap(activeSeasonId)
      if (!cancelled) setActiveSeasonMap(map)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [activeSeasonId])

  async function setClientSeasonInfo(clientId: string, payload: { status: CourseType; paid: boolean }) {
    const electronApi = api()
    if (!electronApi || !activeSeasonId) return
    await electronApi.db.setClientSeason(clientId, activeSeasonId, payload)
    await reloadActiveSeasonMap()
  }

  async function removeClientFromSeason(clientId: string) {
    const electronApi = api()
    if (!electronApi || !activeSeasonId) return
    await electronApi.db.deleteClientSeason(clientId, activeSeasonId)
    await reloadActiveSeasonMap()
  }

  /** Vide entièrement l'effectif de la saison active (les fiches clients elles-mêmes ne sont pas supprimées). */
  async function resetActiveSeasonClients() {
    const electronApi = api()
    if (!electronApi || !activeSeasonId) return
    await electronApi.db.resetSeasonClients(activeSeasonId)
    await reloadActiveSeasonMap()
  }

  /** Effectif d'une AUTRE saison (ex. la précédente), pour proposer de reprendre un client déjà connu. */
  async function getOtherSeasonRoster(seasonId: string) {
    const electronApi = api()
    if (!electronApi) return {}
    return electronApi.db.getClientSeasonMap(seasonId)
  }

  /** Inscrit un client déjà connu (saison précédente) dans la saison active, en reprenant son
   * cours d'alors comme point de départ ; le paiement repart à zéro (nouvelle saison, nouveau dû). */
  async function bringClientForward(clientId: string, previousStatus: CourseType) {
    await setClientSeasonInfo(clientId, { status: previousStatus, paid: false })
  }

  const activeSeason = seasons.find((s) => s.id === activeSeasonId) ?? null

  return (
    <SeasonsContext.Provider
      value={{
        seasons,
        activeSeasonId,
        activeSeason,
        loaded,
        setActiveSeasonId,
        createSeason,
        updateSeason,
        deleteSeason,
        deleteSeasonCascade,
        activeSeasonMap,
        setClientSeasonInfo,
        removeClientFromSeason,
        resetActiveSeasonClients,
        getOtherSeasonRoster,
        bringClientForward,
      }}
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
 * Effectif de la saison active : un client n'apparaît que s'il a une ligne "client_seasons"
 * pour cette saison (vraie appartenance, pas un simple surclassement) — une nouvelle saison
 * démarre donc avec un effectif vide, volontairement, puisqu'on n'a pas forcément les mêmes
 * adhérents chaque année. Sans saison active, on retombe sur la fiche globale de chaque client
 * (comportement historique, aucun filtre). Les clients déjà inscrits une saison précédente
 * peuvent être "repris" via `bringClientForward`.
 */
export function useSeasonClients() {
  const { clients } = useClientsStore()
  const {
    activeSeasonId,
    activeSeasonMap,
    setClientSeasonInfo,
    removeClientFromSeason,
    resetActiveSeasonClients,
    getOtherSeasonRoster,
    bringClientForward,
  } = useSeasons()

  // L'effectif (dérivé de activeSeasonMap, tenu dans SeasonsProvider — voir plus haut) est donc
  // partagé par TOUS les composants qui appellent ce hook : une mise à jour déclenchée depuis l'un
  // d'eux (ex. une boîte de dialogue d'édition) se reflète immédiatement dans tous les autres (ex.
  // le tableau des adhérents), plutôt que de rester isolée dans un état local propre à l'appelant.
  const seasonClients: Client[] = useMemo(
    () =>
      activeSeasonId
        ? clients
            .filter((c) => c.id in activeSeasonMap)
            .map((c) => ({
              ...c,
              status: activeSeasonMap[c.id].status as CourseType,
              paid: activeSeasonMap[c.id].paid,
            }))
        : clients,
    [clients, activeSeasonId, activeSeasonMap],
  )

  return {
    clients: seasonClients,
    setClientSeasonInfo,
    removeClientFromSeason,
    resetActiveSeasonClients,
    getOtherSeasonRoster,
    bringClientForward,
    hasActiveSeason: !!activeSeasonId,
  }
}
