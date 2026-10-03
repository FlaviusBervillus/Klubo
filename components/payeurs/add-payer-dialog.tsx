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
import { usePayersStore, type NewPayer, type Payer } from "@/lib/payers-store"
import { useTranslation } from "@/lib/i18n/context"

const emptyForm: NewPayer = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  postalCode: "",
  city: "",
}

function formFromPayer(p: Payer): NewPayer {
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    email: p.email,
    phone: p.phone,
    address: p.address,
    postalCode: p.postalCode,
    city: p.city,
  }
}

export function AddPayerDialog({ payer }: { payer?: Payer } = {}) {
  const { t } = useTranslation()
  const { addPayer, updatePayer, available } = usePayersStore()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<NewPayer>(payer ? formFromPayer(payer) : emptyForm)
  const isEdit = !!payer

  useEffect(() => {
    if (open) setForm(payer ? formFromPayer(payer) : emptyForm)
  }, [open, payer])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!available) {
      toast.error(t.settings.electronOnlyFeature)
      return
    }
    if (isEdit) {
      await updatePayer(payer.id, form)
    } else {
      const result = await addPayer(form)
      if (!result.ok) {
        toast.error(result.error || t.payers.importErrorTitle)
        return
      }
      setForm(emptyForm)
    }
    setOpen(false)
    toast.success(t.payers.payerSaved)
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
              {t.payers.addPayer}
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? t.payers.editPayerTitle : t.payers.addPayerTitle}</DialogTitle>
            <DialogDescription>{t.payers.addPayerDescription}</DialogDescription>
          </DialogHeader>

          <FieldGroup className="py-4">
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="payer-first-name">{t.clients.colFirstName}</FieldLabel>
                <Input
                  id="payer-first-name"
                  required
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="payer-last-name">{t.clients.colLastName}</FieldLabel>
                <Input
                  id="payer-last-name"
                  required
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="payer-email">{t.clients.colEmail}</FieldLabel>
              <Input
                id="payer-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="payer-phone">{t.clients.colPhone}</FieldLabel>
              <Input
                id="payer-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="payer-address">{t.clients.colAddress}</FieldLabel>
              <Input
                id="payer-address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="payer-postal-code">{t.clients.colPostalCode}</FieldLabel>
                <Input
                  id="payer-postal-code"
                  value={form.postalCode}
                  onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="payer-city">{t.clients.colCity}</FieldLabel>
                <Input
                  id="payer-city"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
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
  )
}
