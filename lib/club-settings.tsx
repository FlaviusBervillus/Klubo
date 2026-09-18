"use client"

import { createContext, useContext, useEffect, useState } from "react"

export interface ClubSettings {
  name: string
  season: string
  logoUrl: string | null
  stripeAccountName: string
  address: string
  phone: string
  rna: string
}

const defaultSettings: ClubSettings = {
  name: "Mon club",
  season: "",
  logoUrl: null,
  stripeAccountName: "",
  address: "",
  phone: "",
  rna: "",
}

function api() {
  return typeof window !== "undefined" ? window.electronAPI : undefined
}

const ClubSettingsContext = createContext<{
  settings: ClubSettings
  loaded: boolean
  update: (patch: Partial<ClubSettings>) => Promise<void>
} | null>(null)

export function ClubSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<ClubSettings>(defaultSettings)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    async function init() {
      const electronApi = api()
      if (electronApi) {
        const row = await electronApi.db.getSettings()
        setSettings({
          name: row.clubName ?? defaultSettings.name,
          season: row.clubSeason ?? defaultSettings.season,
          logoUrl: row.clubLogoUrl ?? null,
          stripeAccountName: row.stripeAccountName ?? "",
          address: row.clubAddress ?? "",
          phone: row.clubPhone ?? "",
          rna: row.clubRna ?? "",
        })
      }
      setLoaded(true)
    }
    init()
  }, [])

  async function update(patch: Partial<ClubSettings>) {
    const next = { ...settings, ...patch }
    setSettings(next)
    const electronApi = api()
    if (!electronApi) return
    if (patch.name !== undefined) await electronApi.db.setSetting("clubName", patch.name)
    if (patch.season !== undefined) await electronApi.db.setSetting("clubSeason", patch.season)
    if (patch.logoUrl !== undefined) {
      await electronApi.db.setSetting("clubLogoUrl", patch.logoUrl ?? "")
    }
    if (patch.stripeAccountName !== undefined) {
      await electronApi.db.setSetting("stripeAccountName", patch.stripeAccountName)
    }
    if (patch.address !== undefined) await electronApi.db.setSetting("clubAddress", patch.address)
    if (patch.phone !== undefined) await electronApi.db.setSetting("clubPhone", patch.phone)
    if (patch.rna !== undefined) await electronApi.db.setSetting("clubRna", patch.rna)
  }

  return (
    <ClubSettingsContext.Provider value={{ settings, loaded, update }}>
      {children}
    </ClubSettingsContext.Provider>
  )
}

export function useClubSettings() {
  const ctx = useContext(ClubSettingsContext)
  if (!ctx) {
    throw new Error("useClubSettings must be used within a ClubSettingsProvider")
  }
  return ctx
}
