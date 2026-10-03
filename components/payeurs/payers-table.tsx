"use client"

import { useMemo, useState } from "react"
import { CreditCardIcon, SearchIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { useSeasonClients, useSeasons } from "@/lib/seasons-store"
import { useTranslation } from "@/lib/i18n/context"

/** Regroupe par payeur les noms des adhérents d'une liste de clients donnée (saison active ou
 * toutes saisons confondues selon la liste passée). */
function groupLinkedNames(clients: { payerId: string | null; firstName: string; lastName: string }[]) {
  const map = new Map<string, string[]>()
  for (const c of clients) {
    if (!c.payerId) continue
    const names = map.get(c.payerId) ?? []
    names.push(`${c.firstName} ${c.lastName}`.trim())
    map.set(c.payerId, names)
  }
  return map
}

export function PayersTable() {
  const { t } = useTranslation()
  const { payers, deletePayer, deletePayerCascade } = usePayersStore()
  const { clients: allClients, refresh: refreshClients } = useClientsStore()
  const { clients: seasonClients } = useSeasonClients()
  const { activeSeason } = useSeasons()
  const [query, setQuery] = useState("")
  const [cascadeTarget, setCascadeTarget] = useState<{ id: string; names: string[] } | null>(null)
  const [cascadeBusy, setCascadeBusy] = useState(false)

  // L'affichage (badges, compteurs) suit la saison active — un adhérent inscrit une autre année
  // ne doit pas faire paraître son payeur "lié" quand on regarde une saison où il n'est pas. La
  // suppression, elle, doit rester fiable quelle que soit la saison consultée : elle se base
  // toujours sur TOUS les adhérents liés, saison active ou non.
  const linkedClientsThisSeason = useMemo(() => groupLinkedNames(seasonClients), [seasonClients])
  const linkedClientsAllTime = useMemo(() => groupLinkedNames(allClients), [allClients])

  const filtered = useMemo(() => {
    if (!query) return payers
    const q = query.toLowerCase()
    return payers.filter((p) => `${p.firstName} ${p.lastName} ${p.email}`.toLowerCase().includes(q))
  }, [payers, query])

  const linkedCount = payers.filter((p) => (linkedClientsThisSeason.get(p.id)?.length ?? 0) > 0).length
  const unlinkedCount = payers.length - linkedCount

  async function handleDelete(id: string) {
    const linked = linkedClientsAllTime.get(id)
    if (linked && linked.length > 0) {
      setCascadeTarget({ id, names: linked })
      return
    }
    await deletePayer(id)
    toast.success(t.payers.payerDeleted)
  }

  async function handleCascadeConfirm() {
    if (!cascadeTarget) return
    setCascadeBusy(true)
    const result = await deletePayerCascade(cascadeTarget.id)
    await refreshClients()
    setCascadeBusy(false)
    setCascadeTarget(null)
    if (result.ok) {
      toast.success(t.payers.payerCascadeDeleted.replace("{count}", String(result.deletedClients)))
    } else {
      toast.error(t.payers.importErrorTitle)
    }
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
            <CardDescription>
              {activeSeason
                ? t.payers.linkedPayersSeason.replace("{season}", activeSeason.label)
                : t.payers.linkedPayers}
            </CardDescription>
            <CardTitle className="font-mono text-2xl tabular-nums">{linkedCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>
              {activeSeason
                ? t.payers.unlinkedPayersSeason.replace("{season}", activeSeason.label)
                : t.payers.unlinkedPayers}
            </CardDescription>
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
              const linkedThisSeason = linkedClientsThisSeason.get(payer.id) ?? []
              const linkedAllTime = linkedClientsAllTime.get(payer.id) ?? []
              const otherSeasonsCount = linkedAllTime.length - linkedThisSeason.length
              return (
                <TableRow key={payer.id}>
                  <TableCell className="font-medium">{payer.firstName}</TableCell>
                  <TableCell className="font-medium">{payer.lastName}</TableCell>
                  <TableCell className="text-muted-foreground">{payer.email || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{payer.phone || "—"}</TableCell>
                  <TableCell>
                    {linkedThisSeason.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1">
                        {linkedThisSeason.map((name) => (
                          <Badge key={name} variant="outline" className="font-normal">
                            {name}
                          </Badge>
                        ))}
                        {otherSeasonsCount > 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {t.payers.otherSeasonsCount.replace("{count}", String(otherSeasonsCount))}
                          </span>
                        ) : null}
                      </div>
                    ) : otherSeasonsCount > 0 ? (
                      <span className="text-xs text-muted-foreground">
                        {t.payers.otherSeasonsOnly.replace("{count}", String(otherSeasonsCount))}
                      </span>
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

      <Dialog open={!!cascadeTarget} onOpenChange={(open) => !open && setCascadeTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t.payers.cascadeDeleteTitle}</DialogTitle>
            <DialogDescription>
              {t.payers.cascadeDeleteDescription.replace(
                "{names}",
                cascadeTarget?.names.join(", ") ?? "",
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">{t.common.cancel}</Button>} />
            <Button variant="destructive" onClick={handleCascadeConfirm} disabled={cascadeBusy}>
              {t.payers.cascadeDeleteConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
