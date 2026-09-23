import { toast } from "sonner"

import type { Dictionary } from "@/lib/i18n/dictionary"

/**
 * Stripe génère lui-même une vraie facture pour les paiements passés par Stripe Invoicing :
 * on la télécharge directement dans ce cas (rien à prévisualiser/éditer, c'est la facture
 * officielle). Sinon, on ouvre l'aperçu habituel pour générer notre propre justificatif.
 */
export async function downloadReceiptOrOpenPreview(
  transactionId: string,
  t: Dictionary,
  openPreview: () => void,
) {
  const electronApi = typeof window !== "undefined" ? window.electronAPI : undefined
  if (!electronApi) {
    toast.error(t.settings.electronOnlyFeature)
    return
  }

  const prepared = await electronApi.prepareReceipt(transactionId)
  if (prepared.ok && prepared.stripeInvoicePdfUrl) {
    const result = await electronApi.downloadStripeInvoice(transactionId)
    if (result.ok) {
      toast.success(t.transactionDetail.downloadReceipt, { description: result.path })
    } else if (!result.canceled) {
      toast.error(result.error || t.transactionDetail.downloadReceipt)
    }
    return
  }

  openPreview()
}
