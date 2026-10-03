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
import { AddDisciplineDialog } from "@/components/disciplines/add-discipline-dialog"
import { useDisciplinesStore } from "@/lib/disciplines-store"
import { useTranslation } from "@/lib/i18n/context"
import { formatEuro } from "@/lib/mock-data"
import { useSeasonClients } from "@/lib/seasons-store"

export function DisciplinesTable() {
  const { t } = useTranslation()
  const { disciplines, deleteDiscipline } = useDisciplinesStore()
  const { clients } = useSeasonClients()

  const enrolledCount = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of clients) {
      counts.set(c.status, (counts.get(c.status) ?? 0) + 1)
    }
    return counts
  }, [clients])

  const averagePrice = disciplines.length
    ? disciplines.reduce((sum, d) => sum + d.price, 0) / disciplines.length
    : 0

  async function handleDelete(id: string) {
    await deleteDiscipline(id)
    toast.success(t.disciplines.disciplineDeleted)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>{t.disciplines.totalDisciplines}</CardDescription>
            <CardTitle className="font-mono text-2xl tabular-nums">{disciplines.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t.disciplines.averagePrice}</CardDescription>
            <CardTitle className="font-mono text-2xl tabular-nums">{formatEuro(averagePrice)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>{t.disciplines.colLabel}</TableHead>
              <TableHead className="text-right">{t.disciplines.colPrice}</TableHead>
              <TableHead className="text-right">{t.disciplines.colEnrolled}</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {disciplines.map((discipline) => (
              <TableRow key={discipline.id}>
                <TableCell className="font-medium">{discipline.label}</TableCell>
                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                  {formatEuro(discipline.price)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {enrolledCount.get(discipline.label) ?? 0}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <AddDisciplineDialog discipline={discipline} />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t.disciplines.disciplineDeleted}
                      onClick={() => handleDelete(discipline.id)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {disciplines.length === 0 ? (
          <Empty className="border-0">
            <p className="text-sm text-muted-foreground">{t.disciplines.noDisciplines}</p>
          </Empty>
        ) : null}
      </div>
    </div>
  )
}
