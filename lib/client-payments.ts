import type { Client, Transaction } from "@/lib/mock-data"
import type { Payer } from "@/lib/payers-store"

export function normalizeClientName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
}

export function clientFullName(client: Client) {
  return `${client.firstName} ${client.lastName}`.trim()
}

export function payerFullName(payer: Payer) {
  return `${payer.firstName} ${payer.lastName}`.trim()
}

export interface ClientPaymentMatch {
  transaction: Transaction
  via: "direct" | "payer"
}

/** Transactions dont l'adhérent lié correspond au nom de ce client, ou — s'il a un payeur — au nom
 * de ce payeur : cas très fréquent où un parent règle la cotisation de son enfant, la transaction
 * reste au nom du parent mais sert quand même de preuve de paiement pour l'enfant. Une transaction
 * explicitement associée à un adhérent (linkedClientId, voir transaction-detail-view.tsx) ne
 * correspond qu'à LUI — sans ça, un payeur avec plusieurs enfants dans le club ferait remonter la
 * même transaction comme preuve de paiement pour chacun d'eux. */
export function findClientPayments(
  client: Client,
  payer: Payer | null,
  transactions: Transaction[],
): ClientPaymentMatch[] {
  const fullName = normalizeClientName(clientFullName(client))
  const payerName = payer ? normalizeClientName(payerFullName(payer)) : null
  const matches: ClientPaymentMatch[] = []
  for (const tx of transactions) {
    if (tx.type !== "entree" || tx.status === "echec") continue
    if (tx.linkedClientId) {
      if (tx.linkedClientId === client.id) matches.push({ transaction: tx, via: "direct" })
      continue
    }
    if (!tx.member) continue
    const txMember = normalizeClientName(tx.member)
    if (txMember === fullName) matches.push({ transaction: tx, via: "direct" })
    else if (payerName && txMember === payerName) matches.push({ transaction: tx, via: "payer" })
  }
  return matches.sort((a, b) => (a.transaction.date < b.transaction.date ? 1 : -1))
}

/** Adhérents explicitement déclarés "enfant" de ce payeur depuis sa fiche (payeurs > modifier) — pour
 * suggérer de réattribuer une transaction payée par le parent au bon enfant. Exclut l'adhérent
 * déclaré "self" : certains adultes sont à la fois membres du club ET leur propre payeur (ils
 * règlent leur propre cotisation) — ce n'est pas un "enfant" à qui réattribuer, la transaction est
 * déjà correctement rattachée à cette personne. */
export function findLinkedChildren(payer: Payer, allClients: Client[]) {
  return allClients.filter((c) => c.payerId === payer.id && c.payerRelationship !== "self")
}
