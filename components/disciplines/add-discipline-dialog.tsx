"use client"

import { useEffect, useState } from "react"
import { PencilIcon, PlusIcon } from "lucide-react"
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
import { useDisciplinesStore, type Discipline, type NewDiscipline } from "@/lib/disciplines-store"
import { useTranslation } from "@/lib/i18n/context"

const emptyForm: NewDiscipline = { label: "", price: 0 }

function formFromDiscipline(d: Discipline): NewDiscipline {
  return { label: d.label, price: d.price }
}

export function AddDisciplineDialog({ discipline }: { discipline?: Discipline } = {}) {
  const { t } = useTranslation()
  const { disciplines, addDiscipline, updateDiscipline, available } = useDisciplinesStore()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<NewDiscipline>(discipline ? formFromDiscipline(discipline) : emptyForm)
  const isEdit = !!discipline

  useEffect(() => {
    if (open) setForm(discipline ? formFromDiscipline(discipline) : emptyForm)
  }, [open, discipline])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!available) {
      toast.error(t.settings.electronOnlyFeature)
      return
    }
    const normalizedLabel = form.label.trim().toLowerCase()
    const duplicate = disciplines.some(
      (d) => d.id !== discipline?.id && d.label.trim().toLowerCase() === normalizedLabel,
    )
    if (duplicate) {
      toast.error(t.disciplines.duplicateLabel)
      return
    }
    if (isEdit) {
      await updateDiscipline(discipline.id, form)
    } else {
      const result = await addDiscipline(form)
      if (!result.ok) {
        toast.error(result.error || t.disciplines.duplicateLabel)
        return
      }
      setForm(emptyForm)
    }
    setOpen(false)
    toast.success(t.disciplines.disciplineSaved)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          isEdit ? (
            <Button variant="ghost" size="icon-sm" aria-label={t.common.edit}>
              <PencilIcon />
            </Button>
          ) : (
            <Button>
              <PlusIcon data-icon="inline-start" />
              {t.disciplines.addDiscipline}
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? t.disciplines.editDisciplineTitle : t.disciplines.addDisciplineTitle}</DialogTitle>
            <DialogDescription>{t.disciplines.addDisciplineDescription}</DialogDescription>
          </DialogHeader>

          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="discipline-label">{t.disciplines.colLabel}</FieldLabel>
              <Input
                id="discipline-label"
                required
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder={t.disciplines.labelPlaceholder}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="discipline-price">{t.disciplines.colPrice}</FieldLabel>
              <Input
                id="discipline-price"
                type="number"
                step="0.01"
                min="0"
                required
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
              />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button variant="outline">{t.common.cancel}</Button>} />
            <Button type="submit">{t.common.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
