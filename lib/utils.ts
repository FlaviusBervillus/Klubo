import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * next.config.mjs sets `trailingSlash: true` (requis pour l'export statique),
 * donc usePathname() renvoie "/page/" plutôt que "/page". On normalise avant
 * toute comparaison exacte de route.
 */
export function normalizePathname(pathname: string | null) {
  if (!pathname) return "/"
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1)
  return pathname
}
