"use client"

import { createContext, useContext, useEffect, useState } from "react"

import type { Dictionary, Locale } from "@/lib/i18n/dictionary"
import { fr } from "@/lib/i18n/fr"
import { en } from "@/lib/i18n/en"

const dictionaries: Record<Locale, Dictionary> = { fr, en }

const STORAGE_KEY = "locale"

const LocaleContext = createContext<{
  locale: Locale
  setLocale: (locale: Locale) => void
  t: Dictionary
} | null>(null)

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("fr")

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored === "fr" || stored === "en") setLocaleState(stored)
    } catch {
      // stockage indisponible — on garde la langue par défaut
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  function setLocale(next: Locale) {
    setLocaleState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // stockage indisponible — le choix reste actif pour la session
    }
  }

  return (
    <LocaleContext.Provider
      value={{ locale, setLocale, t: dictionaries[locale] }}
    >
      {children}
    </LocaleContext.Provider>
  )
}

export function useTranslation() {
  const ctx = useContext(LocaleContext)
  if (!ctx) {
    throw new Error("useTranslation must be used within a LocaleProvider")
  }
  return ctx
}

export function interpolate(template: string, values: Record<string, string | number>) {
  return template.replace(/{(\w+)}/g, (match, key) =>
    key in values ? String(values[key]) : match,
  )
}
