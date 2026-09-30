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
import { useSeasonClients } from "@/lib/seasons-store"
import { useTranslation } from "@/lib/i18n/context"
import {
  ALL_COURSE_TYPES,
  ALL_PAYMENT_METHODS,
  type Client,
  type CourseType,
  type PaymentMethod,
} from "@/lib/mock-data"

const emptyForm = {
  firstName: "",
  lastName: "",
  email: "",
  address: "",
  status: "Kung-fu Adulte" as CourseType,
  method: "especes" as PaymentMethod,
  paid: true,
  phone: "",
  birthDate: "",
  postalCode: "",
  city: "",
  guardianId: "none",
}

function formFromClient(client: Client) {
  return {
    firstName: client.firstName,
    lastName: client.lastName,
    email: client.email,
    address: client.address,
    status: client.status,
    method: client.method,
    paid: client.paid,
    phone: client.phone,
    birthDate: client.birthDate ?? "",
    postalCode: client.postalCode,
    city: client.city,
    guardianId: client.guardianId ?? "none",
  }
}

export function AddClientDialog({ client }: { client?: Client } = {}) {
  const { t } = useTranslation()
  const { clients, addClient, updateClient, available } = useClientsStore()
  const { setClientSeasonInfo, hasActiveSeason } = useSeasonClients()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(client ? formFromClient(client) : emptyForm)
  const isEdit = !!client
  const guardianCandidates = clients.filter((c) => c.id !== client?.id)

  useEffect(() => {
    if (open) {
      setForm(client ? formFromClient(client) : emptyForm)
    }
  }, [open, client])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!available) {
      toast.error(t.settings.electronOnlyFeature)
      return
    }
    if (isEdit) {
      const { status, paid, ...identity } = form
      await updateClient(client.id, {
        ...identity,
        guardianId: identity.guardianId === "none" ? null : identity.guardianId,
      })
      // Le cours et le paiement sont propres à la saison active ; sans saison sélectionnée,
      // on garde l'ancien comportement (écriture directe sur la fiche client).
      if (hasActiveSeason) {
        await setClientSeasonInfo(client.id, { status, paid })
      } else {
        await updateClient(client.id, { status, paid })
      }
    } else {
      // À la création, le cours/paiement saisis deviennent la valeur par défaut de la fiche,
      // reprise pour la saison active tant qu'aucune valeur n'a été fixée explicitement pour elle.
      await addClient({ ...form, guardianId: form.guardianId === "none" ? null : form.guardianId })
      setForm(emptyForm)
    }
    setOpen(false)
    toast.success(t.account.profileSaved)
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
              {t.clients.title}
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? t.clients.editTitle : t.clients.title}</DialogTitle>
            <DialogDescription>
              {isEdit ? t.clients.editSubtitle : t.clients.subtitle}
            </DialogDescription>
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
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="client-address">{t.clients.colAddress}</FieldLabel>
              <Input
                id="client-address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="10c Rue de la Barre Andrée, 44470 Thouaré-sur-Loire"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="client-postal-code">{t.clients.colPostalCode}</FieldLabel>
                <Input
                  id="client-postal-code"
                  value={form.postalCode}
                  onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
                  placeholder="44470"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="client-city">{t.clients.colCity}</FieldLabel>
                <Input
                  id="client-city"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="Carquefou"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="client-phone">{t.clients.colPhone}</FieldLabel>
                <Input
                  id="client-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+33 6 79 81 95 05"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="client-birth-date">{t.clients.colBirthDate}</FieldLabel>
                <Input
                  id="client-birth-date"
                  type="date"
                  value={form.birthDate}
                  onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
                />
              </Field>
            </div>

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

            <Field>
              <FieldLabel>{t.clients.guardianFieldLabel}</FieldLabel>
              <Select
                value={form.guardianId}
                onValueChange={(v) => setForm((f) => ({ ...f, guardianId: v ?? "none" }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t.clients.guardianFieldNone} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">{t.clients.guardianFieldNone}</SelectItem>
                    {guardianCandidates.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {`${c.firstName} ${c.lastName}`.trim()}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
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
