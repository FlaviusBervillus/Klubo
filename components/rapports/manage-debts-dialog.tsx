"use client"

import { useState } from "react"
import { HandCoinsIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useDebtsStore, type NewDebt } from "@/lib/debts-store"
import { useTranslation } from "@/lib/i18n/context"
import { formatEuro } from "@/lib/mock-data"

const emptyForm: NewDebt = {
  label: "",
  amount: 0,
  date: new Date().toISOString().slice(0, 10),
  dueDate: null,
  settled: false,
  notes: "",
}

export function ManageDebtsDialog() {
  const { t } = useTranslation()
  const { debts, addDebt, updateDebt, deleteDebt, available } = useDebtsStore()
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<NewDebt>(emptyForm)

  function startEdit(debt: (typeof debts)[number]) {
    setEditingId(debt.id)
    setForm({
      label: debt.label,
      amount: debt.amount,
      date: debt.date,
      dueDate: debt.dueDate,
      settled: debt.settled,
      notes: debt.notes,
    })
  }

  function resetForm() {
    setEditingId(null)
    setForm(emptyForm)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!available) {
      toast.error(t.settings.electronOnlyFeature)
      return
    }
    if (editingId) {
      await updateDebt(editingId, form)
    } else {
      await addDebt(form)
    }
    resetForm()
    toast.success(t.accounting.debtSaved)
  }

  async function handleDelete(id: string) {
    await deleteDebt(id)
    if (editingId === id) resetForm()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm() }}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <HandCoinsIcon data-icon="inline-start" />
            {t.accounting.manageDebts}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.accounting.manageDebtsTitle}</DialogTitle>
          <DialogDescription>{t.accounting.manageDebtsDescription}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="debt-label">{t.accounting.debtLabel}</FieldLabel>
              <Input
                id="debt-label"
                required
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder={t.accounting.debtLabelPlaceholder}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="debt-amount">{t.accounting.debtAmount}</FieldLabel>
              <Input
                id="debt-amount"
                type="number"
                step="0.01"
                min="0"
                required
                value={form.amount || ""}
                onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="debt-date">{t.accounting.debtDate}</FieldLabel>
              <Input
                id="debt-date"
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="debt-due-date">{t.accounting.debtDueDate}</FieldLabel>
              <Input
                id="debt-due-date"
                type="date"
                value={form.dueDate ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value || null }))}
              />
            </Field>
          </div>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="debt-settled">{t.accounting.debtSettled}</FieldLabel>
            <Switch
              id="debt-settled"
              checked={form.settled}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, settled: checked }))}
            />
          </Field>
          <div className="flex justify-end gap-2">
            {editingId ? (
              <Button type="button" variant="outline" size="sm" onClick={resetForm}>
                {t.common.cancel}
              </Button>
            ) : null}
            <Button type="submit" size="sm">
              <PlusIcon data-icon="inline-start" />
              {editingId ? t.common.save : t.accounting.debtAdd}
            </Button>
          </div>
        </form>

        <div className="flex max-h-64 flex-col gap-1.5 overflow-auto">
          {debts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.accounting.noDebts}</p>
          ) : (
            debts.map((debt) => (
              <div
                key={debt.id}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{debt.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatEuro(debt.amount)}
                    {debt.settled ? ` · ${t.accounting.debtSettled}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label={t.common.edit} onClick={() => startEdit(debt)}>
                    <PencilIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t.accounting.debtDelete}
                    onClick={() => handleDelete(debt.id)}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t.common.cancel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
