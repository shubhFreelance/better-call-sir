# ADR 001: separate applications, synthetic development boundary

Accepted for development, 11 October 2026. Source: PRD Sections 2–5 and 11.

Use a single npm workspace repository with independently built Next.js web, NestJS modular API, and outbox worker. Only the API owns authorization and writes. The web consumes public API projections server-side and authenticated resources through the same-origin API proxy. Shared TypeScript clients contain no database code. PostgreSQL is the transactional source of truth; Prisma 7 uses the maintained pg adapter. Explicit SQL adds half-open reservation exclusion, financial checks, and append-only audit protection.

API modules group identity/consent, catalog, requests, teachers, matching, revision, placements, learning records, notes, support, memberships and administration. Shared persistence provides transactions, session validation and common consent/ownership checks. As use cases grow, extract domain services within their module instead of introducing one interface per function.

Development fixtures are entirely synthetic. OTP codes are visible only from the development adapter; adult verification is pre-seeded for those synthetic adults, not granted by an OTP or checkbox. The development session selector can access only fixture phone identities. All live startup is fail-closed: no production process starts until reviewed adapters and controls replace the development boundary. Sandbox capture is an explicitly named development API and does not masquerade as a verified provider webhook. Synthetic outbox delivery marks only demo notifications processed; refund and payout reconciliation is unimplemented and cannot be acknowledged as settled.

Critical invariants live on the server/database: consent precedes child writes, student sessions cannot inherit guardian permissions, overlapping holds are excluded across reservation kinds, retry keys include principal/operation/resource, stale state edits return conflict, capture does not imply payout, and financial/admin edits do not rewrite audit history. Required production adapters, state transitions, full entity ownership foreign keys, and provider approvals remain tracked in the delivery board.

A single VPS pilot is later work. No host deployment, live checkout, model training or legal compliance is claimed by this implementation.

The [Phase 1 acceptance record](../PHASE_1_ACCEPTANCE.md) maps module ownership, actual role permissions, the OTP/adult-verification/MFA integration boundary and evidence scope. Later-phase slices remain separate from foundation acceptance.
