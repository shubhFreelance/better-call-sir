import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
if (process.env.NODE_ENV === "production")
  throw new Error("Contract mocks are synthetic development only.");
const contract = JSON.parse(readFileSync("contracts/openapi.yaml", "utf8"));
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const local = (schema) =>
  JSON.parse(
    JSON.stringify(schema).replaceAll(
      "#/components/schemas/",
      "urn:bcs:mock:schemas#/$defs/",
    ),
  );
// Register shared definitions once as the contract grows; each operation reuses them.
ajv.addSchema({
  $id: "urn:bcs:mock:schemas",
  $defs: local(contract.components.schemas),
});
const validate = (schema) => ajv.compile(local(schema));
const routes = Object.entries(contract.paths).map(([path, methods]) => ({
  pattern: new RegExp(
    "^" +
      path
        .split("/")
        .map((part) =>
          part.startsWith("{")
            ? "([^/]+)"
            : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        )
        .join("/") +
      "$",
  ),
  names: [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]),
  methods: Object.fromEntries(
    Object.entries(methods).map(([method, op]) => [
      method,
      {
        ...op,
        bodyValidator: op.requestBody
          ? validate(op.requestBody.content["application/json"].schema)
          : null,
        parameters: (op.parameters || []).map((p) => ({
          ...p,
          validator: validate(p.schema),
        })),
      },
    ]),
  ),
}));
// Validate committed examples once; the mock never invents resource or provider states.
for (const { methods } of routes)
  for (const op of Object.values(methods))
    for (const response of Object.values(op.responses)) {
      const media = response.content?.["application/json"];
      if (!media?.examples) continue;
      const check = validate(media.schema);
      for (const example of Object.values(media.examples))
        if (!check(example.value))
          throw new Error("Invalid committed mock response example.");
    }
const server = createServer(async (req, res) => {
  res.setHeader("X-BCS-Mock", "synthetic-contract");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  const send = (status, value) => {
    res.writeHead(status);
    res.end(JSON.stringify(value));
  };
  const error = (status, code, message) =>
    send(status, { code, message, requestId: randomUUID() });
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const path = url.pathname.replace(/^\/api\/v1(?=\/|$)/, "") || "/";
    const route = routes.find((r) => r.pattern.test(path)),
      method = (req.method || "GET").toLowerCase(),
      op = route?.methods[method];
    if (!op)
      return error(404, "NOT_FOUND", "No mock operation for this route.");
    const match = route.pattern.exec(path),
      params = Object.fromEntries(
        route.names.map((name, i) => [name, decodeURIComponent(match[i + 1])]),
      );
    for (const p of op.parameters) {
      const value =
        p.in === "path"
          ? params[p.name]
          : p.in === "query"
            ? url.searchParams.get(p.name)
            : req.headers[p.name.toLowerCase()];
      if (
        value === undefined || value === null ? p.required : !p.validator(value)
      )
        return error(
          400,
          "VALIDATION",
          "Mock request parameter is invalid: " + p.name,
        );
    }
    let size = 0,
      chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 32768)
        return error(413, "VALIDATION", "Mock request body is too large.");
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    let body;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      return error(400, "VALIDATION", "Mock request body must be JSON.");
    }
    if (op.bodyValidator && !op.bodyValidator(body))
      return error(
        400,
        "VALIDATION",
        "Mock request body does not match the contract.",
      );
    const preference = String(req.headers.prefer || "");
    const preferredCode = /\bcode=(\d{3})\b/.exec(preference)?.[1];
    const status =
      preferredCode ||
      Object.keys(op.responses).find((code) => /^2\d\d$/.test(code));
    const media = op.responses[status]?.content?.["application/json"];
    const name = /\bexample=([\w-]+)/.exec(preference)?.[1];
    const example = name
      ? media?.examples?.[name]
      : Object.values(media?.examples || {})[0];
    if (!example)
      return error(
        503,
        "MOCK_UNAVAILABLE",
        "No committed synthetic example for this operation or state.",
      );
    send(Number(status), example.value);
  } catch {
    if (!res.headersSent)
      error(400, "VALIDATION", "Unable to read the mock request.");
    else res.destroy();
  }
});
server.on("error", () => {
  console.error("Contract mock could not bind its loopback port.");
  process.exitCode = 1;
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    server.closeAllConnections();
    server.close();
  });
server.listen(Number(process.env.MOCK_PORT || 4010), "127.0.0.1", () =>
  console.log(
    "Synthetic OpenAPI example mock; no authentication, persistence or providers.",
  ),
);
