import type { Role } from "@/lib/mock-data"

/**
 * Permissions centralisées par rôle plutôt que des `role === "secretaire"` dispersés dans chaque
 * composant — facilite de futurs ajustements (ex. si un autre rôle doit un jour avoir les mêmes
 * limites). Pour l'instant, seul le secrétaire reçoit des restrictions : il garde un accès complet
 * à l'application (adhérents, transactions, devis, factures en lecture/téléchargement) mais ne peut
 * pas créer de transaction, toucher au paiement/statut de paiement d'un adhérent, ni créer/
 * personnaliser une facture — la création de devis, elle, reste libre pour ce rôle.
 */

export function canCreateTransaction(role: Role | undefined): boolean {
  return role !== "secretaire"
}

export function canEditPayment(role: Role | undefined): boolean {
  return role !== "secretaire"
}

export function canEditInvoice(role: Role | undefined): boolean {
  return role !== "secretaire"
}
