const http = require("http")
const fs = require("fs")
const path = require("path")

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".map": "application/json; charset=utf-8",
}

function resolveSafePath(rootDir, requestUrl) {
  const decoded = decodeURIComponent((requestUrl || "/").split("?")[0])
  const resolved = path.normalize(path.join(rootDir, decoded))
  const normalizedRoot = path.normalize(rootDir)
  if (!resolved.startsWith(normalizedRoot)) return null
  return resolved
}

/** Serveur HTTP minimal pour l'export statique Next.js — utilisé par `bun run serve` et par Electron. */
function createStaticServer(rootDir) {
  return http.createServer((req, res) => {
    const filePath = resolveSafePath(rootDir, req.url)
    if (!filePath) {
      res.writeHead(400, { "Content-Type": "text/plain" })
      res.end("Bad request")
      return
    }

    fs.stat(filePath, (statErr, stats) => {
      const target =
        !statErr && stats.isDirectory()
          ? path.join(filePath, "index.html")
          : filePath

      fs.readFile(target, (readErr, data) => {
        if (readErr) {
          fs.readFile(path.join(rootDir, "404.html"), (fallbackErr, fallbackData) => {
            if (fallbackErr) {
              res.writeHead(404, { "Content-Type": "text/plain" })
              res.end("Not found")
              return
            }
            res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" })
            res.end(fallbackData)
          })
          return
        }
        const ext = path.extname(target)
        res.writeHead(200, {
          "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
        })
        res.end(data)
      })
    })
  })
}

module.exports = { createStaticServer }
