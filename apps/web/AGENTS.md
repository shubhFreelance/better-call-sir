## Better Call Sir frontend

Owner design memory (25 October 2026): `filter-button` means the reusable white/lavender action-button design in `components/ui/filter-button.tsx`. Use `FilterButton` (white by default, `accent` for lavender) and `FilterButtonGroup` for its full-width #EEF5F3 tray. Prefer these components wherever this named design is requested. Preserve button/link semantics, disabled states, keyboard focus, hover feedback and phone stacking. See `docs/FRONTEND_DESIGN.md` at the repository root for usage.

Frontend features belong on `feat/frontend-implementation`; backend/API changes belong on `feat/backend-completion`. Keep backend changes in dedicated tested commits and bring required contracts into the frontend branch as dependencies.

Owner standing rule (25 October 2026): whenever two or three action buttons are arranged horizontally, use `FilterButtonGroup` with `FilterButton`; use `accent` for the main action. Keep explicit submit/button types, links, disabled/uncertain-state locks and keyboard behavior intact. Semantic tabs and status filters retain their existing shared components.

Use the installed `../../.agents/skills/frontend-design/SKILL.md` and read `../../docs/FRONTEND_DESIGN.md` before frontend design work. The owner chose shadcn/ui and supplied the Wispr Flow palette: teal `#034F46`, lavender `#F0D7FF`, cream `#FFFFEB`, white and charcoal neutrals. Preserve these tokens and use the shared component system for new screens. Complete login, onboarding, search and dashboard flows with visible labels, accessible controls and API-confirmed results; track unfinished workflows in the sprint board.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

Owner modal pattern (25 October 2026): reuse components/ui/modal.tsx for popups with controlled open/onOpenChange, title and optional description. Preserve the teal header, lavender controls, ivory body, keyboard focus, Escape/backdrop closing and focus restoration. Private document previews use an eye beside scan status, load currently authorized scanner-cleared evidence only while open, request a fresh URL on reopening, and remove the image on close.
Owner action feedback pattern (25 October 2026): reusable components/ui/action-toast.tsx shows dismissible top-right success/error feedback with teal/ivory/lavender styling and live announcements. Guardian verification opts into it through Feedback floating. Keep uncertain-write retry controls and validation locks intact. File upload uses an indeterminate spinner/activity bar while preparing/sending, never a fabricated percentage or a claim of scan clearance.
Owner refresh-control rule (26 October 2026): refresh/reload actions across the website use components/ui/refresh-button.tsx. Show only the circular refresh icon with notification-style neutral background and lavender hover. Keep translated labels in aria-label and title, original handlers, explicit form types and disabled/uncertain locks. Refresh actions are an exception to the visible-text FilterButton pattern; keep their group containers. For a control that becomes a different action, pass iconOnly only in its refresh state so Load more/Retry checkout text remains appropriate.
Account identity rule (26 October 2026): display SignedInIdentity below the returning-account actions using the server session role and optional studentSetupPending flag. A pending student email is an unlinked account, not an active guardian or authorized student. Suppress guardian progress/setup routes for it and show invitation-first student guidance. Active student management badges come from the owned student context and learning-management endpoint; never infer identity or family linkage from a name, email resemblance or a management choice. Guardian relationship acknowledgment, email/account linking and learning permissions are distinct.
