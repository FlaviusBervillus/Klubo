"use client"

import { useEffect, useState } from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"
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
import { Textarea } from "@/components/ui/textarea"
import { useClubSettings } from "@/lib/club-settings"
import { formatEuro } from "@/lib/mock-data"
import { useQuotesStore, type NewQuote, type Quote, type QuoteItem } from "@/lib/quotes-store"
import { useTranslation } from "@/lib/i18n/context"

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function emptyItem(): QuoteItem {
  return { id: crypto.randomUUID(), label: "", description: "", qty: 1, unitPrice: 0 }
}

function emptyForm(clubName: string, clubAddress: string, clubPhone: string): NewQuote {
  return {
    number: "",
    date: todayIso(),
    title: "DEVIS",
    subtitle: "",
    seasonLabel: "",
    emitterLines: [clubName, clubAddress, clubPhone].filter(Boolean).join("\n"),
    recipientLines: "",
    infoTitle: "",
    infoText: "",
    prestationTitle: "PRESTATION",
    prestationText: "",
    items: [emptyItem()],
    termsTitle: "MODALITÉS",
    termsText: "",
    signatureLeftLabel: "Bon pour accord",
    signatureRightLabel: "Pour l'association",
  }
}

function formFromQuote(quote: Quote): NewQuote {
  const { id, createdAt, ...rest } = quote
  return { ...rest, items: rest.items.length > 0 ? rest.items : [emptyItem()] }
}

