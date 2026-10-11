# Foundation contract mocks (S1-03 / S1-06)

`npm run dev:mock` starts Prism on loopback port 4010 directly from `contracts/openapi.yaml`. No PostgreSQL, providers or separate mock implementation are involved. The foundation discovery, OTP/session, consent, child-list and tuition-intake operations have named synthetic examples and explicit response schemas. `npm run contract:lint` checks OpenAPI structure and references; `npm run test:mock` launches its own instance on port 4111 and exercises successes, invalid requests and selectable failure responses.

The small loopback gateway strips `/api/v1` before forwarding to Prism and adds `X-BCS-Mock: synthetic-contract` plus `Cache-Control: no-store`. Both direct and prefixed routes work. For a manual frontend exercise, stop the existing web process and run:

```bash
API_INTERNAL_URL=http://127.0.0.1:4010 npm run dev -w @bcs/web
```

The automated browser intake test intercepts the browser's API transport and forwards it to this actual contract-generated mock. It verifies request success and a consent failure without writing to the real API. Public SSR in that test still uses the real development API; public mock responses are separately checked in the mock HTTP suite. Mock session cookies are synthetic fixtures, not authentication evidence. The gateway refuses production startup and uses loopback ports only.

For request fixtures, use `Cookie: bcs_access=synthetic-mock-session`, `X-CSRF-Token: synthetic-mock-csrf`, `Origin: http://localhost:3000` and an `Idempotency-Key`. Request a documented failure with `Prefer: code=401`, `403`, `409` or `503`. The named example is selected with `Prefer: example=synthetic` (or `example=failure` for an error).

Mocks return examples and validate contract shapes; they do not authenticate users, verify an adult, persist a request, enforce family ownership or process retry keys. All those acceptance checks remain in the real PostgreSQL API tests. Never use a mock pass as production or Phase 1 ownership evidence. Use only synthetic input.

Later-phase generic response schemas remain open work in their phases. The unused generic `List` component currently produces one non-blocking lint warning.
