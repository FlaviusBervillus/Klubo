import type { Client, Transaction } from "@/lib/mock-data"

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

export interface ClientPaymentMatch {
  transaction: Transaction
  via: "direct" | "guardian"
}

/** Transactions dont l'adhérent lié correspond au nom de ce client, ou — s'il a un tuteur — au nom
 * de son tuteur : cas très fréquent où un parent règle la cotisation de son enfant, la transaction
 * reste au nom du parent mais sert quand même de preuve de paiement pour l'enfant. */
export function findClientPayments(
  client: Client,
  guardian: Client | null,
  transactions: Transaction[],
): ClientPaymentMatch[] {
  const fullName = normalizeClientName(clientFullName(client))
  const guardianName = guardian ? normalizeClientName(clientFullName(guardian)) : null
  const matches: ClientPaymentMatch[] = []
  for (const tx of transactions) {
    if (tx.type !== "entree" || tx.status === "echec" || !tx.member) continue
    const txMember = normalizeClientName(tx.member)
    if (txMember === fullName) matches.push({ transaction: tx, via: "direct" })
    else if (guardianName && txMember === guardianName) matches.push({ transaction: tx, via: "guardian" })
  }
  return matches.sort((a, b) => (a.transaction.date < b.transaction.date ? 1 : -1))
}

/** Clients dont le tuteur est ce client (ex. les enfants d'un parent) — pour suggérer de
 * réattribuer une transaction payée par le parent au bon enfant. */
export function findLinkedChildren(client: Client, allClients: Client[]) {
  return allClients.filter((c) => c.guardianId === client.id)
}
