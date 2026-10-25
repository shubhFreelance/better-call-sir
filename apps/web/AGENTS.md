## Better Call Sir frontend

Owner design memory (25 October 2026): `filter-button` means the reusable white/lavender action-button design in `components/ui/filter-button.tsx`. Use `FilterButton` (white by default, `accent` for lavender) and `FilterButtonGroup` for its full-width #EEF5F3 tray. Prefer these components wherever this named design is requested. Preserve button/link semantics, disabled states, keyboard focus, hover feedback and phone stacking. See `docs/FRONTEND_DESIGN.md` at the repository root for usage.

Frontend features belong on `feat/frontend-implementation`; backend/API changes belong on `feat/backend-completion`. Keep backend changes in dedicated tested commits and bring required contracts into the frontend branch as dependencies.

Use the installed `../../.agents/skills/frontend-design/SKILL.md` and read `../../docs/FRONTEND_DESIGN.md` before frontend design work. The owner chose shadcn/ui and supplied the Wispr Flow palette: teal `#034F46`, lavender `#F0D7FF`, cream `#FFFFEB`, white and charcoal neutrals. Preserve these tokens and use the shared component system for new screens. Complete login, onboarding, search and dashboard flows with visible labels, accessible controls and API-confirmed results; track unfinished workflows in the sprint board.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