export function QuoteFormDialog({ quote }: { quote?: Quote } = {}) {
  const { t } = useTranslation()
  const { settings } = useClubSettings()
  const { addQuote, updateQuote, available } = useQuotesStore()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<NewQuote>(() =>
    quote ? formFromQuote(quote) : emptyForm(settings.name, settings.address, settings.phone),
  )
  const isEdit = !!quote

  useEffect(() => {
    if (open) {
      setForm(quote ? formFromQuote(quote) : emptyForm(settings.name, settings.address, settings.phone))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quote])

  function updateItem(id: string, patch: Partial<QuoteItem>) {
    setForm((f) => ({ ...f, items: f.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }))
  }

  function addItem() {
    setForm((f) => ({ ...f, items: [...f.items, emptyItem()] }))
  }

  function removeItem(id: string) {
    setForm((f) => ({ ...f, items: f.items.filter((it) => it.id !== id) }))
  }

  const total = form.items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!available) {
      toast.error(t.settings.electronOnlyFeature)
      return
    }
    const cleanedItems = form.items.filter((it) => it.label.trim() !== "")
    const payload = { ...form, items: cleanedItems }
    if (isEdit) {
      await updateQuote(quote.id, payload)
    } else {
      await addQuote(payload)
    }
    setOpen(false)
    toast.success(t.devis.quoteSaved)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          isEdit ? (
            <Button variant="outline" size="sm">
              {t.common.edit}
            </Button>
          ) : (
            <Button>
              <PlusIcon data-icon="inline-start" />
              {t.devis.newQuote}
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{isEdit ? t.devis.editQuoteTitle : t.devis.newQuoteTitle}</DialogTitle>
            <DialogDescription>{t.devis.formDescription}</DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[65vh] flex-col gap-6 overflow-y-auto pr-1">
            <FieldGroup>
              <div className="grid grid-cols-3 gap-3">
                <Field>
                  <FieldLabel htmlFor="quote-title">{t.devis.fieldTitle}</FieldLabel>
                  <Input
                    id="quote-title"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="quote-subtitle">{t.devis.fieldSubtitle}</FieldLabel>
                  <Input
                    id="quote-subtitle"
                    value={form.subtitle}
                    onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="quote-season">{t.devis.fieldSeasonLabel}</FieldLabel>
                  <Input
                    id="quote-season"
                    placeholder="Saison 2026-2027"
                    value={form.seasonLabel}
                    onChange={(e) => setForm((f) => ({ ...f, seasonLabel: e.target.value }))}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="quote-number">{t.devis.fieldNumber}</FieldLabel>
                  <Input
                    id="quote-number"
                    placeholder={t.devis.fieldNumberPlaceholder}
                    value={form.number}
                    onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="quote-date">{t.devis.fieldDate}</FieldLabel>
                  <Input
                    id="quote-date"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  />
                </Field>
              </div>
            </FieldGroup>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="quote-emitter">{t.devis.fieldEmitter}</FieldLabel>
                <Textarea
                  id="quote-emitter"
                  rows={4}
                  value={form.emitterLines}
                  onChange={(e) => setForm((f) => ({ ...f, emitterLines: e.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="quote-recipient">{t.devis.fieldRecipient}</FieldLabel>
                <Textarea
                  id="quote-recipient"
                  rows={4}
                  placeholder={t.devis.fieldRecipientPlaceholder}
                  value={form.recipientLines}
                  onChange={(e) => setForm((f) => ({ ...f, recipientLines: e.target.value }))}
                />
              </Field>
            </div>

            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="quote-info-title">{t.devis.fieldInfoTitle}</FieldLabel>
                <Input
                  id="quote-info-title"
                  placeholder={t.devis.fieldInfoTitlePlaceholder}
                  value={form.infoTitle}
                  onChange={(e) => setForm((f) => ({ ...f, infoTitle: e.target.value }))}
                />
              </Field>
              <Field>
                <Textarea
                  rows={3}
                  placeholder={t.devis.fieldInfoTextPlaceholder}
                  value={form.infoText}
                  onChange={(e) => setForm((f) => ({ ...f, infoText: e.target.value }))}
                />
              </Field>
            </FieldGroup>

            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="quote-prestation-title">{t.devis.fieldPrestationTitle}</FieldLabel>
                <Input
                  id="quote-prestation-title"
                  value={form.prestationTitle}
                  onChange={(e) => setForm((f) => ({ ...f, prestationTitle: e.target.value }))}
                />
              </Field>
              <Field>
                <Textarea
                  rows={3}
                  placeholder={t.devis.fieldPrestationTextPlaceholder}
                  value={form.prestationText}
                  onChange={(e) => setForm((f) => ({ ...f, prestationText: e.target.value }))}
                />
              </Field>
            </FieldGroup>

            <div className="flex flex-col gap-2">
              <FieldLabel>{t.devis.fieldItems}</FieldLabel>
              {form.items.map((item) => (
                <div key={item.id} className="flex flex-col gap-2 rounded-lg border p-3">
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Input
                      placeholder={t.devis.itemLabelPlaceholder}
                      value={item.label}
                      onChange={(e) => updateItem(item.id, { label: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t.devis.removeItem}
                      onClick={() => removeItem(item.id)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                  <Input
                    placeholder={t.devis.itemDescriptionPlaceholder}
                    value={item.description}
                    onChange={(e) => updateItem(item.id, { description: e.target.value })}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <Field>
                      <FieldLabel className="text-xs">{t.devis.itemQty}</FieldLabel>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={item.qty}
                        onChange={(e) => updateItem(item.id, { qty: Number(e.target.value) })}
                      />
                    </Field>
                    <Field>
                      <FieldLabel className="text-xs">{t.devis.itemUnitPrice}</FieldLabel>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(item.id, { unitPrice: Number(e.target.value) })}
                      />
                    </Field>
                    <Field>
                      <FieldLabel className="text-xs">{t.devis.itemAmount}</FieldLabel>
                      <div className="flex h-8 items-center text-sm font-medium tabular-nums">
                        {formatEuro((Number(item.qty) || 0) * (Number(item.unitPrice) || 0))}
                      </div>
                    </Field>
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="w-fit" onClick={addItem}>
                <PlusIcon data-icon="inline-start" />
                {t.devis.addItem}
              </Button>
              <div className="flex justify-end text-sm font-semibold">
                {t.devis.total} : {formatEuro(total)}
              </div>
            </div>

            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="quote-terms-title">{t.devis.fieldTermsTitle}</FieldLabel>
                <Input
                  id="quote-terms-title"
                  value={form.termsTitle}
                  onChange={(e) => setForm((f) => ({ ...f, termsTitle: e.target.value }))}
                />
              </Field>
              <Field>
                <Textarea
                  rows={3}
                  placeholder={t.devis.fieldTermsTextPlaceholder}
                  value={form.termsText}
                  onChange={(e) => setForm((f) => ({ ...f, termsText: e.target.value }))}
                />
              </Field>
            </FieldGroup>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="quote-sign-left">{t.devis.fieldSignatureLeft}</FieldLabel>
                <Input
                  id="quote-sign-left"
                  value={form.signatureLeftLabel}
                  onChange={(e) => setForm((f) => ({ ...f, signatureLeftLabel: e.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="quote-sign-right">{t.devis.fieldSignatureRight}</FieldLabel>
                <Input
                  id="quote-sign-right"
                  value={form.signatureRightLabel}
                  onChange={(e) => setForm((f) => ({ ...f, signatureRightLabel: e.target.value }))}
                />
              </Field>
            </div>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline">{t.common.cancel}</Button>} />
            <Button type="submit">{t.common.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
