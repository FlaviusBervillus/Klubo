#!/usr/bin/env node
// Publie une nouvelle version : bump du package.json, commit, push, puis tag qui
// déclenche le build + la Release GitHub Actions (voir .github/workflows/release.yml).
const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")

const ROOT = path.join(__dirname, "..")
const PKG_PATH = path.join(ROOT, "package.json")

function run(cmd) {
  console.log(`$ ${cmd}`)
  execSync(cmd, { cwd: ROOT, stdio: "inherit" })
}

function runCapture(cmd) {
  return execSync(cmd, { cwd: ROOT }).toString().trim()
}

function bumpVersion(current, kind) {
  const [major, minor, patch] = current.split(".").map(Number)
  if (kind === "major") return `${major + 1}.0.0`
  if (kind === "minor") return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

function fail(message) {
  console.error(`\n❌ ${message}`)
  process.exit(1)
}

const arg = process.argv[2] || "patch"
const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"))
const currentVersion = pkg.version

let nextVersion
if (["patch", "minor", "major"].includes(arg)) {
  nextVersion = bumpVersion(currentVersion, arg)
} else if (/^\d+\.\d+\.\d+$/.test(arg)) {
  nextVersion = arg
} else {
  fail(`Argument invalide : "${arg}". Utilise "patch", "minor", "major", ou un numéro exact (ex. 1.2.0).`)
}

const branch = runCapture("git rev-parse --abbrev-ref HEAD")
if (branch !== "main") {
  fail(`Tu es sur la branche "${branch}", pas "main". Change de branche avant de publier une release.`)
}

const dirty = runCapture("git status --porcelain")
if (dirty) {
  fail(`Ton arbre de travail n'est pas propre — commite ou range tes changements d'abord :\n${dirty}`)
}

const tag = `v${nextVersion}`
const existingTags = runCapture("git tag -l").split("\n")
if (existingTags.includes(tag)) {
  fail(`Le tag ${tag} existe déjà.`)
}

console.log(`Version : ${currentVersion} -> ${nextVersion}`)

pkg.version = nextVersion
fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + "\n")

run("git add package.json")
run(`git commit -m "Bump version to ${nextVersion}"`)
run("git push origin main")
run(`git tag ${tag}`)
run(`git push origin ${tag}`)

console.log(`\n✅ Release ${tag} déclenchée.`)
console.log("   Suivi du build : https://github.com/FlaviusBervillus/Klubo/actions")
console.log(`   Release à venir : https://github.com/FlaviusBervillus/Klubo/releases/tag/${tag}`)
