"use client"

import { useState } from "react"
import { PlusIcon } from "lucide-react"
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
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import { useTranslation } from "@/lib/i18n/context"
import {
  ALL_PAYMENT_METHODS,
  ASSIGNABLE_CATEGORIES,
  type Category,
  type PaymentMethod,
  type TransactionType,
} from "@/lib/mock-data"
import { useTransactionsStore } from "@/lib/transactions-store"

const emptyForm = {
  description: "",
  amount: "",
  date: new Date().toISOString().slice(0, 10),
  category: "Cotisations" as Category,
  method: "especes" as PaymentMethod,
  member: "",
}

export function AddTransactionDialog({
  trigger,
}: {
  trigger?: React.ReactNode
}) {
  const { t } = useTranslation()
  const { addTransaction, available } = useTransactionsStore()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<TransactionType>("entree")
  const [form, setForm] = useState(emptyForm)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!available) {
      toast.error(t.settings.electronOnlyFeature)
      return
    }
    await addTransaction({
      description: form.description,
      amount: Number(form.amount),
      date: new Date(form.date).toISOString(),
      category: form.category,
      method: form.method,
      member: form.member || null,
      type,
      status: "valide",
    })
    setForm(emptyForm)
    setType("entree")
    setOpen(false)
    toast.success("Transaction enregistrée", {
      description: "L'écriture a été ajoutée au journal comptable.",
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ? (
            (trigger as React.ReactElement)
          ) : (
            <Button>
              <PlusIcon data-icon="inline-start" />
              {t.transactions.addTransaction}
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Nouvelle transaction manuelle</DialogTitle>
            <DialogDescription>
              Saisissez une écriture comptable pour le journal du club.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="py-4">
            <Field>
              <FieldLabel>Sens de l&apos;opération</FieldLabel>
              <ToggleGroup
                value={[type]}
                onValueChange={(v) => v[0] && setType(v[0] as TransactionType)}
                className="w-full"
              >
                <ToggleGroupItem value="entree" className="flex-1">
                  {t.transactionDetail.directionIn}
                </ToggleGroupItem>
                <ToggleGroupItem value="sortie" className="flex-1">
                  {t.transactionDetail.directionOut}
                </ToggleGroupItem>
              </ToggleGroup>
            </Field>

            <Field>
              <FieldLabel htmlFor="tx-desc">Description</FieldLabel>
              <Input
                id="tx-desc"
                placeholder="Ex. Cotisation annuelle — Jean Dupont"
                required
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="tx-amount">Montant (€)</FieldLabel>
                <Input
                  id="tx-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  required
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="tx-date">{t.transactionDetail.date}</FieldLabel>
                <Input
                  id="tx-date"
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel>{t.transactionDetail.category}</FieldLabel>
                <Select
                  defaultValue="Cotisations"
                  value={form.category}
                  onValueChange={(v) => v && setForm((f) => ({ ...f, category: v as Category }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {ASSIGNABLE_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {t.categories[c]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>{t.transactionDetail.method}</FieldLabel>
                <Select
                  defaultValue="especes"
                  value={form.method}
                  onValueChange={(v) => v && setForm((f) => ({ ...f, method: v as PaymentMethod }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {ALL_PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {t.methods[m]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="tx-member">Adhérent lié (optionnel)</FieldLabel>
              <Input
                id="tx-member"
                placeholder="Nom de l'adhérent"
                value={form.member}
                onChange={(e) => setForm((f) => ({ ...f, member: e.target.value }))}
              />
              <FieldDescription>
                Rattachez l&apos;écriture à un adhérent pour le suivi des cotisations.
              </FieldDescription>
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
