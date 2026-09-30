"use client"

import { useEffect, useMemo, useState } from "react"
import { RotateCcwIcon, UserPlusIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Switch } from "@/components/ui/switch"
import { useClientsStore } from "@/lib/clients-store"
import { useTranslation } from "@/lib/i18n/context"
import type { CourseType } from "@/lib/mock-data"
import { useSeasonClients, useSeasons } from "@/lib/seasons-store"

function ResetSeasonClientsDialog() {
  const { t } = useTranslation()
  const { resetActiveSeasonClients } = useSeasonClients()
  const { activeSeason } = useSeasons()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleConfirm() {
    setBusy(true)
    await resetActiveSeasonClients()
    setBusy(false)
    setOpen(false)
    toast.success(t.clients.seasonResetSuccess)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <RotateCcwIcon data-icon="inline-start" />
            {t.clients.seasonResetButton}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.clients.seasonResetConfirmTitle}</DialogTitle>
          <DialogDescription>
            {t.clients.seasonResetConfirmDescription.replace("{season}", activeSeason?.label ?? "")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">{t.common.cancel}</Button>} />
          <Button variant="destructive" onClick={handleConfirm} disabled={busy}>
            {t.clients.seasonResetButton}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BringForwardDialog() {
  const { t } = useTranslation()
  const { clients: allClients } = useClientsStore()
  const { seasons, activeSeasonId } = useSeasons()
  const { clients: activeRoster, getOtherSeasonRoster, bringClientForward } = useSeasonClients()
  const [open, setOpen] = useState(false)
  const [sourceSeasonId, setSourceSeasonId] = useState("")
  const [roster, setRoster] = useState<Record<string, { status: string; paid: boolean }>>({})
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)

  const otherSeasons = useMemo(
    () => seasons.filter((s) => s.id !== activeSeasonId),
    [seasons, activeSeasonId],
  )

  useEffect(() => {
    if (!open) return
    setSourceSeasonId(otherSeasons[0]?.id ?? "")
    setSelected({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!sourceSeasonId) {
      setRoster({})
      return
    }
    getOtherSeasonRoster(sourceSeasonId).then(setRoster)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceSeasonId])

  const activeIds = useMemo(() => new Set(activeRoster.map((c) => c.id)), [activeRoster])
  const candidates = useMemo(
    () =>
      Object.keys(roster)
        .filter((id) => !activeIds.has(id))
        .map((id) => {
          const client = allClients.find((c) => c.id === id)
          return client ? { ...client, seasonStatus: roster[id].status } : null
        })
        .filter((c): c is NonNullable<typeof c> => !!c),
    [roster, activeIds, allClients],
  )

  async function handleConfirm() {
    setBusy(true)
    const ids = Object.entries(selected)
      .filter(([, checked]) => checked)
      .map(([id]) => id)
    for (const id of ids) {
      const candidate = candidates.find((c) => c.id === id)
      if (candidate) await bringClientForward(id, candidate.seasonStatus as CourseType)
    }
    setBusy(false)
    setOpen(false)
    toast.success(t.clients.bringForwardSuccess.replace("{count}", String(ids.length)))
  }

  const selectedCount = Object.values(selected).filter(Boolean).length

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <UserPlusIcon data-icon="inline-start" />
            {t.clients.bringForwardButton}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.clients.bringForwardTitle}</DialogTitle>
          <DialogDescription>{t.clients.bringForwardDescription}</DialogDescription>
        </DialogHeader>

        {otherSeasons.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.clients.bringForwardNoSeason}</p>
        ) : (
          <div className="flex flex-col gap-4">
            <Select value={sourceSeasonId} onValueChange={(v) => v && setSourceSeasonId(v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {otherSeasons.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            {candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.clients.bringForwardEmpty}</p>
            ) : (
              <ul className="flex max-h-72 flex-col gap-1 overflow-auto">
                {candidates.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                  >
                    <span className="flex flex-col">
                      <span className="font-medium">{`${c.firstName} ${c.lastName}`.trim()}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.courseTypes[c.seasonStatus as CourseType] ?? c.seasonStatus}
                      </span>
                    </span>
                    <Switch
                      size="sm"
                      checked={!!selected[c.id]}
                      onCheckedChange={(checked) => setSelected((s) => ({ ...s, [c.id]: checked }))}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="outline">{t.common.cancel}</Button>} />
          <Button onClick={handleConfirm} disabled={busy || selectedCount === 0}>
            {`${t.clients.bringForwardConfirm} (${selectedCount})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function SeasonRosterTools() {
  const { hasActiveSeason } = useSeasonClients()
  if (!hasActiveSeason) return null
  return (
    <>
      <BringForwardDialog />
      <ResetSeasonClientsDialog />
    </>
  )
}
