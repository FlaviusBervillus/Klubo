"use client"

import { useState } from "react"
import { CalendarRangeIcon, PlusIcon } from "lucide-react"
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
import { useSeasons } from "@/lib/seasons-store"
import { useTranslation } from "@/lib/i18n/context"

export function SeasonSwitcher() {
  const { t } = useTranslation()
  const { seasons, activeSeasonId, setActiveSeasonId, createSeason } = useSeasons()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const items = seasons.map((s) => ({ value: s.id, label: s.label }))

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    await createSeason({ label, startDate, endDate })
    setLabel("")
    setStartDate("")
    setEndDate("")
    setOpen(false)
    toast.success(t.seasons.created)
  }

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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label={t.seasons.new}>
              <PlusIcon />
            </Button>
          }
        />
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>{t.seasons.newTitle}</DialogTitle>
              <DialogDescription>{t.seasons.newSubtitle}</DialogDescription>
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
            <DialogFooter>
              <DialogClose render={<Button variant="outline">{t.common.cancel}</Button>} />
              <Button type="submit">{t.common.save}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
