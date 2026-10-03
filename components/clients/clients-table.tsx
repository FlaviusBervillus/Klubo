"use client"

import { useMemo, useState } from "react"
import { CircleAlertIcon, SearchIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { Empty } from "@/components/ui/empty"
import { MethodBadge } from "@/components/finance-badges"
import { AddClientDialog } from "@/components/clients/add-client-dialog"
import { findClientPayments, payerFullName } from "@/lib/client-payments"
import { useDisciplinesStore } from "@/lib/disciplines-store"
import { formatDate, formatEuro, type CourseType } from "@/lib/mock-data"
import { usePayersStore } from "@/lib/payers-store"
import { useSeasonClients, useSeasonTransactions } from "@/lib/seasons-store"
import { useTranslation } from "@/lib/i18n/context"

// Un dégradé fixe de couleurs appliqué dans l'ordre aux disciplines (qui sont désormais une liste
// libre, pas une énumération fixe) ; "Non catégorisé" garde son style neutre dédié.
const STATUS_COLOR_CYCLE = [
  "border-transparent bg-[oklch(0.55_0.13_265)]/12 text-[oklch(0.5_0.15_265)] dark:text-[oklch(0.75_0.12_265)]",
  "border-transparent bg-[oklch(0.6_0.1_200)]/14 text-[oklch(0.48_0.11_200)] dark:text-[oklch(0.72_0.1_200)]",
  "border-transparent bg-success/12 text-success dark:text-[oklch(0.72_0.14_155)]",
  "border-transparent bg-warning/15 text-[oklch(0.5_0.12_60)] dark:text-[oklch(0.8_0.13_65)]",
  "border-transparent bg-muted text-muted-foreground",
  "border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20",
]
const UNCATEGORIZED_STYLE = "border-dashed bg-transparent text-muted-foreground"

export function ClientsTable() {
  const { t } = useTranslation()
  const { clients, setClientSeasonInfo } = useSeasonClients()
  const seasonTransactions = useSeasonTransactions()
  const { disciplines } = useDisciplinesStore()
  const { payers } = usePayersStore()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("all")
  const [paymentStatus, setPaymentStatus] = useState("all")

  function statusStyle(course: CourseType) {
    if (course === "Non catégorisé") return UNCATEGORIZED_STYLE
    const index = disciplines.findIndex((d) => d.label === course)
    return STATUS_COLOR_CYCLE[(index < 0 ? 0 : index) % STATUS_COLOR_CYCLE.length]
  }

  const statusItems = [
    { value: "all", label: t.clients.allStatuses },
    ...disciplines.map((d) => ({ value: d.label, label: d.label })),
  ]

  const paymentStatusItems = [
    { value: "all", label: t.clients.allPaymentStatuses },
    { value: "paid", label: t.clients.paid },
    { value: "unpaid", label: t.clients.unpaid },
  ]

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (query) {
        const q = query.toLowerCase()
        const hay = `${c.firstName} ${c.lastName} ${c.email}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (status !== "all" && c.status !== status) return false
      if (paymentStatus !== "all" && (paymentStatus === "paid") !== c.paid) {
        return false
      }
      return true
    })
  }, [clients, query, status, paymentStatus])

  const hasFilters =
    query !== "" || status !== "all" || paymentStatus !== "all"

  function reset() {
    setQuery("")
    setStatus("all")
    setPaymentStatus("all")
  }

  const payersById = useMemo(() => new Map(payers.map((p) => [p.id, p])), [payers])

  async function setPaid(clientId: string, clientStatus: CourseType, paid: boolean) {
    await setClientSeasonInfo(clientId, { status: clientStatus, paid })
    toast.success(paid ? t.clients.markedPaid : t.clients.markedUnpaid)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <InputGroup className="lg:max-w-xs">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            placeholder={t.clients.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </InputGroup>

        <div className="flex flex-wrap gap-2">
          <Select items={statusItems} value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-auto min-w-40" size="sm">
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

          <Select
            items={paymentStatusItems}
            value={paymentStatus}
            onValueChange={setPaymentStatus}
          >
            <SelectTrigger className="w-auto min-w-36" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {paymentStatusItems.map((s) => (
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

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>{t.clients.colFirstName}</TableHead>
              <TableHead>{t.clients.colLastName}</TableHead>
              <TableHead>{t.clients.colEmail}</TableHead>
              <TableHead>{t.clients.colStatus}</TableHead>
              <TableHead>{t.clients.colPayment}</TableHead>
              <TableHead>{t.clients.colPaymentStatus}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => {
              const payer = c.payerId ? payersById.get(c.payerId) ?? null : null
              const matches = findClientPayments(c, payer, seasonTransactions)
              const hasUnseenEvidence = !c.paid && matches.length > 0

              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.firstName}</TableCell>
                  <TableCell className="font-medium">{c.lastName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.email}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`font-medium ${statusStyle(c.status)}`}
                    >
                      {t.courseTypes[c.status] ?? c.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <MethodBadge method={c.method} />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <button type="button" className="inline-flex items-center gap-1">
                            {c.paid ? (
                              <Badge
                                variant="outline"
                                className="border-transparent bg-success/12 font-medium text-success dark:text-[oklch(0.72_0.14_155)]"
                              >
                                {t.clients.paid}
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-transparent bg-destructive/10 font-medium text-destructive dark:bg-destructive/20"
                              >
                                {t.clients.unpaid}
                              </Badge>
                            )}
                            {hasUnseenEvidence ? (
                              <CircleAlertIcon className="size-3.5 text-[oklch(0.55_0.15_60)] dark:text-[oklch(0.8_0.14_65)]" />
                            ) : null}
                          </button>
                        }
                      />
                      <DropdownMenuContent align="start" className="w-72">
                        <DropdownMenuLabel>{t.clients.paymentEvidenceTitle}</DropdownMenuLabel>
                        {matches.length === 0 ? (
                          <p className="px-1.5 py-2 text-xs text-muted-foreground">
                            {t.clients.paymentEvidenceEmpty}
                          </p>
                        ) : (
                          matches.map((m) => (
                            <div key={m.transaction.id} className="flex flex-col px-1.5 py-1 text-xs">
                              <span className="font-medium text-foreground">
                                {formatEuro(m.transaction.amount)} · {formatDate(m.transaction.date)}
                              </span>
                              <span className="text-muted-foreground">
                                {m.via === "payer" && payer
                                  ? t.clients.paymentEvidenceViaGuardian.replace(
                                      "{name}",
                                      payerFullName(payer),
                                    )
                                  : m.transaction.description}
                              </span>
                            </div>
                          ))
                        )}
                        <DropdownMenuSeparator />
                        {c.paid ? (
                          <DropdownMenuItem onClick={() => setPaid(c.id, c.status, false)}>
                            {t.clients.markUnpaid}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => setPaid(c.id, c.status, true)}>
                            {t.clients.markPaid}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                  <TableCell>
                    <AddClientDialog client={c} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        {filtered.length === 0 ? (
          <Empty className="border-0">
            <p className="text-sm text-muted-foreground">
              {t.clients.noResults}
            </p>
            <Button variant="outline" size="sm" onClick={reset} className="mt-3">
              {t.common.reset}
            </Button>
          </Empty>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} {t.clients.resultsCount} {clients.length}
      </p>
    </div>
  )
}
