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
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { useClientsStore } from "@/lib/clients-store"
import { clientFullName } from "@/lib/client-payments"
import { formatFirstName, formatLastName, type Client } from "@/lib/mock-data"
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
  const { clients, updateClient } = useClientsStore()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<NewPayer>(payer ? formFromPayer(payer) : emptyForm)
  const [pendingSelfPick, setPendingSelfPick] = useState(false)
  const isEdit = !!payer

  useEffect(() => {
    if (open) {
      setForm(payer ? formFromPayer(payer) : emptyForm)
      setPendingSelfPick(false)
    }
  }, [open, payer])

  // Qui ce payeur règle : lui-même (au plus un adhérent) et/ou ses enfants (plusieurs possibles) —
  // choisi ici plutôt que deviné par comparaison de noms, voir payer_relationship.
  const selfClient = payer
    ? clients.find((c) => c.payerId === payer.id && c.payerRelationship === "self")
    : undefined
  const childClients = payer
    ? clients.filter((c) => c.payerId === payer.id && c.payerRelationship === "child")
    : []
  // Candidats proposés dans les deux sélecteurs : tout adhérent qui n'est pas déjà "lui-même" pour
  // CE payeur (un même adhérent ne peut pas être à la fois "lui-même" et un "enfant" du même payeur).
  const otherClients = clients.filter((c) => c.id !== selfClient?.id)

  function setSelf(clientId: string) {
    if (!payer) return
    updateClient(clientId, { payerId: payer.id, payerRelationship: "self" })
    setPendingSelfPick(false)
  }

  function clearSelf() {
    if (!selfClient) return
    updateClient(selfClient.id, { payerId: null, payerRelationship: null })
  }

  function toggleChild(client: Client) {
    if (!payer) return
    const isChild = client.payerId === payer.id && client.payerRelationship === "child"
    if (isChild) {
      updateClient(client.id, { payerId: null, payerRelationship: null })
    } else {
      updateClient(client.id, { payerId: payer.id, payerRelationship: "child" })
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!available) {
      toast.error(t.settings.electronOnlyFeature)
      return
    }
    // Convention administrative : NOM en majuscules, Prénom avec une majuscule par segment.
    const normalizedForm = {
      ...form,
      firstName: formatFirstName(form.firstName),
      lastName: formatLastName(form.lastName),
    }
    if (isEdit) {
      await updatePayer(payer.id, normalizedForm)
    } else {
      const result = await addPayer(normalizedForm)
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

          <Separator />

          {isEdit ? (
            <FieldGroup className="py-4">
              <p className="text-sm font-medium">{t.payers.linkedAdherentsTitle}</p>
              <p className="-mt-2 text-xs text-muted-foreground">{t.payers.linkedAdherentsHint}</p>

              <Field orientation="horizontal">
                <FieldLabel htmlFor="payer-is-self">
                  {t.payers.selfIsAdherentLabel}
                  {selfClient ? (
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      ({clientFullName(selfClient)})
                    </span>
                  ) : null}
                </FieldLabel>
                <Switch
                  id="payer-is-self"
                  checked={!!selfClient || pendingSelfPick}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setPendingSelfPick(true)
                    } else {
                      clearSelf()
                      setPendingSelfPick(false)
                    }
                  }}
                />
              </Field>
              {(pendingSelfPick || selfClient) && !selfClient ? (
                <Field>
                  <Select value="" onValueChange={(v) => v && setSelf(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder={t.payers.selfPickPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {otherClients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {clientFullName(c)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}

              <Field>
                <FieldLabel>{t.payers.childrenLabel}</FieldLabel>
                {otherClients.filter((c) => c.id !== selfClient?.id).length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t.payers.noOtherAdherents}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {otherClients
                      .filter((c) => c.id !== selfClient?.id)
                      .map((c) => {
                        const isChild = childClients.some((child) => child.id === c.id)
                        return (
                          <Button
                            key={c.id}
                            type="button"
                            variant={isChild ? "default" : "outline"}
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => toggleChild(c)}
                          >
                            {clientFullName(c)}
                          </Button>
                        )
                      })}
                  </div>
                )}
              </Field>
            </FieldGroup>
          ) : (
            <p className="py-4 text-xs text-muted-foreground">{t.payers.saveFirstForLinksHint}</p>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline">{t.common.cancel}</Button>} />
            <Button type="submit">{t.common.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
