"use client"

import { useMemo, useState } from "react"
import { CreditCardIcon, SearchIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty } from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AddPayerDialog } from "@/components/payeurs/add-payer-dialog"
import { useClientsStore } from "@/lib/clients-store"
import { usePayersStore } from "@/lib/payers-store"
import { useTranslation } from "@/lib/i18n/context"

export function PayersTable() {
  const { t } = useTranslation()
  const { payers, deletePayer } = usePayersStore()
  const { clients } = useClientsStore()
  const [query, setQuery] = useState("")

  const linkedClientsByPayer = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const c of clients) {
      if (!c.payerId) continue
      const names = map.get(c.payerId) ?? []
      names.push(`${c.firstName} ${c.lastName}`.trim())
      map.set(c.payerId, names)
    }
    return map
  }, [clients])

  const filtered = useMemo(() => {
    if (!query) return payers
    const q = query.toLowerCase()
    return payers.filter((p) => `${p.firstName} ${p.lastName} ${p.email}`.toLowerCase().includes(q))
  }, [payers, query])

  const linkedCount = payers.filter((p) => (linkedClientsByPayer.get(p.id)?.length ?? 0) > 0).length
  const unlinkedCount = payers.length - linkedCount

  async function handleDelete(id: string) {
    const linked = linkedClientsByPayer.get(id)
    if (linked && linked.length > 0) {
      toast.error(t.payers.deleteBlockedLinked.replace("{names}", linked.join(", ")))
      return
    }
    await deletePayer(id)
    toast.success(t.payers.payerDeleted)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>{t.payers.totalPayers}</CardDescription>
            <CardTitle className="font-mono text-2xl tabular-nums">{payers.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t.payers.linkedPayers}</CardDescription>
            <CardTitle className="font-mono text-2xl tabular-nums">{linkedCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t.payers.unlinkedPayers}</CardDescription>
            <CardTitle className="font-mono text-2xl tabular-nums text-muted-foreground">
              {unlinkedCount}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <InputGroup className="lg:max-w-xs">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          placeholder={t.payers.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </InputGroup>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>{t.clients.colFirstName}</TableHead>
              <TableHead>{t.clients.colLastName}</TableHead>
              <TableHead>{t.clients.colEmail}</TableHead>
              <TableHead>{t.clients.colPhone}</TableHead>
              <TableHead>{t.payers.colLinkedAdherents}</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((payer) => {
              const linked = linkedClientsByPayer.get(payer.id) ?? []
              return (
                <TableRow key={payer.id}>
                  <TableCell className="font-medium">{payer.firstName}</TableCell>
                  <TableCell className="font-medium">{payer.lastName}</TableCell>
                  <TableCell className="text-muted-foreground">{payer.email || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{payer.phone || "—"}</TableCell>
                  <TableCell>
                    {linked.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {linked.map((name) => (
                          <Badge key={name} variant="outline" className="font-normal">
                            {name}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t.payers.noLinkedAdherent}</span>
                    )}
                    {payer.stripeCustomerId ? (
                      <Badge variant="outline" className="ml-1 gap-1 font-normal text-muted-foreground">
                        <CreditCardIcon className="size-3" />
                        Stripe
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <AddPayerDialog payer={payer} />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t.payers.payerDeleted}
                        onClick={() => handleDelete(payer.id)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        {filtered.length === 0 ? (
          <Empty className="border-0">
            <p className="text-sm text-muted-foreground">{t.payers.noPayers}</p>
          </Empty>
        ) : null}
      </div>
    </div>
  )
}
