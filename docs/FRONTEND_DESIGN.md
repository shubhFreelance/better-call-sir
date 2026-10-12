# Frontend design direction

Owner direction, 12 October 2026: use shadcn/ui, the installed [frontend-design skill](../.agents/skills/frontend-design/SKILL.md), and the Wispr Flow palette supplied by the owner. The environment proxy denies both `wisprflow.ai` and its `www` address; no full-site inspection is claimed. The owner's supplied colors are authoritative for this implementation.

## Tokens and layout

| Token | Hex | Role |
| --- | --- | --- |
| Deep teal | `#034F46` | Primary actions, focus and brand accents |
| Lavender | `#F0D7FF` | Selected discovery tab and assistance highlights |
| Cream | `#FFFFEB` | Main canvas |
| White | `#FFFFFF` | Forms and content surfaces |
| Charcoal | `#17201F` | Primary text |
| Muted gray | `#586562` | Helper text |

Use self-hosted Manrope Variable for English interface text and headings; browser sans-serif fallback covers characters outside that font. Full Hindi typography/localization remains a separate acceptance item. Teal is paired with white on primary controls; lavender carries dark text rather than white text. Borders and disabled states are derived neutral colors; error red is reserved for errors.

Teacher discovery uses two equally visible tabs above the page content. Manual search has a full-width text field, visibly labelled criteria in a four-column desktop/two-column mobile grid, then teacher cards. Assisted discovery explains what information is needed and leads into guardian criteria intake. A chosen teacher remains identified through sign-in and submission.

```text
Teacher discovery
[ Search                  | Let us search for you ]
[ Search a teacher or subject                      ]
[ Subject ][ Format ][ Board ][ Class              ]
[ Language ][ Locality ][ Budget ][ Reset          ]
Results and teacher profiles
```

Forms use left-aligned labels, useful helper text, consistent action names, explicit required/optional fields, field-level errors and recoverable server failures. A multi-step form must preserve input when moving back or retrying. Empty states offer a next action; success is shown only after an API-confirmed result. Student browsing and guardian-only submission remain distinct account permissions.

## Component foundation

Official shadcn New York v4 Button, Input, Tabs, Alert and Textarea source is vendored from `shadcn-ui/ui` commit `993eb2c3151997ce08a49635c10fd8c8ef3713c7`. Imports are adapted to the project's utility and individual Radix packages; the upstream MIT notice is retained alongside the components. The public shadcn registry is also blocked by the environment proxy, so installation uses its official GitHub source. Tailwind v4 utilities are enabled without its reset to preserve existing screens while they are migrated. Existing custom form/buttons outside the shared helpers still require migration.

shadcn/ui supplies the component primitives, not a mandatory font or brand palette. Charts will use its chart components with actual reporting data when dashboards are implemented; no invented operational metrics are added for appearance.

## Frontend sprint order

1. Design foundation and manual/assisted discovery, including real API submission and keyboard/mobile checks.
2. Email OTP sign-in and guardian onboarding: draft resume, structured schedule entry, clear consent and confirmation.
3. Teacher onboarding: profile, private evidence uploads, review status, availability and leave.
4. Guardian and student dashboards: invitation/device access, recommendations, demo/terms, recurring lessons and attendance.
5. Revision checkout and private meeting access, with honest payment and meeting states.
6. Learning notes, support/rematch/privacy flows and role-scoped operator dashboards/reports.

Review desktop and 360px screenshots, keyboard navigation, contrast, loading/error/empty states, and real/mock API behavior for each completed feature. Feature commits are pushed separately. Production/provider qualification and deferred backend stories remain open.

## Email sign-in

Use a two-step email/verification form with explicit progress. The desktop composition places a restrained teal information panel beside a white form; mobile puts the form first. The established Manrope, teal, lavender, cream and charcoal tokens continue here. A single six-digit field accepts paste and browser one-time-code autofill, with visible expiry, a resend cooldown, change-email recovery and field-specific errors. Request/verify failures preserve entered details; codes stay in component memory and are cleared on resend, change or success. Only a SANDBOX response can show a clearly labelled development code; SENT responses cannot expose that preview.

Development personas are separated in an expandable section. New accounts retain backend verification status; email OTP does not grant guardian verification or student access. An allowed onboarding return URL preserves a teacher selection; other return URLs are ignored.

## Guardian onboarding

Use five focused steps: permission, learner, tuition needs, schedule and review. A desktop side rail shows progress and the discovery path; mobile keeps the progress markers compact and the current step in focus. The white form surface, teal actions, lavender active marker and Manrope typography continue the owner-approved palette. Each step has a clear title, visible labels, useful errors and explicit next/back controls.

Verification and purpose-specific consent come before editable learner fields. Existing learners retain their saved class/board; new learners use an alias. Budget review preserves paise precision. Availability windows use labelled IST inputs and serialize as UTC; they remain preferences until a timetable is agreed. Guardian confirmation precedes submission, with an API-confirmed success and a link to the private request list.

The initial draft is saved on each successful Continue action and can resume after reload. Version conflicts keep local edits until an explicit reload. Uncertain submissions keep the original payload/retry key and disable editing until the same submission is confirmed. The current API has one initial onboarding draft per guardian; later requests use the same steps with an explicit keep-page-open notice until submitted. Per-request draft persistence remains open.

## Teacher application and private evidence

Three focused steps collect the teaching profile, explicit coverage/tuition, and a review. Reuse the guardian progress rail and white form surface; selected checkbox choices use lavender with dark text. No boards, classes or languages are silently advertised. Home tuition requires declared localities. Review preserves paise precision and explicitly explains that submission changes the account to a teacher; existing application resubmission reopens screening and revokes private-note sharing.

Continue checkpoints persist the initial draft. Version conflicts require an explicit reload; uncertain saves/submissions keep their retry key and prevent editing. Existing application revisions remain on the page until submitted. The owner workspace shows actual review status and private evidence metadata. PDF/PNG/JPEG uploads are limited to 5 MiB, retained only in memory during retry, and have no download link until the API reports a clean safety scan. A scan never substitutes for independent approval.
