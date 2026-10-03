import { clientFullName, normalizeClientName } from "@/lib/client-payments"
import type { CotisationPrices } from "@/lib/cotisation-prices-store"
import type { Client, CourseType, Transaction } from "@/lib/mock-data"

export interface CotisationMatch {
  client: Client
  /** Cours déduit du montant payé, uniquement si le montant correspond exactement à un tarif
   * configuré — sinon null (ex. un règlement de licence seule, à un montant différent de la
   * cotisation complète : on ne doit jamais deviner le cours dans ce cas). */
  suggestedCourse: CourseType | null
}

/** Retrouve le client correspondant à l'adhérent lié d'une transaction catégorisée "Cotisations",
 * et le cours que son montant laisse supposer, d'après les tarifs configurés. */
export function matchCotisationPayment(
  tx: Pick<Transaction, "member" | "amount">,
  clients: Client[],
  prices: CotisationPrices,
): CotisationMatch | null {
  if (!tx.member) return null
  const normName = normalizeClientName(tx.member)
  const client = clients.find((c) => normalizeClientName(clientFullName(c)) === normName)
  if (!client) return null

  const suggestedCourse =
    (Object.entries(prices) as [CourseType, number][]).find(
      ([, price]) => Math.abs(price - tx.amount) < 0.01,
    )?.[0] ?? null

  return { client, suggestedCourse }
}

export interface CotisationAutoMatchResult {
  clientName: string
  courseUpdated: CourseType | null
}

/** Applique le rapprochement : marque le client payé, et met à jour son cours UNIQUEMENT si le
 * montant correspond exactement à un tarif connu (sinon on laisse le cours tel quel — ex. un
 * règlement de licence seule, à un montant différent de la cotisation complète). */
export async function applyCotisationAutoMatch(
  tx: Pick<Transaction, "member" | "amount">,
  clients: Client[],
  prices: CotisationPrices,
  actions: {
    hasActiveSeason: boolean
    setClientSeasonInfo: (id: string, payload: { status: CourseType; paid: boolean }) => Promise<void>
    updateClient: (id: string, patch: Partial<{ status: CourseType; paid: boolean }>) => Promise<void>
  },
): Promise<CotisationAutoMatchResult | null> {
  const match = matchCotisationPayment(tx, clients, prices)
  if (!match) return null

  const payload = { status: match.suggestedCourse ?? match.client.status, paid: true }
  if (actions.hasActiveSeason) {
    await actions.setClientSeasonInfo(match.client.id, payload)
  } else {
    await actions.updateClient(match.client.id, payload)
  }
  return { clientName: clientFullName(match.client), courseUpdated: match.suggestedCourse }
}
