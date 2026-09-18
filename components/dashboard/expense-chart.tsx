"use client"

import { Cell, Label, Pie, PieChart } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { computeExpenseByCategory } from "@/lib/dashboard-stats"
import { useTranslation } from "@/lib/i18n/context"
import { formatEuro } from "@/lib/mock-data"
import { useTransactionsStore } from "@/lib/transactions-store"

const palette = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--muted-foreground)",
]

export function ExpenseChart() {
  const { t } = useTranslation()
  const { transactions } = useTransactionsStore()
  const expenseByCategory = computeExpenseByCategory(transactions)
  const total = expenseByCategory.reduce((s, e) => s + e.amount, 0)

  const chartConfig = expenseByCategory.reduce((acc, item, i) => {
    acc[item.key] = {
      label: t.categories[item.category],
      color: palette[i % palette.length],
    }
    return acc
  }, {} as ChartConfig)

  const data = expenseByCategory.map((item, i) => ({
    ...item,
    fill: palette[i % palette.length],
  }))

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>{t.dashboard.expenseChartTitle}</CardTitle>
        <CardDescription>{t.dashboard.expenseChartSubtitle}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 md:flex-row md:items-center">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square h-[200px]"
        >
          <PieChart>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  nameKey="key"
                  formatter={(value, name) => (
                    <div className="flex w-full items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {chartConfig[name as string]?.label ?? name}
                      </span>
                      <span className="font-mono font-medium tabular-nums">
                        {formatEuro(Number(value))}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Pie
              data={data}
              dataKey="amount"
              nameKey="key"
              innerRadius={55}
              outerRadius={85}
              strokeWidth={2}
            >
              {data.map((entry) => (
                <Cell key={entry.key} fill={entry.fill} />
              ))}
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy ?? 0) - 6}
                          className="fill-foreground font-mono text-lg font-semibold"
                        >
                          {formatEuro(total)}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy ?? 0) + 14}
                          className="fill-muted-foreground text-xs"
                        >
                          {t.dashboard.totalExpenses}
                        </tspan>
                      </text>
                    )
                  }
                  return null
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>

        <ul className="flex flex-1 flex-col gap-2">
          {data.map((entry) => (
            <li key={entry.key} className="flex items-center gap-2 text-sm">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: entry.fill }}
              />
              <span className="flex-1 truncate text-muted-foreground">
                {t.categories[entry.category]}
              </span>
              <span className="font-mono font-medium tabular-nums">
                {formatEuro(entry.amount)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
