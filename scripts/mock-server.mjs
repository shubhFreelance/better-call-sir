import { createServer, request } from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
if (process.env.NODE_ENV === "production")
  throw new Error("Contract mocks are synthetic development only.");
const port = Number(process.env.MOCK_PORT || 4010),
  prismPort = Number(process.env.PRISM_PORT || 4012);
const prism = spawn(
  process.execPath,
  [
    "node_modules/@stoplight/prism-cli/dist/index.js",
    "mock",
    "contracts/openapi.yaml",
    "--host",
    "127.0.0.1",
    "--port",
    String(prismPort),
    "--errors",
  ],
  { stdio: "inherit" },
);
const server = createServer((req, res) => {
  const path = (req.url || "/").replace(/^\/api\/v1(?=\/|\?|$)/, "") || "/";
  const upstream = request(
    {
      host: "127.0.0.1",
      port: prismPort,
      path,
      method: req.method,
      headers: req.headers,
    },
    (response) => {
      res.writeHead(response.statusCode || 502, {
        ...response.headers,
        "X-BCS-Mock": "synthetic-contract",
        "Cache-Control": "no-store",
      });
      response.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(502, {
        "Content-Type": "application/json",
        "X-BCS-Mock": "synthetic-contract",
      });
      res.end(
        JSON.stringify({
          code: "MOCK_UNAVAILABLE",
          message: "The synthetic contract mock is starting or unavailable.",
          requestId: randomUUID(),
        }),
      );
    } else res.destroy();
  });
  req.on("aborted", () => upstream.destroy());
  req.pipe(upstream);
});
server.on("error", () => {
  console.error("Contract mock could not bind its loopback port.");
  prism.kill("SIGTERM");
  process.exitCode = 1;
});
prism.on("error", () => {
  console.error("Prism mock could not start.");
  server.close();
  process.exitCode = 1;
});
prism.on("exit", (code) => {
  server.closeAllConnections();
  server.close();
  if (code) process.exitCode = code;
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    server.closeAllConnections();
    server.close();
    prism.kill("SIGTERM");
  });
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Synthetic contract mock on loopback port ${port}; no authentication, persistence or providers.`,
  ),
);
