"use client"

import { useEffect, useState } from "react"
import { ZoomInIcon, ZoomOutIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { useClientsStore } from "@/lib/clients-store"
import { useTranslation } from "@/lib/i18n/context"
import type { ReceiptOverrides } from "@/types/electron"

const emptyForm = { firstName: "", lastName: "", email: "", address: "" }
const ZOOM_STEP = 0.25
const ZOOM_MIN = 0.5
const ZOOM_MAX = 2
const PREVIEW_BASE_WIDTH = 760
const PREVIEW_BASE_HEIGHT = 500

interface ReceiptPreviewDialogProps {
  transactionId: string | null
  onOpenChange: (open: boolean) => void
}

export function ReceiptPreviewDialog({ transactionId, onOpenChange }: ReceiptPreviewDialogProps) {
  const { t } = useTranslation()
  const { clients } = useClientsStore()
  const clientItems = clients.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}`.trim() }))
  const [loading, setLoading] = useState(false)
  const [hasResolvedClient, setHasResolvedClient] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState("")
  const [form, setForm] = useState(emptyForm)
  const [html, setHtml] = useState("")
  const [stripeInvoicePdfUrl, setStripeInvoicePdfUrl] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [busy, setBusy] = useState(false)

  const open = !!transactionId
  const isStripeInvoice = !!stripeInvoicePdfUrl

  useEffect(() => {
    if (!transactionId) {
      setForm(emptyForm)
      setSelectedClientId("")
      setHasResolvedClient(false)
      setHtml("")
      setStripeInvoicePdfUrl(null)
      setZoom(1)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      const electronApi = window.electronAPI
      if (!electronApi) {
        setLoading(false)
        return
      }
      const result = await electronApi.prepareReceipt(transactionId as string)
      if (cancelled) return
      if (result.ok) {
        setHasResolvedClient(!!result.client)
        setSelectedClientId(result.client?.id ?? "")
        setForm({
          firstName: result.client?.first_name ?? "",
          lastName: result.client?.last_name ?? "",
          email: result.client?.email ?? "",
          address: result.client?.address ?? "",
        })
        setStripeInvoicePdfUrl(result.stripeInvoicePdfUrl ?? null)
      } else {
        toast.error(result.error || t.receiptPreview.title)
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId])

  useEffect(() => {
    if (!transactionId || loading || isStripeInvoice) return
    let cancelled = false
    async function refreshPreview() {
      const electronApi = window.electronAPI
      if (!electronApi) return
      const overrides: ReceiptOverrides = { clientId: selectedClientId || null, ...form }
      const result = await electronApi.renderReceiptPreview(transactionId as string, overrides)
      if (!cancelled && result.ok) setHtml(result.html)
    }
    refreshPreview()
    return () => {
      cancelled = true
    }
  }, [transactionId, loading, isStripeInvoice, form, selectedClientId])

  function selectClient(id: string) {
    setSelectedClientId(id)
    const c = clients.find((cl) => cl.id === id)
    if (c) {
      setForm({ firstName: c.firstName, lastName: c.lastName, email: c.email, address: c.address })
    }
  }

  async function handleDownload() {
    if (!transactionId) return
    const electronApi = window.electronAPI
    if (!electronApi) return
    setBusy(true)
    if (isStripeInvoice) {
      const result = await electronApi.downloadStripeInvoice(transactionId)
      setBusy(false)
      if (result.ok) {
        toast.success(t.transactionDetail.downloadReceipt, { description: result.path })
        onOpenChange(false)
      } else if (!result.canceled) {
        toast.error(result.error || t.transactionDetail.downloadReceipt)
      }
      return
    }
    const overrides: ReceiptOverrides = { clientId: selectedClientId || null, ...form }
    const result = await electronApi.downloadReceipt(transactionId, overrides)
    setBusy(false)
    if (result.ok) {
      toast.success(t.transactionDetail.downloadReceipt, { description: result.path })
      onOpenChange(false)
    } else if (!result.canceled) {
      toast.error(result.error || t.transactionDetail.downloadReceipt)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t.receiptPreview.title}</DialogTitle>
          <DialogDescription>
            {isStripeInvoice ? t.receiptPreview.stripeDescription : t.receiptPreview.description}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t.receiptPreview.loading}
          </p>
        ) : isStripeInvoice ? (
          <div className="overflow-hidden rounded-lg border bg-white">
            <iframe
              title={t.receiptPreview.title}
              src={stripeInvoicePdfUrl ?? undefined}
              className="h-[70vh] w-full"
            />
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <FieldGroup>
              {!hasResolvedClient ? (
                <Field>
                  <FieldLabel>{t.receiptPreview.linkClient}</FieldLabel>
                  <Select
                    items={clientItems}
                    value={selectedClientId}
                    onValueChange={(v) => selectClient(v ?? "")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t.receiptPreview.manualOption} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {clientItems.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="receipt-first-name">
                    {t.clients.colFirstName}
                  </FieldLabel>
                  <Input
                    id="receipt-first-name"
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="receipt-last-name">
                    {t.clients.colLastName}
                  </FieldLabel>
                  <Input
                    id="receipt-last-name"
                    value={form.lastName}
                    onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="receipt-email">{t.clients.colEmail}</FieldLabel>
                <Input
                  id="receipt-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="receipt-address">{t.clients.colAddress}</FieldLabel>
                <Input
                  id="receipt-address"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
              </Field>
            </FieldGroup>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t.receiptPreview.zoomOut}
                  disabled={zoom <= ZOOM_MIN}
                  onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))}
                >
                  <ZoomOutIcon />
                </Button>
                <span className="w-10 text-center font-mono text-xs text-muted-foreground tabular-nums">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t.receiptPreview.zoomIn}
                  disabled={zoom >= ZOOM_MAX}
                  onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))}
                >
                  <ZoomInIcon />
                </Button>
              </div>
              <div className="h-96 overflow-auto rounded-lg border bg-white">
                <div
                  style={{
                    width: PREVIEW_BASE_WIDTH * zoom,
                    height: PREVIEW_BASE_HEIGHT * zoom,
                  }}
                >
                  <iframe
                    title={t.receiptPreview.title}
                    srcDoc={html}
                    style={{
                      width: PREVIEW_BASE_WIDTH,
                      height: PREVIEW_BASE_HEIGHT,
                      border: 0,
                      transform: `scale(${zoom})`,
                      transformOrigin: "top left",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button onClick={handleDownload} disabled={busy || loading}>
            {t.receiptPreview.download}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
