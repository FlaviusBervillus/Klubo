"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { computeMonthlyFlow } from "@/lib/dashboard-stats"
import { useTranslation } from "@/lib/i18n/context"
import { useTransactionsStore } from "@/lib/transactions-store"

export function FlowChart() {
  const { t } = useTranslation()
  const { transactions } = useTransactionsStore()
  const monthlyFlow = computeMonthlyFlow(transactions)
  const chartConfig = {
    entrees: { label: t.dashboard.flowIn, color: "var(--chart-5)" },
    sorties: { label: t.dashboard.flowOut, color: "var(--chart-1)" },
  } satisfies ChartConfig

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>{t.dashboard.flowChartTitle}</CardTitle>
        <CardDescription>{t.dashboard.flowChartSubtitle}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <ChartContainer config={chartConfig} className="h-[280px] w-full">
          <BarChart data={monthlyFlow} barGap={4}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={48}
              tickFormatter={(v) => `${v} €`}
            />
            <ChartTooltip
              content={<ChartTooltipContent />}
              cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="entrees" fill="var(--color-entrees)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="sorties" fill="var(--color-sorties)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
