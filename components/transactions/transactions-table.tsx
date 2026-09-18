"use client"

import { useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  SearchIcon,
  MoreHorizontalIcon,
  EyeIcon,
  SparklesIcon,
  ZapIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty } from "@/components/ui/empty"
import { MethodBadge, StatusBadge, Amount } from "@/components/finance-badges"
import { ReceiptPreviewDialog } from "@/components/transactions/receipt-preview-dialog"
import { useTranslation } from "@/lib/i18n/context"
import { ASSIGNABLE_CATEGORIES, formatDate, formatEuro, type Category } from "@/lib/mock-data"
import { useTransactionsStore } from "@/lib/transactions-store"

export function TransactionsTable() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useTranslation()
  const { transactions: rows, categorize: categorizeInStore } = useTransactionsStore()
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")
  const [method, setMethod] = useState("all")
  const [status, setStatus] = useState(searchParams.get("statut") ?? "all")
  const [period, setPeriod] = useState("all")
  const [previewTxId, setPreviewTxId] = useState<string | null>(null)

  const periods = [
    { value: "all", label: t.transactions.periodAll },
    { value: "30", label: t.transactions.period30 },
    { value: "90", label: t.transactions.period90 },
  ]

  const categoryItems = [
    { value: "all", label: t.transactions.allCategories },
    ...ASSIGNABLE_CATEGORIES.map((c) => ({ value: c, label: t.categories[c] })),
  ]

  const methodItems = [
    { value: "all", label: t.transactions.allMethods },
    ...Object.entries(t.methods).map(([value, label]) => ({ value, label })),
  ]

  const statusItems = [
    { value: "all", label: t.transactions.allStatuses },
    { value: "valide", label: t.statuses.valide },
    { value: "en_attente", label: t.statuses.en_attente },
    { value: "a_categoriser", label: t.statuses.a_categoriser },
    { value: "remboursee", label: t.statuses.remboursee },
    { value: "remboursee_partiellement", label: t.statuses.remboursee_partiellement },
    { value: "echec", label: t.statuses.echec },
  ]

  const filtered = useMemo(() => {
    const now = Date.now()
    return rows.filter((t) => {
      if (query) {
        const q = query.toLowerCase()
        const hay = `${t.description} ${t.member ?? ""} ${t.id}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (category !== "all" && t.category !== category) return false
      if (method !== "all" && t.method !== method) return false
      if (status !== "all" && t.status !== status) return false
      if (period !== "all") {
        const days = Number(period)
        const age = (now - new Date(t.date).getTime()) / 864e5
        if (age > days) return false
      }
      return true
    })
  }, [rows, query, category, method, status, period])

  const summary = useMemo(() => {
    let entrees = 0
    let sorties = 0
    for (const tx of filtered) {
      if (tx.status === "echec") continue
      const value = tx.stripe ? tx.stripe.net : tx.amount
      if (tx.type === "entree") entrees += value
      else sorties += value
    }
    return { entrees, sorties, net: entrees - sorties }
  }, [filtered])

  function categorize(id: string, targetCategory: Category) {
    categorizeInStore(id, targetCategory)
    toast.success("Transaction catégorisée", {
      description: `Classée dans « ${t.categories[targetCategory]} » et validée.`,
    })
  }

  function openReceiptPreview(id: string) {
    if (typeof window === "undefined" || !window.electronAPI) {
      toast.error(t.settings.electronOnlyFeature)
      return
    }
    setPreviewTxId(id)
  }

  const hasFilters =
    query !== "" ||
    category !== "all" ||
    method !== "all" ||
    status !== "all" ||
    period !== "all"

  function reset() {
    setQuery("")
    setCategory("all")
    setMethod("all")
    setStatus("all")
    setPeriod("all")
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <InputGroup className="lg:max-w-xs">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            placeholder={t.transactions.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </InputGroup>

        <div className="flex flex-wrap gap-2">
          <Select items={periods} value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-auto min-w-40" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {periods.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Select items={categoryItems} value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-auto min-w-36" size="sm">
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

          <Select items={methodItems} value={method} onValueChange={setMethod}>
            <SelectTrigger className="w-auto min-w-36" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {methodItems.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Select items={statusItems} value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-auto min-w-32" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {statusItems.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={reset}>
              {t.common.reset}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>{t.transactions.filteredIn}</CardDescription>
            <CardTitle className="font-mono text-2xl tabular-nums text-success dark:text-[oklch(0.74_0.14_155)]">
              {formatEuro(summary.entrees)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t.transactions.filteredOut}</CardDescription>
            <CardTitle className="font-mono text-2xl tabular-nums text-destructive">
              {formatEuro(summary.sorties)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t.transactions.filteredNet}</CardDescription>
            <CardTitle className="font-mono text-2xl tabular-nums">
              {formatEuro(summary.net, { signed: true })}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>{t.transactions.colDate}</TableHead>
              <TableHead>{t.transactions.colDescription}</TableHead>
              <TableHead>{t.transactions.colMethod}</TableHead>
              <TableHead>{t.transactions.colCategory}</TableHead>
              <TableHead className="text-right">
                {t.transactions.colAmount}
              </TableHead>
              <TableHead>{t.transactions.colStatus}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((tx) => (
              <TableRow
                key={tx.id}
                className="cursor-pointer"
                onClick={() => router.push(`/transactions/detail?id=${tx.id}`)}
              >
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDate(tx.date)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{tx.description}</span>
                    {tx.member ? (
                      <span className="text-xs text-muted-foreground">
                        {tx.member}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <MethodBadge method={tx.method} />
                </TableCell>
                <TableCell>
                  {tx.status === "a_categoriser" ? (
                    <Badge
                      variant="outline"
                      className="gap-1 border-warning/40 bg-warning/15 text-[oklch(0.45_0.12_55)] dark:text-[oklch(0.82_0.14_65)]"
                    >
                      <SparklesIcon className="size-3" />
                      {t.statuses.a_categoriser}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {t.categories[tx.category]}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-col items-end gap-0.5">
                    <Amount value={tx.type === "entree" ? tx.amount : -tx.amount} />
                    {tx.stripe ? (
                      <span className="text-[11px] whitespace-nowrap text-muted-foreground">
                        −{formatEuro(tx.stripe.fee)} {t.transactions.feeShort} · {formatEuro(tx.stripe.net)} {t.transactions.netShort}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={tx.status} />
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {tx.status === "a_categoriser" ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button size="sm" className="h-8 gap-1" />}
                      >
                        <ZapIcon data-icon="inline-start" />
                        {t.transactions.classify}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          {ASSIGNABLE_CATEGORIES.map((c) => (
                            <DropdownMenuItem
                              key={c}
                              onClick={() => categorize(tx.id, c)}
                            >
                              {t.categories[c]}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label="Actions"
                          />
                        }
                      >
                        <MoreHorizontalIcon />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuItem
                            onClick={() =>
                              router.push(`/transactions/detail?id=${tx.id}`)
                            }
                          >
                            <EyeIcon />
                            {t.transactions.viewDetail}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openReceiptPreview(tx.id)}>
                            {t.transactions.downloadReceipt}
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {filtered.length === 0 ? (
          <Empty className="border-0">
            <p className="text-sm text-muted-foreground">
              {t.transactions.noResults}
            </p>
            <Button variant="outline" size="sm" onClick={reset} className="mt-3">
              {t.common.reset}
            </Button>
          </Empty>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} {t.transactions.resultsCount} {rows.length}
      </p>

      <ReceiptPreviewDialog
        transactionId={previewTxId}
        onOpenChange={(open) => {
          if (!open) setPreviewTxId(null)
        }}
      />
    </div>
  )
}
