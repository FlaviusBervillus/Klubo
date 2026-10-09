"use client"

import { useState } from "react"
import { EyeIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Empty } from "@/components/ui/empty"
import { QuoteFormDialog } from "@/components/devis/quote-form-dialog"
import { QuotePreviewDialog } from "@/components/devis/quote-preview-dialog"
import { useQuotesStore } from "@/lib/quotes-store"
import { formatDate, formatEuro } from "@/lib/mock-data"
import { useTranslation } from "@/lib/i18n/context"

export function QuotesTable() {
  const { t } = useTranslation()
  const { quotes, deleteQuote } = useQuotesStore()
  const [previewId, setPreviewId] = useState<string | null>(null)

  function quoteTotal(quote: (typeof quotes)[number]) {
    return quote.items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0)
  }

  function recipientName(quote: (typeof quotes)[number]) {
    return quote.recipientLines.split("\n")[0]?.trim() || "—"
  }

  async function handleDelete(id: string) {
    await deleteQuote(id)
    toast.success(t.devis.quoteDeleted)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>{t.devis.colDate}</TableHead>
              <TableHead>{t.devis.colNumber}</TableHead>
              <TableHead>{t.devis.colRecipient}</TableHead>
              <TableHead className="text-right">{t.devis.colTotal}</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotes.map((quote) => (
              <TableRow key={quote.id}>
                <TableCell className="whitespace-nowrap">{formatDate(quote.date)}</TableCell>
                <TableCell className="text-muted-foreground">{quote.number || "—"}</TableCell>
                <TableCell className="font-medium">{recipientName(quote)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatEuro(quoteTotal(quote))}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t.devis.previewTitle}
                      onClick={() => setPreviewId(quote.id)}
                    >
                      <EyeIcon />
                    </Button>
                    <QuoteFormDialog quote={quote} />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t.devis.quoteDeleted}
                      onClick={() => handleDelete(quote.id)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {quotes.length === 0 ? (
          <Empty className="border-0">
            <p className="text-sm text-muted-foreground">{t.devis.noQuotes}</p>
          </Empty>
        ) : null}
      </div>

      <QuotePreviewDialog quoteId={previewId} onOpenChange={(open) => !open && setPreviewId(null)} />
    </div>
  )
}
