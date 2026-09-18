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
import { Switch } from "@/components/ui/switch"
import { useClientsStore } from "@/lib/clients-store"
import { useTranslation } from "@/lib/i18n/context"
import { ALL_COURSE_TYPES, ALL_PAYMENT_METHODS, type CourseType, type PaymentMethod } from "@/lib/mock-data"

const emptyForm = {
  firstName: "",
  lastName: "",
  email: "",
  status: "Kung-fu Adulte" as CourseType,
  method: "especes" as PaymentMethod,
  paid: true,
}

export function AddClientDialog() {
  const { t } = useTranslation()
  const { addClient, available } = useClientsStore()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!available) {
      toast.error(t.settings.electronOnlyFeature)
      return
    }
    await addClient(form)
    setForm(emptyForm)
    setOpen(false)
    toast.success(t.account.profileSaved)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <PlusIcon data-icon="inline-start" />
            {t.clients.title}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t.clients.title}</DialogTitle>
            <DialogDescription>{t.clients.subtitle}</DialogDescription>
          </DialogHeader>

          <FieldGroup className="py-4">
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="client-first-name">
                  {t.clients.colFirstName}
                </FieldLabel>
                <Input
                  id="client-first-name"
                  required
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="client-last-name">
                  {t.clients.colLastName}
                </FieldLabel>
                <Input
                  id="client-last-name"
                  required
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="client-email">{t.clients.colEmail}</FieldLabel>
              <Input
                id="client-email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel>{t.clients.colStatus}</FieldLabel>
                <Select
                  value={form.status}
                  onValueChange={(v) => v && setForm((f) => ({ ...f, status: v as CourseType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {ALL_COURSE_TYPES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {t.courseTypes[c]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>{t.clients.colPayment}</FieldLabel>
                <Select
                  value={form.method}
                  onValueChange={(v) => v && setForm((f) => ({ ...f, method: v as PaymentMethod }))}
                >
                  <SelectTrigger>
                    <SelectValue />
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

            <Field orientation="horizontal">
              <FieldLabel htmlFor="client-paid">{t.clients.colPaymentStatus}</FieldLabel>
              <Switch
                id="client-paid"
                checked={form.paid}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, paid: checked }))}
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
