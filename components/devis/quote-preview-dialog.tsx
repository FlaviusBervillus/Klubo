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
import { useTranslation } from "@/lib/i18n/context"

const ZOOM_STEP = 0.25
const ZOOM_MIN = 0.5
const ZOOM_MAX = 2
const PREVIEW_BASE_WIDTH = 760
const PREVIEW_BASE_HEIGHT = 1000

interface QuotePreviewDialogProps {
  quoteId: string | null
  onOpenChange: (open: boolean) => void
}

export function QuotePreviewDialog({ quoteId, onOpenChange }: QuotePreviewDialogProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [html, setHtml] = useState("")
  const [zoom, setZoom] = useState(0.6)
  const [busy, setBusy] = useState(false)

  const open = !!quoteId

  useEffect(() => {
    if (!quoteId) {
      setHtml("")
      setZoom(0.6)
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
      const result = await electronApi.renderQuotePreview(quoteId as string)
      if (cancelled) return
      if (result.ok) {
        setHtml(result.html)
      } else {
        toast.error(result.error || t.devis.previewTitle)
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId])

  async function handleDownload() {
    if (!quoteId) return
    const electronApi = window.electronAPI
    if (!electronApi) return
    setBusy(true)
    const result = await electronApi.downloadQuote(quoteId)
    setBusy(false)
    if (result.ok) {
      toast.success(t.devis.downloaded, { description: result.path })
      onOpenChange(false)
    } else if (!result.canceled) {
      toast.error(result.error || t.devis.downloadError)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.devis.previewTitle}</DialogTitle>
          <DialogDescription>{t.devis.previewDescription}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t.receiptPreview.loading}</p>
        ) : (
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
            <div className="h-[60vh] overflow-auto rounded-lg border bg-white">
              <div
                style={{
                  width: PREVIEW_BASE_WIDTH * zoom,
                  height: PREVIEW_BASE_HEIGHT * zoom,
                }}
              >
                <iframe
                  title={t.devis.previewTitle}
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
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button onClick={handleDownload} disabled={busy || loading}>
            {t.devis.download}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
