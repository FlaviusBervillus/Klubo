"use client"

import { useEffect, useMemo, useState } from "react"
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
import { useDisciplinesStore } from "@/lib/disciplines-store"
import { useSeasonClients } from "@/lib/seasons-store"
import { useTranslation } from "@/lib/i18n/context"
import {
  ALL_PAYMENT_METHODS,
  formatFirstName,
  formatLastName,
  UNCATEGORIZED_COURSE,
  type Client,
  type CourseType,
  type PaymentMethod,
} from "@/lib/mock-data"

const DEFAULT_BOARD_ROLE = "Membre du Bureau"

const emptyForm = {
  firstName: "",
  lastName: "",
  email: "",
  address: "",
  status: UNCATEGORIZED_COURSE as CourseType,
  method: "especes" as PaymentMethod,
  paid: true,
  phone: "",
  birthDate: "",
  postalCode: "",
  city: "",
  payerId: "none",
  boardRole: null as string | null,
  payerRelationship: null as "self" | "child" | null,
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
    payerId: client.payerId ?? "none",
    boardRole: client.boardRole,
    payerRelationship: client.payerRelationship,
  }
}

export function AddClientDialog({ client }: { client?: Client } = {}) {
  const { t } = useTranslation()
  const { clients, addClient, updateClient, available } = useClientsStore()
  const { setClientSeasonInfo, hasActiveSeason } = useSeasonClients()
  const { disciplines } = useDisciplinesStore()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(client ? formFromClient(client) : emptyForm)
  const isEdit = !!client

  // Rôles déjà utilisés par d'autres membres du bureau, suggérés (sans jamais forcer) via la
  // datalist — pour retrouver facilement "Trésorier"/"Président" sans ressaisir, tout en gardant le
  // champ libre pour en inventer un nouveau.
  const boardRoleSuggestions = useMemo(() => {
    const roles = new Set<string>([DEFAULT_BOARD_ROLE])
    for (const c of clients) {
      if (c.boardRole) roles.add(c.boardRole)
    }
    return Array.from(roles)
  }, [clients])

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
    // Convention administrative : NOM en majuscules, Prénom avec une majuscule par segment — pour
    // que les fiches, tableaux et factures affichent toujours la même chose, quelle que soit la
    // façon dont le trésorier les a tapés.
    const normalizedForm = {
      ...form,
      firstName: formatFirstName(form.firstName),
      lastName: formatLastName(form.lastName),
    }
    if (isEdit) {
      const { status, paid, ...identity } = normalizedForm
      await updateClient(client.id, {
        ...identity,
        payerId: identity.payerId === "none" ? null : identity.payerId,
      })
      // Le cours et le paiement sont propres à la saison active ; sans saison sélectionnée,
      // on garde l'ancien comportement (écriture directe sur la fiche client).
      if (hasActiveSeason) {
        await setClientSeasonInfo(client.id, { status, paid })
      } else {
        await updateClient(client.id, { status, paid })
      }
    } else {
      // À la création, le cours/paiement saisis deviennent la valeur par défaut de la fiche.
      const newId = crypto.randomUUID()
      await addClient({
        id: newId,
        ...normalizedForm,
        payerId: normalizedForm.payerId === "none" ? null : normalizedForm.payerId,
      })
      // Un nouveau client rejoint aussitôt l'effectif de la saison active, sinon il n'apparaîtrait
      // nulle part (les saisons démarrent volontairement avec un effectif vide).
      if (hasActiveSeason) {
        await setClientSeasonInfo(newId, { status: normalizedForm.status, paid: normalizedForm.paid })
      }
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
                      <SelectItem value={UNCATEGORIZED_COURSE}>
                        {t.courseTypes[UNCATEGORIZED_COURSE] ?? UNCATEGORIZED_COURSE}
                      </SelectItem>
                      {disciplines.map((d) => (
                        <SelectItem key={d.id} value={d.label}>
                          {t.courseTypes[d.label] ?? d.label}
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

            <Field orientation="horizontal">
              <FieldLabel htmlFor="client-board-member">{t.clients.boardMemberLabel}</FieldLabel>
              <Switch
                id="client-board-member"
                checked={form.boardRole !== null}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, boardRole: checked ? DEFAULT_BOARD_ROLE : null }))
                }
              />
            </Field>
            {form.boardRole !== null ? (
              <Field>
                <FieldLabel htmlFor="client-board-role">{t.clients.boardRoleLabel}</FieldLabel>
                <Input
                  id="client-board-role"
                  list="board-role-suggestions"
                  value={form.boardRole}
                  onChange={(e) => setForm((f) => ({ ...f, boardRole: e.target.value }))}
                  placeholder={DEFAULT_BOARD_ROLE}
                />
                <datalist id="board-role-suggestions">
                  {boardRoleSuggestions.map((role) => (
                    <option key={role} value={role} />
                  ))}
                </datalist>
                <p className="text-xs text-muted-foreground">{t.clients.boardRoleHint}</p>
              </Field>
            ) : null}

            <p className="text-xs text-muted-foreground">{t.clients.payerManagedFromPayersHint}</p>
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
