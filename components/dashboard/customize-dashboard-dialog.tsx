"use client"

import { ArrowDownIcon, ArrowUpIcon, SlidersHorizontalIcon } from "lucide-react"

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
import { Switch } from "@/components/ui/switch"
import type { WidgetConfig, WidgetId } from "@/hooks/use-dashboard-layout"
import { useTranslation } from "@/lib/i18n/context"

export function CustomizeDashboardDialog({
  layout,
  toggle,
  move,
  reset,
}: {
  layout: WidgetConfig[]
  toggle: (id: WidgetId) => void
  move: (id: WidgetId, direction: -1 | 1) => void
  reset: () => void
}) {
  const { t } = useTranslation()

  const widgetLabels: Record<WidgetId, string> = {
    alerts: t.dashboard.widgetAlerts,
    balances: t.dashboard.widgetBalances,
    members: t.dashboard.widgetMembers,
    flow: t.dashboard.widgetFlow,
    quickActions: t.dashboard.widgetQuickActions,
    expenses: t.dashboard.widgetExpenses,
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <SlidersHorizontalIcon data-icon="inline-start" />
            {t.dashboard.customize}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.dashboard.customizeDialogTitle}</DialogTitle>
          <DialogDescription>
            {t.dashboard.customizeDialogDescription}
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-1">
          {layout.map((widget, index) => (
            <li
              key={widget.id}
              className="flex items-center gap-2 rounded-lg border px-3 py-2"
            >
              <span className="flex-1 truncate text-sm font-medium">
                {widgetLabels[widget.id]}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t.dashboard.moveUp}
                disabled={index === 0}
                onClick={() => move(widget.id, -1)}
              >
                <ArrowUpIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t.dashboard.moveDown}
                disabled={index === layout.length - 1}
                onClick={() => move(widget.id, 1)}
              >
                <ArrowDownIcon />
              </Button>
              <Switch
                checked={widget.visible}
                onCheckedChange={() => toggle(widget.id)}
                aria-label={widgetLabels[widget.id]}
              />
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={reset}>
            {t.common.reset}
          </Button>
          <DialogClose render={<Button type="button" />}>
            {t.common.save}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
