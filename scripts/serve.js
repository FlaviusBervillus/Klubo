const path = require("path")
const { createStaticServer } = require("./static-server")

const PORT = process.env.PORT ? Number(process.env.PORT) : 4173
const outDir = path.join(__dirname, "..", "out")

const server = createStaticServer(outDir)
server.listen(PORT, () => {
  console.log(`Klubo servi sur http://localhost:${PORT}`)
  console.log("(Ctrl+C pour arrêter)")
})
