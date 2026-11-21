"use client"

import { useState } from "react"
import { EyeIcon } from "lucide-react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Empty } from "@/components/ui/empty"
import { ReceiptPreviewDialog } from "@/components/transactions/receipt-preview-dialog"
import { useTransactionsStore } from "@/lib/transactions-store"
import { useClientsStore } from "@/lib/clients-store"
import { usePayersStore } from "@/lib/payers-store"
import { clientFullName } from "@/lib/client-payments"
import { formatDate, formatEuro, type Transaction } from "@/lib/mock-data"
import { useTranslation } from "@/lib/i18n/context"

export function InvoicesTable({ search }: { search: string }) {
  const { t } = useTranslation()
  const { transactions } = useTransactionsStore()
  const { clients } = useClientsStore()
  const { payers } = usePayersStore()
  const [previewId, setPreviewId] = useState<string | null>(null)

  function invoicePayerName(tx: Transaction) {
    if (tx.linkedClientId) {
      const client = clients.find((c) => c.id === tx.linkedClientId)
      if (client) return clientFullName(client)
    }
    if (tx.linkedPayerId) {
      const payer = payers.find((p) => p.id === tx.linkedPayerId)
      if (payer) return `${payer.firstName} ${payer.lastName}`.trim()
    }
    return tx.member || "—"
  }

  const query = search.trim().toLowerCase()
  const invoices = transactions
    .filter((tx) => !!tx.invoiceNumber)
    .filter(
      (tx) =>
        !query ||
        tx.invoiceNumber!.toLowerCase().includes(query) ||
        invoicePayerName(tx).toLowerCase().includes(query),
    )
    .sort((a, b) => (a.invoiceNumber! < b.invoiceNumber! ? 1 : -1))

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>{t.devis.colDate}</TableHead>
            <TableHead>{t.devis.colNumber}</TableHead>
            <TableHead>{t.devis.colInvoicePayer}</TableHead>
            <TableHead className="text-right">{t.devis.colInvoiceAmount}</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((tx) => (
            <TableRow key={tx.id}>
              <TableCell className="whitespace-nowrap">{formatDate(tx.date)}</TableCell>
              <TableCell className="font-mono text-muted-foreground">{tx.invoiceNumber}</TableCell>
              <TableCell className="font-medium">{invoicePayerName(tx)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{formatEuro(tx.amount)}</TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t.receiptPreview.title}
                    onClick={() => setPreviewId(tx.id)}
                  >
                    <EyeIcon />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {invoices.length === 0 ? (
        <Empty className="border-0">
          <p className="text-sm text-muted-foreground">
            {query ? t.devis.noSearchResults : t.devis.noInvoices}
          </p>
        </Empty>
      ) : null}

      <ReceiptPreviewDialog transactionId={previewId} onOpenChange={(open) => !open && setPreviewId(null)} />
    </div>
  )
}
