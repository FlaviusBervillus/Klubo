"use client"

import { useMemo } from "react"
import { Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Empty } from "@/components/ui/empty"
import { AddEquipmentDialog } from "@/components/materiel/add-equipment-dialog"
import { useEquipmentStore } from "@/lib/equipment-store"
import { useTranslation } from "@/lib/i18n/context"
import { formatEuro } from "@/lib/mock-data"

export function EquipmentTable() {
  const { t } = useTranslation()
  const { items, deleteItem } = useEquipmentStore()

  const totals = useMemo(() => {
    let units = 0
    let purchaseValue = 0
    let saleValue = 0
    for (const item of items) {
      units += item.stockQuantity
      purchaseValue += item.stockQuantity * item.purchasePrice
      saleValue += item.stockQuantity * item.salePrice
    }
    return { units, purchaseValue, saleValue, margin: saleValue - purchaseValue, references: items.length }
  }, [items])

  async function handleDelete(id: string) {
    await deleteItem(id)
    toast.success(t.materiel.itemDeleted)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>{t.materiel.totalPurchaseValue}</CardDescription>
            <CardTitle className="font-mono text-2xl tabular-nums">
              {formatEuro(totals.purchaseValue)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t.materiel.totalSaleValue}</CardDescription>
            <CardTitle className="font-mono text-2xl tabular-nums text-success dark:text-[oklch(0.74_0.14_155)]">
              {formatEuro(totals.saleValue)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t.materiel.potentialMargin}</CardDescription>
            <CardTitle className="font-mono text-2xl tabular-nums text-[oklch(0.5_0.15_265)] dark:text-[oklch(0.75_0.12_265)]">
              {formatEuro(totals.margin, { signed: true })}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t.materiel.totalUnits}</CardDescription>
            <CardTitle className="font-mono text-2xl tabular-nums">
              {totals.units} · {totals.references} {t.materiel.references}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>{t.materiel.colLabel}</TableHead>
              <TableHead className="text-right">{t.materiel.colStock}</TableHead>
              <TableHead className="text-right">{t.materiel.colPurchasePrice}</TableHead>
              <TableHead className="text-right">{t.materiel.colSalePrice}</TableHead>
              <TableHead className="text-right">{t.materiel.colStockValue}</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.label}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {item.stockQuantity === 0 ? (
                    <span className="text-destructive">0</span>
                  ) : (
                    item.stockQuantity
                  )}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                  {formatEuro(item.purchasePrice)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                  {formatEuro(item.salePrice)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatEuro(item.stockQuantity * item.purchasePrice)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <AddEquipmentDialog item={item} />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t.materiel.itemDeleted}
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {items.length === 0 ? (
          <Empty className="border-0">
            <p className="text-sm text-muted-foreground">{t.materiel.noItems}</p>
          </Empty>
        ) : null}
      </div>
    </div>
  )
}
