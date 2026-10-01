"use client"

import { useState } from "react"
import { BoxesIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
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
import { computeAssetDepreciation } from "@/lib/depreciation"
import { useFixedAssetsStore, type NewFixedAsset } from "@/lib/fixed-assets-store"
import { useTranslation } from "@/lib/i18n/context"
import { formatEuro } from "@/lib/mock-data"

const emptyForm: NewFixedAsset = {
  label: "",
  purchaseAmount: 0,
  purchaseDate: new Date().toISOString().slice(0, 10),
  depreciationYears: 5,
  disposed: false,
  notes: "",
}

export function ManageFixedAssetsDialog() {
  const { t } = useTranslation()
  const { assets, addAsset, updateAsset, deleteAsset, available } = useFixedAssetsStore()
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<NewFixedAsset>(emptyForm)

  function startEdit(asset: (typeof assets)[number]) {
    setEditingId(asset.id)
    setForm({
      label: asset.label,
      purchaseAmount: asset.purchaseAmount,
      purchaseDate: asset.purchaseDate,
      depreciationYears: asset.depreciationYears,
      disposed: asset.disposed,
      notes: asset.notes,
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
      await updateAsset(editingId, form)
    } else {
      await addAsset(form)
    }
    resetForm()
    toast.success(t.accounting.assetSaved)
  }

  async function handleDelete(id: string) {
    await deleteAsset(id)
    if (editingId === id) resetForm()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm() }}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <BoxesIcon data-icon="inline-start" />
            {t.accounting.manageAssets}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.accounting.manageAssetsTitle}</DialogTitle>
          <DialogDescription>{t.accounting.manageAssetsDescription}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="asset-label">{t.accounting.assetLabel}</FieldLabel>
              <Input
                id="asset-label"
                required
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder={t.accounting.assetLabelPlaceholder}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="asset-amount">{t.accounting.assetAmount}</FieldLabel>
              <Input
                id="asset-amount"
                type="number"
                step="0.01"
                min="0"
                required
                value={form.purchaseAmount || ""}
                onChange={(e) => setForm((f) => ({ ...f, purchaseAmount: Number(e.target.value) }))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="asset-date">{t.accounting.assetPurchaseDate}</FieldLabel>
              <Input
                id="asset-date"
                type="date"
                required
                value={form.purchaseDate}
                onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="asset-years">{t.accounting.assetDepreciationYears}</FieldLabel>
              <Input
                id="asset-years"
                type="number"
                min="1"
                step="1"
                required
                value={form.depreciationYears || ""}
                onChange={(e) => setForm((f) => ({ ...f, depreciationYears: Number(e.target.value) }))}
              />
            </Field>
          </div>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="asset-disposed">{t.accounting.assetDisposed}</FieldLabel>
            <Switch
              id="asset-disposed"
              checked={form.disposed}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, disposed: checked }))}
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
              {editingId ? t.common.save : t.accounting.assetAdd}
            </Button>
          </div>
        </form>

        <div className="flex max-h-64 flex-col gap-1.5 overflow-auto">
          {assets.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.accounting.noAssets}</p>
          ) : (
            assets.map((asset) => {
              const { netBookValue } = computeAssetDepreciation(asset, new Date())
              return (
                <div
                  key={asset.id}
                  className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{asset.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatEuro(asset.purchaseAmount)} · {asset.depreciationYears} ans · {t.accounting.assetNetValue} {formatEuro(netBookValue)}
                      {asset.disposed ? ` · ${t.accounting.assetDisposed}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label={t.common.edit} onClick={() => startEdit(asset)}>
                      <PencilIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t.accounting.assetDelete}
                      onClick={() => handleDelete(asset.id)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </div>
              )
            })
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
