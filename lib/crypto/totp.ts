"use client"

/**
 * TOTP (RFC 6238) — code à 6 chiffres compatible Google Authenticator / Authy / etc., utilisé
 * comme second facteur pour la récupération de mot de passe (voir lib/auth-context.tsx). Tout se
 * calcule localement (HMAC-SHA1 via Web Crypto) : aucun serveur, aucun envoi d'email/SMS requis.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
const TOTP_PERIOD_SECONDS = 30
const TOTP_DIGITS = 6

function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ""
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

function base32Decode(encoded: string): Uint8Array {
  const clean = encoded.toUpperCase().replace(/[^A-Z2-7]/g, "")
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) continue
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(bytes)
}

/** Nouvelle clé secrète TOTP (160 bits, taille recommandée par la RFC) — pas encore enregistrée
 * tant que l'utilisateur n'a pas confirmé l'avoir bien configurée (voir confirmTotp). */
export function generateTotpSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  return base32Encode(bytes)
}

/** URI standard "otpauth://" — certaines applis d'authentification peuvent la coller directement
 * (import par lien), en plus de la saisie manuelle de la clé. */
export function generateTotpUri(secret: string, accountLabel: string, issuer = "Klubo"): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`)
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`
}

async function hmacSha1(keyBytes: Uint8Array, messageBytes: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", key, messageBytes as BufferSource)
  return new Uint8Array(signature)
}

async function computeTotpCode(secret: string, timeStep: number): Promise<string> {
  const keyBytes = base32Decode(secret)
  const message = new DataView(new ArrayBuffer(8))
  // DataView ne propose pas de setBigUint64 compatible partout en toute sécurité ici : on écrit
  // les 4 octets de poids fort (toujours à 0 avant l'an ~2106) puis les 4 de poids faible.
  message.setUint32(0, 0)
  message.setUint32(4, timeStep)
  const hmac = await hmacSha1(keyBytes, new Uint8Array(message.buffer))
  const offset = hmac[hmac.length - 1] & 0x0f
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  const code = binary % 10 ** TOTP_DIGITS
  return String(code).padStart(TOTP_DIGITS, "0")
}

/** Vérifie un code à 6 chiffres, en tolérant un léger décalage d'horloge (±1 période de 30s, comme
 * la plupart des implémentations TOTP grand public). */
export async function verifyTotpCode(secret: string, code: string, window = 1): Promise<boolean> {
  const cleanCode = code.trim()
  if (!/^\d{6}$/.test(cleanCode)) return false
  const currentStep = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS)
  for (let delta = -window; delta <= window; delta++) {
    const candidate = await computeTotpCode(secret, currentStep + delta)
    if (candidate === cleanCode) return true
  }
  return false
}
