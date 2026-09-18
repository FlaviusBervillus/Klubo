"use client"

import { argon2id } from "hash-wasm"

/**
 * Coffre-fort local chiffré : dérive une clé AES-256 depuis un mot de passe
 * avec Argon2id (OWASP-recommandé), puis chiffre/déchiffre avec AES-256-GCM
 * (Web Crypto native). Aucune donnée en clair n'est jamais persistée.
 */

export interface EncryptedVault {
  saltB64: string
  ivB64: string
  ciphertextB64: string
}

const ARGON2_ITERATIONS = 3
const ARGON2_MEMORY_KIB = 65536 // 64 Mo
const ARGON2_PARALLELISM = 1
const KEY_LENGTH_BYTES = 32 // AES-256

function toBase64(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(b64: string) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function deriveKey(passphrase: string, salt: Uint8Array) {
  const keyHex = await argon2id({
    password: passphrase,
    salt,
    iterations: ARGON2_ITERATIONS,
    memorySize: ARGON2_MEMORY_KIB,
    parallelism: ARGON2_PARALLELISM,
    hashLength: KEY_LENGTH_BYTES,
    outputType: "hex",
  })
  const keyBytes = new Uint8Array(
    keyHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)),
  )
  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  )
}

export async function encryptVault(
  passphrase: string,
  plaintext: string,
): Promise<EncryptedVault> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  return {
    saltB64: toBase64(salt),
    ivB64: toBase64(iv),
    ciphertextB64: toBase64(new Uint8Array(ciphertext)),
  }
}

/** Lève une erreur si le mot de passe est incorrect (échec d'authentification GCM). */
export async function decryptVault(
  passphrase: string,
  vault: EncryptedVault,
): Promise<string> {
  const salt = fromBase64(vault.saltB64)
  const iv = fromBase64(vault.ivB64)
  const key = await deriveKey(passphrase, salt)
  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    fromBase64(vault.ciphertextB64),
  )
  return new TextDecoder().decode(plainBuffer)
}
