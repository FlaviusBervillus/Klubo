export type PaymentMethod = "stripe" | "especes" | "cheque" | "virement"
export type TransactionType = "entree" | "sortie"
export type TransactionStatus = "valide" | "en_attente" | "a_categoriser"

export const ALL_PAYMENT_METHODS: PaymentMethod[] = ["especes", "cheque", "virement", "stripe"]

export type Category =
  | "Cotisations"
  | "Licences"
  | "Équipements"
  | "Location salle"
  | "Compétitions"
  | "Subventions"
  | "Assurance"
  | "Stages & événements"
  | "Frais bancaires"
  | "Non catégorisé"

/** Catégories assignables manuellement (hors "Non catégorisé", qui n'est qu'un état par défaut). */
export const ASSIGNABLE_CATEGORIES: Category[] = [
  "Cotisations",
  "Licences",
  "Équipements",
  "Location salle",
  "Compétitions",
  "Subventions",
  "Assurance",
  "Stages & événements",
  "Frais bancaires",
]

export interface StripeDetails {
  paymentIntentId: string
  chargeId: string
  fee: number
  net: number
  raw: Record<string, unknown>
}

export interface Justificatif {
  type: "pdf" | "image"
  name: string
}

export interface Transaction {
  id: string
  date: string
  description: string
  member: string | null
  method: PaymentMethod
  category: Category
  type: TransactionType
  amount: number
  status: TransactionStatus
  stripe?: StripeDetails
  justificatif?: Justificatif
  note?: string
}

/* ---------- Comptes & rôles ---------- */
export type Role = "tresorier" | "secretaire" | "president" | "admin"

/* ---------- Clients ---------- */
export type CourseType =
  | "Kung-fu Adulte"
  | "Kung-fu Ado"
  | "Kung-fu Enfant"
  | "Fitness de combat"
  | "Tai-chi"
  | "Self-défense"

export const ALL_COURSE_TYPES: CourseType[] = [
  "Kung-fu Adulte",
  "Kung-fu Ado",
  "Kung-fu Enfant",
  "Fitness de combat",
  "Tai-chi",
  "Self-défense",
]

export interface Client {
  id: string
  firstName: string
  lastName: string
  email: string
  status: CourseType
  method: PaymentMethod
  paid: boolean
}

/* ---------- Helpers ---------- */
export function formatEuro(value: number, opts?: { signed?: boolean }) {
  const formatted = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value))
  if (opts?.signed) {
    return `${value >= 0 ? "+" : "−"} ${formatted}`
  }
  return value < 0 ? `− ${formatted}` : formatted
}

export function formatDate(iso: string, withTime = false) {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d)
  if (!withTime) return date
  const time = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
  return `${date} · ${time}`
}

export function hoursSince(iso: string) {
  return Math.round((Date.now() - new Date(iso).getTime()) / 36e5)
}

export function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5)
}
