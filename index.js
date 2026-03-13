import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const server = new McpServer({
  name: "HTTP MCP",
  version: "1.0.0",
})

function parseHeaders(lines) {
  const headers = []

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.includes(":")) {
      const [name, ...rest] = trimmed.split(":")
      const value = rest.join(":").trim()

      headers.push({
        name: name.trim(),
        value
      })
    }
  }

  return headers
}

function buildHeadersXml(headers) {
  return headers.map(h => `
<elementProp name="" elementType="Header">
<stringProp name="Header.name">${h.name}</stringProp>
<stringProp name="Header.value">${h.value}</stringProp>
</elementProp>
`).join("\n")
}

function parseUrlData(inputUrl) {

  const url = new URL(inputUrl)

  const protocol = url.protocol.replace(":", "")
  const server = url.hostname
  const pathUrl = url.pathname || "/"
  const port = url.port || ""

  const domainBase = server.split(".")[0]

  return {
    protocol,
    server,
    path: pathUrl,
    port,
    domainBase
  }
}

function parseUserInput(input) {

  const lines = input.trim().split("\n")

  const firstLine = lines[0].split(" ")

  let method = "GET"
  let url = ""

  if (firstLine.length === 1) {
    url = firstLine[0]
  } else {
    method = firstLine[0].toUpperCase()
    url = firstLine[1]
  }

  const remaining = lines.slice(1)

  let headerLines = []
  let bodyLines = []

  let bodyStarted = false

  for (const line of remaining) {

    const trimmed = line.trim()

    if (trimmed.startsWith("{") || bodyStarted) {
      bodyStarted = true
      bodyLines.push(line)
      continue
    }

    headerLines.push(line)
  }

  const headers = parseHeaders(headerLines)
  const body = bodyLines.join("\n")

  return { method, url, headers, body }
}

function generarJmxDesdeUrl(inputUrl, method, body, headers) {

  const methodsWithBody = ["POST", "PUT", "PATCH"]
  const hasBody = methodsWithBody.includes(method)

  const data = parseUrlData(inputUrl)

  const templatePath = path.join(__dirname, "template.jmx")
  const outputPath = path.join(__dirname, `${data.domainBase}.jmx`)

  let xml = fs.readFileSync(templatePath, "utf8")

  // nombres JMeter
  xml = xml.replaceAll("SC_TC_Cambiar", `SC_${data.domainBase}`)
  xml = xml.replaceAll("GH_TC_Cambiar", `GH_${data.domainBase}`)
  xml = xml.replaceAll("Tx_TC_Cambiar", `Tx_${data.domainBase}`)
  xml = xml.replaceAll("Req_TC_Cambiar", `Req_${data.domainBase}`)

  // config HTTP
  xml = xml.replaceAll("PROTOCOL_CAMBIAR", data.protocol)
  xml = xml.replaceAll("SERVER_CAMBIAR", data.server)
  xml = xml.replaceAll("PATH_CAMBIAR", data.path)
  xml = xml.replaceAll("PORT_CAMBIAR", data.port)
  xml = xml.replaceAll("METHOD_CAMBIAR", method)

  // body
  xml = xml.replace("POST_BODY_RAW_CAMBIAR", hasBody ? "true" : "false")
  xml = xml.replace("BODY_CAMBIAR", body || "")

  // headers
  const headersXml = buildHeadersXml(headers)
  xml = xml.replace("HEADERS_CAMBIAR", headersXml)

  fs.writeFileSync(outputPath, xml)

  return outputPath
}

server.tool(
  "generate_jmx_from_url",
  "Genera script JMeter desde URL",
  {
    input: z.string()
  },
  async ({ input }) => {

    const { method, url, headers, body } = parseUserInput(input)

    const file = generarJmxDesdeUrl(url, method, body, headers)

    return {
      content: [
        {
          type: "text",
          text: `JMX generado con método ${method}:\n${file}`
        }
      ]
    }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)