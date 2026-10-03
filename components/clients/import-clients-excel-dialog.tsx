"use client"

import { useEffect, useState } from "react"
import { FileSpreadsheetIcon, Undo2Icon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useClientsStore } from "@/lib/clients-store"
import { useTranslation } from "@/lib/i18n/context"
import { formatDate } from "@/lib/mock-data"
import type { Dictionary } from "@/lib/i18n/dictionary"
import type { ImportBatch, ImportDecision, ImportPlanItem } from "@/types/electron"

type RowState = { proceed: boolean; guardianKey: string }
type Step = "idle" | "loading" | "review" | "applying" | "done"

function patchFieldLabel(t: Dictionary, key: string) {
  switch (key) {
    case "email":
      return t.clients.colEmail
    case "phone":
      return t.clients.colPhone
    case "address":
      return t.clients.colAddress
    case "postalCode":
      return t.clients.colPostalCode
    case "city":
      return t.clients.colCity
    case "birthDate":
      return t.clients.colBirthDate
    case "status":
      return t.clients.colStatus
    default:
      return key
  }
}

export function ImportClientsExcelDialog() {
  const { t } = useTranslation()
  const {
    available,
    analyzeExcelImport,
    applyExcelImport,
    undoImportBatch,
    listImportBatches,
  } = useClientsStore()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("idle")
  const [items, setItems] = useState<ImportPlanItem[]>([])
  const [rowStates, setRowStates] = useState<Record<number, RowState>>({})
  const [result, setResult] = useState<
    { batchId: string; created: number; updated: number; skipped: number; linked: number } | null
  >(null)
  const [recentBatches, setRecentBatches] = useState<ImportBatch[]>([])

  useEffect(() => {
    if (!open) return
    setStep("idle")
    setResult(null)
    setItems([])
    setRowStates({})
    listImportBatches().then(setRecentBatches)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleChooseFile() {
    if (!available) {
      toast.error(t.settings.electronOnlyFeature)
      return
    }
    setStep("loading")
    const res = await analyzeExcelImport()
    if (!res.ok) {
      setStep("idle")
      if (!res.canceled) toast.error(res.error || t.clients.importErrorTitle)
      return
    }
    if (res.items.length === 0) {
      setStep("idle")
      toast.error(t.clients.importNoRows)
      return
    }
    setItems(res.items)
    const initial: Record<number, RowState> = {}
    for (const item of res.items) initial[item.rowIndex] = { proceed: true, guardianKey: "none" }
    setRowStates(initial)
    setStep("review")
  }

  function toggleRow(rowIndex: number, proceed: boolean) {
    setRowStates((s) => ({ ...s, [rowIndex]: { ...s[rowIndex], proceed } }))
  }

  function setGuardian(rowIndex: number, guardianKey: string) {
    setRowStates((s) => ({ ...s, [rowIndex]: { ...s[rowIndex], guardianKey } }))
  }

  async function handleConfirm() {
    setStep("applying")
    const decisions: Record<number, ImportDecision> = {}
    for (const item of items) {
      const state = rowStates[item.rowIndex]
      const decision: ImportDecision = { proceed: state?.proceed ?? true }
      if (state?.guardianKey && state.guardianKey !== "none") {
        if (state.guardianKey.startsWith("row:")) {
          decision.guardian = { type: "row", rowIndex: Number(state.guardianKey.slice(4)) }
        } else if (state.guardianKey.startsWith("client:")) {
          decision.guardian = { type: "client", clientId: state.guardianKey.slice(7) }
        } else if (state.guardianKey.startsWith("payer:")) {
          decision.guardian = { type: "payer", payerId: state.guardianKey.slice(6) }
        }
      }
      decisions[item.rowIndex] = decision
    }
    const res = await applyExcelImport(items, decisions)
    if (!res.ok) {
      setStep("review")
      toast.error(res.error || t.clients.importErrorTitle)
      return
    }
    setResult(res)
    setStep("done")
  }

  async function handleUndo(batchId: string) {
    const res = await undoImportBatch(batchId)
    if (res.ok) {
      toast.success(t.clients.importUndoSuccess)
      setRecentBatches((prev) => prev.map((b) => (b.id === batchId ? { ...b, undone: 1 } : b)))
    } else {
      toast.error("error" in res ? res.error || t.clients.importUndoError : t.clients.importUndoError)
    }
  }

  const includedCount = items.filter((item) => rowStates[item.rowIndex]?.proceed ?? true).length

  function rowLabelByIndex(rowIndex: number) {
    const peer = items.find((i) => i.rowIndex === rowIndex)
    return peer ? `${peer.firstName} ${peer.lastName}`.trim() : rowIndex
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <FileSpreadsheetIcon data-icon="inline-start" />
            {t.clients.importExcel}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {step === "review" || step === "applying"
              ? t.clients.importReviewTitle
              : step === "done"
                ? t.clients.importDoneTitle
                : t.clients.importExcel}
          </DialogTitle>
          <DialogDescription>
            {step === "review" || step === "applying"
              ? t.clients.importReviewDescription
              : step === "done"
                ? t.clients.importBatchSummary
                    .replace("{created}", String(result?.created ?? 0))
                    .replace("{updated}", String(result?.updated ?? 0))
                    .replace("{linked}", String(result?.linked ?? 0))
                : t.clients.subtitle}
          </DialogDescription>
        </DialogHeader>

        {step === "idle" || step === "loading" ? (
          <div className="flex flex-col gap-4">
            <Button onClick={handleChooseFile} disabled={step === "loading"} className="w-fit">
              <FileSpreadsheetIcon data-icon="inline-start" />
              {step === "loading" ? t.clients.importing : t.clients.importChooseFile}
            </Button>

            <div className="flex flex-col gap-2">
              <h4 className="text-sm font-medium">{t.clients.importRecentTitle}</h4>
              {recentBatches.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.clients.importRecentEmpty}</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {recentBatches.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                    >
                      <span className="flex flex-col">
                        <span>{formatDate(b.created_at, true)}</span>
                        <span className="text-xs text-muted-foreground">
                          {t.clients.importSuccessDescription
                            .replace("{created}", String(b.created_count))
                            .replace("{updated}", String(b.updated_count))
                            .replace("{skipped}", String(b.skipped_count))}
                        </span>
                      </span>
                      {b.undone ? (
                        <Badge variant="outline" className="text-muted-foreground">
                          {t.clients.importRecentUndone}
                        </Badge>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => handleUndo(b.id)}>
                          <Undo2Icon data-icon="inline-start" />
                          {t.clients.importUndoBatch}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        {step === "review" || step === "applying" ? (
          <div className="max-h-[60vh] overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-10" />
                  <TableHead>{t.clients.colFirstName}</TableHead>
                  <TableHead>{t.clients.colLastName}</TableHead>
                  <TableHead>{t.clients.colEmail}</TableHead>
                  <TableHead>{t.clients.colPhone}</TableHead>
                  <TableHead>{t.clients.colBirthDate}</TableHead>
                  <TableHead>{t.clients.colAddress}</TableHead>
                  <TableHead>{t.clients.colPostalCode}</TableHead>
                  <TableHead>{t.clients.colCity}</TableHead>
                  <TableHead>{t.clients.colStatus}</TableHead>
                  <TableHead>{t.seasons.label}</TableHead>
                  <TableHead>{t.clients.importActionHeader}</TableHead>
                  <TableHead className="min-w-48">{t.clients.importGuardianLabel}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const state = rowStates[item.rowIndex]
                  const proceed = state?.proceed ?? true
                  const patchKeys = item.patch ? Object.keys(item.patch) : []
                  const hasGuardianOptions =
                    item.clusterRowIndexes.length > 0 || !!item.relatedClientId || !!item.relatedPayerId
                  return (
                    <TableRow key={item.rowIndex} className={proceed ? "" : "opacity-50"}>
                      <TableCell>
                        <Switch
                          size="sm"
                          checked={proceed}
                          onCheckedChange={(checked) => toggleRow(item.rowIndex, checked)}
                          disabled={step === "applying"}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{item.firstName}</TableCell>
                      <TableCell className="whitespace-nowrap">{item.lastName}</TableCell>
                      <TableCell className="whitespace-nowrap">{item.email || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{item.phone || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{item.birthDate || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{item.address || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{item.postalCode || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{item.city || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {item.courseType ? t.courseTypes[item.courseType as keyof typeof t.courseTypes] ?? item.courseType : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{item.season || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {item.kind === "create" ? (
                          <Badge variant="outline">{t.clients.importActionNew}</Badge>
                        ) : patchKeys.length > 0 ? (
                          <Badge variant="outline" className="whitespace-normal">
                            {t.clients.importActionComplete.replace(
                              "{fields}",
                              patchKeys.map((k) => patchFieldLabel(t, k)).join(", "),
                            )}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            {t.clients.importActionNothing}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {hasGuardianOptions ? (
                          <Select
                            value={state?.guardianKey ?? "none"}
                            onValueChange={(v) => setGuardian(item.rowIndex, v ?? "none")}
                          >
                            <SelectTrigger size="sm" className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectItem value="none">{t.clients.importGuardianNone}</SelectItem>
                                {item.clusterRowIndexes.map((peerIndex) => (
                                  <SelectItem key={`row:${peerIndex}`} value={`row:${peerIndex}`}>
                                    {t.clients.importGuardianLinkTo.replace(
                                      "{name}",
                                      String(rowLabelByIndex(peerIndex)),
                                    )}
                                  </SelectItem>
                                ))}
                                {item.relatedPayerId ? (
                                  <SelectItem value={`payer:${item.relatedPayerId}`}>
                                    {t.clients.importGuardianLinkTo.replace(
                                      "{name}",
                                      item.relatedPayerName || "",
                                    )}
                                  </SelectItem>
                                ) : null}
                                {item.relatedClientId ? (
                                  <SelectItem value={`client:${item.relatedClientId}`}>
                                    {t.clients.importGuardianLinkTo.replace(
                                      "{name}",
                                      item.relatedClientName || "",
                                    )}
                                  </SelectItem>
                                ) : null}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        ) : null}

        {step === "done" && result ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              {t.clients.importSuccessDescription
                .replace("{created}", String(result.created))
                .replace("{updated}", String(result.updated))
                .replace("{skipped}", String(result.skipped))}
            </p>
            <Button variant="outline" onClick={() => handleUndo(result.batchId)} className="w-fit">
              <Undo2Icon data-icon="inline-start" />
              {t.clients.importUndoBatch}
            </Button>
          </div>
        ) : null}

        <DialogFooter>
          {step === "review" ? (
            <>
              <Button variant="outline" onClick={() => setStep("idle")}>
                {t.common.cancel}
              </Button>
              <Button onClick={handleConfirm} disabled={includedCount === 0}>
                {`${t.clients.importConfirmButton} (${includedCount})`}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
