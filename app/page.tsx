"use client"

import { AlertBanner } from "@/components/dashboard/alert-banner"
import { BalanceCards } from "@/components/dashboard/balance-cards"
import { CustomizeDashboardDialog } from "@/components/dashboard/customize-dashboard-dialog"
import { FlowChart } from "@/components/dashboard/flow-chart"
import { ExpenseChart } from "@/components/dashboard/expense-chart"
import { MembersCard } from "@/components/dashboard/members-card"
import { QuickActions } from "@/components/dashboard/quick-actions"
import { useDashboardLayout, type WidgetId } from "@/hooks/use-dashboard-layout"
import { useClubSettings } from "@/lib/club-settings"
import { useTranslation } from "@/lib/i18n/context"

function renderWidget(id: WidgetId) {
  switch (id) {
    case "alerts":
      return <AlertBanner />
    case "balances":
      return <BalanceCards />
    case "members":
      return <MembersCard />
    case "flow":
      return <FlowChart />
    case "quickActions":
      return <QuickActions />
    case "expenses":
      return <ExpenseChart />
  }
}

export default function DashboardPage() {
  const { t } = useTranslation()
  const { settings } = useClubSettings()
  const { layout, toggle, move, reset } = useDashboardLayout()

  const visible = layout.filter((w) => w.visible)
  const blocks: React.ReactNode[] = []
  for (let i = 0; i < visible.length; i++) {
    const current = visible[i]
    const next = visible[i + 1]
    const isFlowActionsPair =
      next &&
      ((current.id === "flow" && next.id === "quickActions") ||
        (current.id === "quickActions" && next.id === "flow"))

    if (isFlowActionsPair) {
      blocks.push(
        <div key={`${current.id}-${next.id}`} className="grid gap-4 lg:grid-cols-3">
          <div className={current.id === "flow" ? "lg:col-span-2" : ""}>
            {renderWidget(current.id)}
          </div>
          <div className={next.id === "flow" ? "lg:col-span-2" : ""}>
            {renderWidget(next.id)}
          </div>
        </div>,
      )
      i++
      continue
    }

    blocks.push(<div key={current.id}>{renderWidget(current.id)}</div>)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">{t.dashboard.subtitle}</p>
          <h2 className="text-2xl font-semibold tracking-tight">
            {settings.name}
          </h2>
        </div>
        <CustomizeDashboardDialog
          layout={layout}
          toggle={toggle}
          move={move}
          reset={reset}
        />
      </div>

      {blocks}
    </div>
  )
}
