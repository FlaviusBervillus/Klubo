"use client"

import { useEffect, useState } from "react"
import { CalendarRangeIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useSeasons, type Season } from "@/lib/seasons-store"
import { useTranslation } from "@/lib/i18n/context"

function SeasonFormDialog({
  season,
  open,
  onOpenChange,
}: {
  season: Season | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const { createSeason, updateSeason, deleteSeason } = useSeasons()
  const isEdit = !!season
  const [label, setLabel] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    if (open) {
      setLabel(season?.label ?? "")
      setStartDate(season?.startDate ?? "")
      setEndDate(season?.endDate ?? "")
      setConfirmingDelete(false)
    }
  }, [open, season])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isEdit && season) {
      await updateSeason(season.id, { label, startDate, endDate })
      toast.success(t.seasons.updated)
    } else {
      await createSeason({ label, startDate, endDate })
      toast.success(t.seasons.created)
    }
    onOpenChange(false)
  }

  async function handleDelete() {
    if (!season) return
    await deleteSeason(season.id)
    toast.success(t.seasons.deleted)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? t.seasons.editTitle : t.seasons.newTitle}</DialogTitle>
            <DialogDescription>{isEdit ? t.seasons.editSubtitle : t.seasons.newSubtitle}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="season-label">{t.seasons.label}</FieldLabel>
              <Input
                id="season-label"
                required
                placeholder="2026-2027"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="season-start">{t.seasons.start}</FieldLabel>
                <Input
                  id="season-start"
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="season-end">{t.seasons.end}</FieldLabel>
                <Input
                  id="season-end"
                  type="date"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </Field>
            </div>
          </FieldGroup>

          {isEdit ? (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              {confirmingDelete ? (
                <>
                  <span className="text-xs text-destructive">{t.seasons.deleteConfirm}</span>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
                      {t.common.cancel}
                    </Button>
                    <Button type="button" variant="destructive" size="sm" onClick={handleDelete}>
                      {t.seasons.delete}
                    </Button>
                  </div>
                </>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2Icon data-icon="inline-start" />
                  {t.seasons.delete}
                </Button>
              )}
            </div>
          ) : null}

          <DialogFooter>
            <DialogClose render={<Button variant="outline">{t.common.cancel}</Button>} />
            <Button type="submit">{t.common.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function SeasonSwitcher() {
  const { t } = useTranslation()
  const { seasons, activeSeasonId, activeSeason, setActiveSeasonId } = useSeasons()
  const [dialogState, setDialogState] = useState<{ open: boolean; season: Season | null }>({
    open: false,
    season: null,
  })

  const items = seasons.map((s) => ({ value: s.id, label: s.label }))

  return (
    <div className="flex items-center gap-1 px-2 pb-2">
      <CalendarRangeIcon className="size-4 shrink-0 text-sidebar-foreground/60" />
      <Select
        items={items}
        value={activeSeasonId ?? ""}
        onValueChange={(v) => v && setActiveSeasonId(v)}
      >
        <SelectTrigger size="sm" className="h-7 flex-1 text-xs">
          <SelectValue placeholder={t.seasons.none} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((it) => (
              <SelectItem key={it.value} value={it.value}>
                {it.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      {activeSeason ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t.seasons.edit}
          onClick={() => setDialogState({ open: true, season: activeSeason })}
        >
          <PencilIcon />
        </Button>
      ) : null}

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t.seasons.new}
        onClick={() => setDialogState({ open: true, season: null })}
      >
        <PlusIcon />
      </Button>

      <SeasonFormDialog
        season={dialogState.season}
        open={dialogState.open}
        onOpenChange={(open) => setDialogState((s) => ({ ...s, open }))}
      />
    </div>
  )
}
