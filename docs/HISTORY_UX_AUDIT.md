# B12 / H5 / F25 scope audit — 18 October 2026

Owner request: complete remaining bounded histories and legacy/mobile/keyboard/loading/error/empty states. Preserve the focused teacher-discovery and hiring scope.

## Full histories required in the current journey

- Guardian enquiry list and regional operator matching queue: stable owner/region-filtered pages; filter before pagination.
- Teacher reviewer directory: server-side status and reviewer-region filters before pages.
- Private evidence and immutable screening checks: teacher-bound pages, current application checks and existing independent review remain authoritative.
- Immutable matching runs: request/version/date/ID ordering; regional authorization before cursor validation.
- Private notes: owner or currently authorized named teacher only; revoked sharing/consent removes cursor access. Privacy note selection must also reach older notes.
- Administrator recovery jobs: sanitized pages; completed/retried boundaries remain usable, no payload exposure.
- Administrator account linkage: account-bound learner pages, no truncation at 50.
- Teacher availability and active leave: paired ID boundaries allow both lists to finish independently; ownership is checked before reading either stream.
- Optional hiring demos: owner/teacher/region and current-consent filtering before stable date/ID pages; staff dispute status filtering and request-bound histories use the same API.
- Existing learner/device, independent enquiry/supporter/device, hiring overview, support conversation, finance staff, audit, privacy, deletion-ledger, public search and waitlist pagination: regression/recovery review; do not create duplicate endpoints.

## Intentional limits, not hidden histories

- Matching candidate pools are deliberately capped and record pool-limited evidence. Pagination must not silently change ranking or eligibility.
- Dashboard previews and regional supply/report-region snapshots explicitly state their limits; dedicated paginated workspaces carry the operational records. Commercial region editing remains B3.
- The development account picker is a bounded allowlist of synthetic accounts, not an account directory.
- Published shortlist size is an explicit reviewed product choice, not an incomplete history.

## Scope decisions

Multiple simultaneous unfinished enquiry drafts are not required by a current acceptance criterion. One separate additional-enquiry draft already supports save/resume, explicit discard and post-submission restart; existing enquiries are independent and remain reachable. Do not add parallel-draft complexity without a demonstrated requirement.

Optional demo history remains relevant for already requested hiring demos; the scoped pagination API is implemented in d81009d, with frontend integration complete in request review, demo history and staff dispute queues. Class-specific lesson/timetable/recurring/payable histories and new class workflows remain in the owner's explicitly deferred class-management scope. Existing screens/data remain available; shared control/accessibility fixes may improve them without adding class functionality or accepting live payments/Meet. No deferred item is marked accepted for launch.

## Frontend acceptance for this increment

Connect the required history APIs; preserve all entered data and exact uncertain-write retry identities; lock navigation during decisions; hide private cached results after denied/failed reads; retry a failed page or reload from the beginning. Apply shared controls to retained native action/text fields, retaining native labelled selects and checkbox/radio semantics. Check representative routes at 320/360/390/430px, keyboard focus, serious/critical accessibility failures, long authored content, and loading/error/empty/retry states in English/Hindi. Physical devices and live-provider qualification remain separate release evidence.

## Completed development review

All remaining raw action buttons and text fields in application screens use shared shadcn primitives. Native labelled selects, checkboxes and radios remain because they retain platform semantics and existing keyboard behavior; replacing them adds no required capability. Phone controls meet the checked 44px targets, fieldsets/cards shrink correctly and long content wraps. Optional-demo edits lock list navigation until explicit discard or confirmed save; uncertain writes retain their exact key/body. Queue/read failures hide private case, demo, finance and administrative details while preserving recovery controllers. Linked staff support assessments open the full paginated case history in a separate tab, preserving unsaved review. Cold-load teacher search waits for client readiness before accepting filters.

Acceptance spans all role dashboards, onboarding, discovery/manual and assisted hiring, support/replacement, privacy/reviewer/admin/finance and retained legacy routes. Automated browser, keyboard, axe, loading/error/empty/recovery and English/Hindi phone-width evidence is recorded in SPRINTS.md. Physical devices, live providers and release qualification remain explicitly unaccepted. No extra simultaneous drafts or deferred class histories were added.
