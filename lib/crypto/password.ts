"use client"

import { argon2id, argon2Verify } from "hash-wasm"

/**
 * Hachage de mots de passe (comptes utilisateurs, réponses de sécurité) — distinct
 * de lib/crypto/vault.ts qui dérive une clé de chiffrement AES à partir d'un mot
 * de passe. Ici on stocke un hash Argon2id auto-descriptif (format PHC), jamais
 * le mot de passe en clair.
 */

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return argon2id({
    password,
    salt,
    iterations: 3,
    parallelism: 1,
    memorySize: 19456,
    hashLength: 32,
    outputType: "encoded",
  })
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2Verify({ password, hash })
  } catch {
    return false
  }
}

const TEMP_PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"

/** Mot de passe temporaire lisible, à communiquer une seule fois à l'utilisateur. */
export function generateTempPassword(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (b) => TEMP_PASSWORD_CHARS[b % TEMP_PASSWORD_CHARS.length]).join("")
}
