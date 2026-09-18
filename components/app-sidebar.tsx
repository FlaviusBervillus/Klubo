"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboardIcon,
  ReceiptTextIcon,
  UsersIcon,
  UserCogIcon,
  FileBarChartIcon,
  SettingsIcon,
  SwordIcon,
  LogOutIcon,
} from "lucide-react"

import { AccountDialog } from "@/components/account/account-dialog"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useAuth } from "@/lib/auth-context"
import { useClubSettings } from "@/lib/club-settings"
import { useTranslation } from "@/lib/i18n/context"
import { normalizePathname } from "@/lib/utils"
import { useTransactionsStore } from "@/lib/transactions-store"

const SETTINGS_ROLES = ["admin", "tresorier", "president"]

export function AppSidebar() {
  const pathname = normalizePathname(usePathname())
  const { session, logout } = useAuth()
  const { t } = useTranslation()
  const { settings } = useClubSettings()
  const { transactions } = useTransactionsStore()
  const toCategorizeCount = transactions.filter((t) => t.status === "a_categoriser").length

  const nav = [
    { title: t.nav.dashboard, href: "/", icon: LayoutDashboardIcon },
    {
      title: t.nav.transactions,
      href: "/transactions",
      icon: ReceiptTextIcon,
      badge: toCategorizeCount,
    },
    { title: t.nav.clients, href: "/clients", icon: UsersIcon },
    { title: t.nav.reports, href: "/rapports", icon: FileBarChartIcon },
    ...(session && SETTINGS_ROLES.includes(session.role)
      ? [{ title: t.nav.settings, href: "/parametres", icon: SettingsIcon }]
      : []),
    ...(session?.role === "admin"
      ? [{ title: t.nav.users, href: "/utilisateurs", icon: UserCogIcon }]
      : []),
  ]

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-3 px-2 py-3">
          <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            {settings.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.logoUrl}
                alt={settings.name}
                className="size-full object-cover"
              />
            ) : (
              <SwordIcon className="size-5" />
            )}
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">{settings.name}</span>
            <span className="text-xs text-sidebar-foreground/60">
              {settings.season}
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarMenu>
            {nav.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href)
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={active}
                    tooltip={item.title}
                    render={<Link href={item.href} />}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                  {item.badge ? (
                    <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {session ? (
          <div className="flex items-center gap-1 rounded-lg bg-sidebar-accent px-1 py-1.5">
            <AccountDialog
              trigger={
                <button
                  type="button"
                  className="flex flex-1 items-center gap-3 rounded-md px-2 py-1 text-left hover:bg-sidebar-primary/10"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/20 text-xs font-semibold text-sidebar-primary-foreground">
                    {initials(session.name)}
                  </span>
                  <span className="flex flex-1 flex-col leading-tight">
                    <span className="text-sm font-medium">{session.name}</span>
                    <span className="text-xs text-sidebar-foreground/60">
                      {t.roles[session.role]}
                    </span>
                  </span>
                </button>
              }
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t.common.logout}
              onClick={logout}
            >
              <LogOutIcon />
            </Button>
          </div>
        ) : null}
      </SidebarFooter>
    </Sidebar>
  )
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}
