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
import { useEquipmentStore, type EquipmentItem, type NewEquipmentItem } from "@/lib/equipment-store"
import { useTranslation } from "@/lib/i18n/context"

const emptyForm: NewEquipmentItem = {
  label: "",
  stockQuantity: 0,
  purchasePrice: 0,
  salePrice: 0,
  notes: "",
}

function formFromItem(item: EquipmentItem): NewEquipmentItem {
  return {
    label: item.label,
    stockQuantity: item.stockQuantity,
    purchasePrice: item.purchasePrice,
    salePrice: item.salePrice,
    notes: item.notes,
  }
}

export function AddEquipmentDialog({ item }: { item?: EquipmentItem } = {}) {
  const { t } = useTranslation()
  const { addItem, updateItem, available } = useEquipmentStore()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<NewEquipmentItem>(item ? formFromItem(item) : emptyForm)
  const isEdit = !!item

  useEffect(() => {
    if (open) setForm(item ? formFromItem(item) : emptyForm)
  }, [open, item])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!available) {
      toast.error(t.settings.electronOnlyFeature)
      return
    }
    if (isEdit) {
      await updateItem(item.id, form)
    } else {
      await addItem(form)
      setForm(emptyForm)
    }
    setOpen(false)
    toast.success(t.materiel.itemSaved)
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
              {t.materiel.addItem}
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? t.materiel.editItemTitle : t.materiel.addItemTitle}</DialogTitle>
            <DialogDescription>{t.materiel.addItemDescription}</DialogDescription>
          </DialogHeader>

          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="item-label">{t.materiel.colLabel}</FieldLabel>
              <Input
                id="item-label"
                required
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder={t.materiel.labelPlaceholder}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="item-stock">{t.materiel.colStock}</FieldLabel>
              <Input
                id="item-stock"
                type="number"
                min="0"
                step="1"
                required
                value={form.stockQuantity}
                onChange={(e) => setForm((f) => ({ ...f, stockQuantity: Number(e.target.value) }))}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="item-purchase-price">{t.materiel.colPurchasePrice}</FieldLabel>
                <Input
                  id="item-purchase-price"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={form.purchasePrice}
                  onChange={(e) => setForm((f) => ({ ...f, purchasePrice: Number(e.target.value) }))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="item-sale-price">{t.materiel.colSalePrice}</FieldLabel>
                <Input
                  id="item-sale-price"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={form.salePrice}
                  onChange={(e) => setForm((f) => ({ ...f, salePrice: Number(e.target.value) }))}
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
