"use client"

import { useEffect, useState } from "react"
import { PlusIcon, ShieldAlertIcon, TrashIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAuth } from "@/lib/auth-context"
import { generateTempPassword, hashPassword } from "@/lib/crypto/password"
import { useTranslation } from "@/lib/i18n/context"
import type { Role } from "@/lib/mock-data"
import type { DbUser } from "@/types/electron"

const ROLES: Role[] = ["admin", "tresorier", "president", "secretaire"]

function api() {
  return typeof window !== "undefined" ? window.electronAPI : undefined
}

export default function UsersPage() {
  const { t } = useTranslation()
  const { session } = useAuth()
  const [users, setUsers] = useState<DbUser[]>([])
  const [loaded, setLoaded] = useState(false)

  async function refresh() {
    const electronApi = api()
    if (!electronApi) {
      setLoaded(true)
      return
    }
    setUsers(await electronApi.db.getUsers())
    setLoaded(true)
  }

  useEffect(() => {
    refresh()
  }, [])

  if (session?.role !== "admin") {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldAlertIcon />
          </EmptyMedia>
          <EmptyTitle>{t.settings.accessDenied}</EmptyTitle>
          <EmptyDescription>{t.settings.accessDeniedHint}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  async function changeRole(id: string, role: Role) {
    const electronApi = api()
    if (!electronApi) return
    await electronApi.db.updateUser(id, { role })
    await refresh()
  }

  async function resetPassword(id: string) {
    const electronApi = api()
    if (!electronApi) return
    const tempPassword = generateTempPassword()
    const passwordHash = await hashPassword(tempPassword)
    await electronApi.db.updateUser(id, { passwordHash })
    toast.success(t.users.resetPasswordDone, { description: tempPassword, duration: 30000 })
  }

  async function deleteUser(id: string) {
    if (id === session?.id) {
      toast.error(t.users.cannotDeleteSelf)
      return
    }
    const electronApi = api()
    if (!electronApi) return
    await electronApi.db.deleteUser(id)
    await refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">{t.users.title}</h2>
          <p className="text-sm text-muted-foreground">{t.users.subtitle}</p>
        </div>
        <InviteUserDialog onCreated={refresh} />
      </div>

      {loaded ? (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>{t.users.colName}</TableHead>
                <TableHead>{t.users.colEmail}</TableHead>
                <TableHead>{t.users.colRole}</TableHead>
                <TableHead className="w-56" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    {u.id === session.id ? (
                      <Badge variant="outline">{t.roles[u.role as Role]}</Badge>
                    ) : (
                      <Select
                        value={u.role}
                        onValueChange={(v) => v && changeRole(u.id, v as Role)}
                      >
                        <SelectTrigger size="sm" className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {t.roles[r]}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <ResetPasswordDialog onConfirm={() => resetPassword(u.id)} />
                      {u.id !== session.id ? (
                        <DeleteUserDialog onConfirm={() => deleteUser(u.id)} />
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  )
}

function InviteUserDialog({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<Role>("secretaire")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const electronApi = api()
    if (!electronApi) return
    const tempPassword = generateTempPassword()
    const passwordHash = await hashPassword(tempPassword)
    await electronApi.db.createUser({ name, email, passwordHash, role })
    setOpen(false)
    setName("")
    setEmail("")
    setRole("secretaire")
    onCreated()
    toast.success(t.users.userCreated, { description: `${email} · ${tempPassword}`, duration: 30000 })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <PlusIcon data-icon="inline-start" />
            {t.users.invite}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t.users.inviteTitle}</DialogTitle>
            <DialogDescription>{t.users.inviteDescription}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="invite-name">{t.users.colName}</FieldLabel>
              <Input id="invite-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-email">{t.users.colEmail}</FieldLabel>
              <Input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>{t.users.colRole}</FieldLabel>
              <Select value={role} onValueChange={(v) => v && setRole(v as Role)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {t.roles[r]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline">{t.common.cancel}</Button>} />
            <Button type="submit">{t.common.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordDialog({ onConfirm }: { onConfirm: () => void }) {
  const { t } = useTranslation()
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        {t.users.resetPassword}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.users.resetPasswordConfirmTitle}</DialogTitle>
          <DialogDescription>{t.users.resetPasswordConfirmDescription}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{t.common.cancel}</DialogClose>
          <DialogClose render={<Button onClick={onConfirm} />}>
            {t.users.resetPassword}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteUserDialog({ onConfirm }: { onConfirm: () => void }) {
  const { t } = useTranslation()
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t.users.deleteUser} />}>
        <TrashIcon />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.users.deleteConfirmTitle}</DialogTitle>
          <DialogDescription>{t.users.deleteConfirmDescription}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{t.common.cancel}</DialogClose>
          <DialogClose render={<Button variant="destructive" onClick={onConfirm} />}>
            {t.users.deleteUser}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
