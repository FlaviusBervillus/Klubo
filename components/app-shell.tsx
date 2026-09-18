"use client"

import { usePathname } from "next/navigation"
import { MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"

import { AppSidebar } from "@/components/app-sidebar"
import { LanguageToggle } from "@/components/language-toggle"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { useTranslation } from "@/lib/i18n/context"
import { normalizePathname } from "@/lib/utils"

function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme()
  const { t } = useTranslation()
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t.header.toggleTheme}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <SunIcon className="dark:hidden" />
      <MoonIcon className="hidden dark:block" />
    </Button>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = normalizePathname(usePathname())
  const { t } = useTranslation()

  if (pathname === "/login") {
    return <>{children}</>
  }

  const titles: Record<string, string> = {
    "/": t.dashboard.title,
    "/transactions": t.nav.transactions,
    "/clients": t.nav.clients,
    "/rapports": t.nav.reports,
    "/parametres": t.nav.settings,
    "/utilisateurs": t.nav.users,
  }
  const title =
    titles[pathname] ??
    (pathname.startsWith("/transactions") ? t.transactionDetail.pageTitle : "")

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 !h-5" />
          <h1 className="text-base font-semibold">{title}</h1>
          <div className="ml-auto flex items-center gap-1">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
