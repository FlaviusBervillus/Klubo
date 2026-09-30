"use client"

import { useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  ArrowLeftIcon,
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  CalendarIcon,
  TagIcon,
  UserIcon,
  FileTextIcon,
  ImageIcon,
  DownloadIcon,
  CreditCardIcon,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { MethodBadge, StatusBadge, Amount } from "@/components/finance-badges"
import { ReceiptPreviewDialog } from "@/components/transactions/receipt-preview-dialog"
import { useClientsStore } from "@/lib/clients-store"
import { useClubSettings } from "@/lib/club-settings"
import { useTranslation } from "@/lib/i18n/context"
import {
  ASSIGNABLE_CATEGORIES,
  formatDate,
  formatEuro,
  type Category,
  type Transaction,
} from "@/lib/mock-data"
import { useTransactionsStore } from "@/lib/transactions-store"

export function TransactionDetailView() {
  const { t } = useTranslation()
  const searchParams = useSearchParams()
  const id = searchParams.get("id") ?? ""
  const {
    getTransaction,
    loaded,
    categorize: categorizeInStore,
    updateMember: updateMemberInStore,
  } = useTransactionsStore()
  const { clients } = useClientsStore()
  const tx = getTransaction(id)
  const [previewOpen, setPreviewOpen] = useState(false)

  if (!loaded) return null
  if (!tx) {
    return (
      <p className="text-sm text-muted-foreground">
        {t.transactions.noResults}
      </p>
    )
  }

  const signed = tx.type === "entree" ? tx.amount : -tx.amount

  // tx.amount reflète déjà le montant restant après un éventuel remboursement (voir
  // stripe-sync.js) : le montant brut d'origine et le montant remboursé se lisent dans le
  // payload Stripe brut, seule source qui garde la trace de la charge avant remboursement.
  const stripeRaw = tx.stripe?.raw as { amount?: number; amount_refunded?: number } | undefined
  const originalGrossAmount = stripeRaw?.amount != null ? stripeRaw.amount / 100 : tx.amount
  const refundedAmount = stripeRaw?.amount_refunded ? stripeRaw.amount_refunded / 100 : 0

  const txId = tx.id

  function openReceiptPreview() {
    setPreviewOpen(true)
  }

  function changeCategory(targetCategory: Category) {
    categorizeInStore(txId, targetCategory)
    toast.success(t.transactions.categoryChanged, {
      description: t.categories[targetCategory],
    })
  }

  const categoryItems = ASSIGNABLE_CATEGORIES.map((c) => ({
    value: c,
    label: t.categories[c],
  }))

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit -ml-2 text-muted-foreground"
        nativeButton={false}
        render={<Link href="/transactions" />}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        {t.transactionDetail.back}
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {tx.id}
            </span>
            <StatusBadge status={tx.status} />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {tx.description}
          </h2>
        </div>
        <Amount value={signed} className="text-3xl" />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t.transactionDetail.metadata}
            </CardTitle>
            <CardDescription>
              {t.transactionDetail.metadataSubtitle}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-0">
            <MetaRow icon={CalendarIcon} label={t.transactionDetail.date}>
              {formatDate(tx.date, true)}
            </MetaRow>
            <Separator />
            <MetaRow
              icon={tx.type === "entree" ? ArrowDownLeftIcon : ArrowUpRightIcon}
              label={t.transactionDetail.direction}
            >
              {tx.type === "entree"
                ? t.transactionDetail.directionIn
                : t.transactionDetail.directionOut}
            </MetaRow>
            <Separator />
            <MetaRow icon={CreditCardIcon} label={t.transactionDetail.exactAmount}>
              <span className="font-mono tabular-nums">
                {formatEuro(tx.amount)}
              </span>
            </MetaRow>
            <Separator />
            <MetaRow icon={TagIcon} label={t.transactionDetail.category}>
              {tx.status === "a_categoriser" ? (
                <Badge
                  variant="outline"
                  className="border-warning/40 bg-warning/15 text-[oklch(0.45_0.12_55)] dark:text-[oklch(0.82_0.14_65)]"
                >
                  {t.statuses.a_categoriser}
                </Badge>
              ) : (
                <Select
                  items={categoryItems}
                  value={tx.category}
                  onValueChange={(v) => changeCategory(v as Category)}
                >
                  <SelectTrigger size="sm" className="h-7 border-transparent bg-transparent pr-1.5 pl-2 font-medium hover:border-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {categoryItems.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </MetaRow>
            <Separator />
            <MetaRow icon={CreditCardIcon} label={t.transactionDetail.method}>
              <MethodBadge method={tx.method} />
            </MetaRow>
            <Separator />
            <MetaRow icon={UserIcon} label={t.transactionDetail.linkedMember}>
              <Input
                key={tx.id}
                list="linked-member-suggestions"
                defaultValue={tx.member ?? ""}
                placeholder={t.transactionDetail.none}
                className="h-7 w-44 border-transparent bg-transparent px-2 text-right text-sm font-medium hover:border-input"
                onBlur={(e) => {
                  const value = e.target.value.trim()
                  if (value !== (tx.member ?? "")) {
                    updateMemberInStore(txId, value || null)
                  }
                }}
              />
              <datalist id="linked-member-suggestions">
                {clients.map((c) => (
                  <option key={c.id} value={`${c.firstName} ${c.lastName}`.trim()} />
                ))}
              </datalist>
            </MetaRow>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-base">
              {t.transactionDetail.receipt}
            </CardTitle>
            <CardDescription>
              {tx.justificatif ? tx.justificatif.name : t.transactionDetail.receiptPreviewHint}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4">
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed bg-muted/40 p-6">
              <ReceiptPreview tx={tx} />
            </div>
            <Button variant="outline" className="w-full" onClick={openReceiptPreview}>
              <DownloadIcon data-icon="inline-start" />
              {t.transactionDetail.downloadReceipt}
            </Button>
          </CardContent>
        </Card>
      </div>

      {tx.stripe ? (
        <Card>
          <CardContent className="pt-6">
            <Accordion defaultValue={["stripe"]}>
              <AccordionItem value="stripe" className="border-0">
                <AccordionTrigger className="hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-md bg-[oklch(0.55_0.13_265)]/12 text-[oklch(0.5_0.15_265)] dark:text-[oklch(0.75_0.12_265)]">
                      <CreditCardIcon className="size-4" />
                    </span>
                    {t.transactionDetail.stripeDetails}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="flex flex-col gap-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <StripeStat label={t.transactionDetail.grossAmount}>
                      {formatEuro(originalGrossAmount)}
                    </StripeStat>
                    <StripeStat label={t.transactionDetail.stripeFee}>
                      <span className="text-destructive">
                        − {formatEuro(tx.stripe.fee)}
                      </span>
                    </StripeStat>
                    {refundedAmount > 0 ? (
                      <StripeStat label={t.transactionDetail.refundedAmount}>
                        <span className="text-[oklch(0.5_0.15_265)] dark:text-[oklch(0.75_0.12_265)]">
                          − {formatEuro(refundedAmount)}
                        </span>
                      </StripeStat>
                    ) : null}
                    <StripeStat label={t.transactionDetail.netAmount}>
                      <span className="text-success dark:text-[oklch(0.74_0.14_155)]">
                        {formatEuro(tx.stripe.net)}
                      </span>
                    </StripeStat>
                  </div>

                  <dl className="flex flex-col gap-2 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-muted-foreground">PaymentIntent</dt>
                      <dd className="font-mono text-xs">
                        {tx.stripe.paymentIntentId}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-muted-foreground">Charge</dt>
                      <dd className="font-mono text-xs">
                        {tx.stripe.chargeId}
                      </dd>
                    </div>
                  </dl>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t.transactionDetail.rawPayload}
                    </span>
                    <pre className="max-h-72 overflow-auto rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed">
                      {JSON.stringify(tx.stripe.raw, null, 2)}
                    </pre>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      ) : null}

      <ReceiptPreviewDialog transactionId={previewOpen ? tx.id : null} onOpenChange={setPreviewOpen} />
    </div>
  )
}

function MetaRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </span>
      <span className="text-right text-sm font-medium">{children}</span>
    </div>
  )
}

function StripeStat({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-lg font-semibold tabular-nums">
        {children}
      </span>
    </div>
  )
}

function ReceiptPreview({ tx }: { tx: Transaction }) {
  const { t } = useTranslation()
  const isImage = tx.justificatif?.type === "image"
  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            className="group/preview flex w-full max-w-xs flex-col gap-3 rounded-md border bg-card p-4 text-left shadow-sm transition-colors hover:border-ring"
          />
        }
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {isImage ? (
              <ImageIcon className="size-3.5" />
            ) : (
              <FileTextIcon className="size-3.5" />
            )}
            {isImage ? t.transactionDetail.imageLabel : t.transactionDetail.pdfLabel}
          </span>
          <Badge variant="secondary" className="text-[10px]">
            {t.transactionDetail.receipt}
          </Badge>
        </div>
        <ReceiptDocument tx={tx} />
        <span className="text-center text-xs text-muted-foreground opacity-0 transition-opacity group-hover/preview:opacity-100">
          {t.transactionDetail.clickToEnlarge}
        </span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tx.justificatif?.name}</DialogTitle>
          <DialogDescription>
            {t.transactionDetail.previewDescriptionPrefix} {tx.id}.
          </DialogDescription>
        </DialogHeader>
        <ReceiptDocument tx={tx} large />
      </DialogContent>
    </Dialog>
  )
}

function ReceiptDocument({
  tx,
  large = false,
}: {
  tx: Transaction
  large?: boolean
}) {
  const { settings } = useClubSettings()
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-md border bg-background p-4 font-mono",
        large ? "text-sm" : "text-[11px]",
      )}
    >
      <div className="flex flex-col items-center gap-0.5 border-b border-dashed pb-3 text-center">
        <span className="font-semibold">{settings.name}</span>
        <span className="text-muted-foreground">{t.transactionDetail.receiptDocTitle}</span>
      </div>
      <dl className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">{t.transactionDetail.date}</dt>
          <dd>{formatDate(tx.date, true)}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">{t.transactionDetail.reference}</dt>
          <dd>{tx.id}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">{t.transactionDetail.reason}</dt>
          <dd className="max-w-40 truncate text-right">{tx.description}</dd>
        </div>
        {tx.member ? (
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">{t.transactionDetail.linkedMember}</dt>
            <dd>{tx.member}</dd>
          </div>
        ) : null}
      </dl>
      <Separator />
      <div className="flex items-center justify-between font-semibold">
        <span>{t.common.total}</span>
        <span className="tabular-nums">{formatEuro(tx.amount)}</span>
      </div>
    </div>
  )
}
