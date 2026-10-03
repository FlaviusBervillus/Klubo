"use client"

import { UsersIcon } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useSeasonClients } from "@/lib/seasons-store"
import { useTranslation } from "@/lib/i18n/context"

// Les disciplines sont une liste libre (voir /disciplines) : on groupe directement par le statut
// réellement présent sur les fiches clients, plutôt que par une liste figée de cours.
const DOT_COLOR_CYCLE = [
  "bg-[oklch(0.55_0.13_265)]",
  "bg-[oklch(0.6_0.1_200)]",
  "bg-success",
  "bg-warning",
  "bg-muted-foreground",
  "bg-destructive",
]
const UNCATEGORIZED_DOT = "bg-border"

export function MembersCard() {
  const { t } = useTranslation()
  const { clients } = useSeasonClients()

  const distinctStatuses = Array.from(new Set(clients.map((c) => c.status))).filter(
    (s) => s !== "Non catégorisé",
  )
  const counts = distinctStatuses
    .map((status, index) => ({
      status,
      count: clients.filter((c) => c.status === status).length,
      dot: DOT_COLOR_CYCLE[index % DOT_COLOR_CYCLE.length],
    }))
    .filter((c) => c.count > 0)
  const uncategorizedCount = clients.filter((c) => c.status === "Non catégorisé").length
  if (uncategorizedCount > 0) {
    counts.push({ status: "Non catégorisé", count: uncategorizedCount, dot: UNCATEGORIZED_DOT })
  }

  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <UsersIcon className="size-4" />
          {t.dashboard.membersTitle}
        </CardDescription>
        <CardTitle className="font-mono text-3xl tabular-nums">
          {clients.length}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          {t.dashboard.membersSubtitle}
        </p>
        <ul className="flex flex-col gap-1.5">
          {counts.map((c) => (
            <li key={c.status} className="flex items-center gap-2 text-sm">
              <span
                className={`size-2.5 shrink-0 rounded-full ${c.dot}`}
              />
              <span className="flex-1 truncate text-muted-foreground">
                {t.courseTypes[c.status] ?? c.status}
              </span>
              <span className="font-mono font-medium tabular-nums">
                {c.count}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
