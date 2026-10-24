# Frontend design direction

## Guardian overview priorities — 24 October 2026

Surface unfinished guardian relationships and named step-six profiles in a lavender overview panel with white action cards. Reuse owner-scoped setup/verification APIs and exhaust cursor pages before presenting a count. Add a small teal-framed lavender/ivory circular count before the Overview link; hover title summarizes steps, keyboard/tap opens an actionable panel. Use explicit loading/error states, refresh on mount/focus and periodically, and hide completed work. Deep-link actions open the exact owned relationship instead of requiring a history search. Preserve sidebar state, account isolation and English/Hindi mobile layouts.

## Inline guardian completion and reviewer workspace — 24 October 2026

Frame each saved learner independently with ivory surfaces, restrained borders and aligned teal saved-profile links. Give the staff verification queue a compact status panel and white evidence/decision cards with lavender headings; make the scanner-cleared report link a prominent teal action without changing its protected endpoint. Reuse the existing purpose-specific consent form and learner editor within approved verification step six, scoped to the named/linked learner. Retain uncertainty recovery, role/region gates, privacy pauses, scanner restrictions and both interface languages. Keep guardian-form padding independent of reviewer styles.

## Student access handoff — 24 October 2026

Add a third student entry card for shared guardian management, with authorization explained as separate from preference. Preserve independent and private-code routes. Use inline email verification at student entry instead of a generic sign-in detour. Provide owner-scoped relationship progress, authoritative linked profile and management summaries, explicit refresh/error states and paginated requests. Mirror meaningful status on the dashboard without confusing a provisional student email account with confirmed guardian ownership. Reuse cream/white cards, teal actions and lavender accents; translate English/Hindi labels and retain scoped routing, privacy and consent boundaries.

## Manage children and learners — 24 October 2026

Use guardian-facing relationship language for the sidebar and management heading. Begin new-child setup with a relationship-verification draft, not education entry. The Add action opens the existing verification form without sending a request automatically. Existing approved relationships retain their explicit education-completion action. Explain that approvals are per child and education saves do not submit verification. Reuse existing surfaces and maintain English/Hindi wording; no new personal data in URLs or storage. Preserve server consent, acknowledgment and privacy boundaries.

## Verified learner setup bridge — 24 October 2026

Show approved relationships awaiting education setup alongside completed learner profiles. Reuse care-card surfaces, visible name-search labels and shared action controls. Names come only from the signed-in guardian’s owned records, with explicit pagination/retry states. Prefill the approved name; retain consent and account-acknowledgment boundaries. Clearly distinguish relationship approval from finished education setup. Preserve both languages and avoid a public child directory.

## Guardian action-card refinement — 24 October 2026

Keep all five shortcuts inside the existing #E4E4D0 saved-progress card, including direct entry and refresh. Use truthful session-restored wording when the registration notice is unavailable. The discovery button is black with a restrained teal/lavender animated outline and static reduced-motion fallback. Remove guardian sidebar discovery duplication and use Parent or Guardian Dashboard as the heading. Other roles and access rules remain unchanged.

## Guardian top actions — 24 October 2026

Plan: guardian external destinations move from sidebar to the top action row: Find a teacher, Guardian setup, Guardian verification, Help & safety, then the existing outlined Review saved verification requests action. Use existing teal shared buttons and a slow, restrained teal/lavender border pulse for teacher discovery; stop the animation for reduced motion and pause on hover/focus. The saved-account notice retains its wording and identity gate. Provide the same compact shortcut row on guardian dashboard deep links/refresh when that memory-only notice is absent. Preserve other roles, original destinations, permissions and saved verification history. Validate both languages, keyboard targets, refresh availability and sidebar persistence.

## Persistent dashboard navigation — 24 October 2026

Plan: keep the existing visual design and move the dashboard App into a shared Next.js dashboard layout, with null index/catch-all leaf pages. Preserve the auth/query providers, header, sidebar DOM and disclosure state across internal dashboard navigation; key the right-hand content by section and the shell by account/role so workspace state resets at appropriate boundaries. Disable automatic whole-page scroll reset for internal sidebar links. Render learner education profiles inside the same dashboard shell with one main landmark and no nested viewport-sized container. Public teacher discovery/server-prefetch routes remain separate. Validate DOM identity, no document requests or repeated session bootstrap during section changes, browser history/deep links, all roles, sign-in recovery, private-read denial and learner verification/consent gates.

## Distinct invited-student access — 24 October 2026

Plan: distinguish student-granted support from guardian-managed learner relationships through a pale lavender #F8ECFF shell, #DAB7EC border, retained lavender top stripe and white inset student/history cards. Add a small link icon and translated Invited access label so the distinction also uses text, not colour alone. Keep verified relationship cards white with their existing verification status, and preserve all permission descriptions, invitation statuses, actions and API behavior. Retain black keyboard-focus borders, accessible contrast and narrow Hindi layouts.

## Continuous learning highlights — 24 October 2026

Plan: turn only the four-message promise strip into a linear GSAP ticker at38px/second, with equal repeated groups and matching seam spacing. Keep the existing pale background, teal/olive icons and translated labels. Measure the viewport/group after fonts and on resize so the loop fills wide screens without a blank gap. Expose the content once to assistive technology; the visual copy is aria-hidden. Provide a shared pause/resume button, pause while hovering or keyboard-focusing the viewport, and show a static responsive list for reduced motion or unavailable enhancement. Keep native scrolling, landing entrance motion and route cleanup intact. Validate actual leftward movement, pause/resume, duplicate geometry, narrow Hindi, resize, reduced motion and strict production CSP.

## Landing motion and selective sage accents — 24 October 2026

Plan: apply owner-selected #E4E4D0 to the returning-account notice, dashboard welcome panel and selected summary tiles; restore white/ivory to ordinary cards and remove the global sage inset rim. Retain lavender/teal icon accents, cream/black border hierarchy and #F3F1EB sidebar. Give the returning-account notice a clear bilingual heading and grouped44px actions without changing identity/resume behavior. Load pinned GSAP3.15.0 and ScrollTrigger dynamically on the landing page only: small entrance/scroll translations, no scroll hijacking or hidden initial content. Scope animations to the landing root, revert on unmount/preference changes and skip loading for reduced motion. Clip decorative mobile illustration overflow. Validate actual GSAP initialization, reduced motion, keyboard navigation, both languages, saved-account links and strict production CSP.

## Warm overview card shells — 23 October 2026

Plan: use the supplied image references as colour/composition guidance: olive-ivory #E6E6D2 shells, pale ivory #FFFFEB inset details, lavender #F0D7FF learning accents, teal #034F46 action panels and small #FFAE42 decorative accents. Preserve Manrope/Noto Sans Devanagari, dark readable labels and actual API-backed values. Give the overview totals compact icon panels, clear labels and larger numbers; show the welcome action in a separate teal panel. Add meaningful icon accents to teaching, support and independent-student cards. Carry warm fills/inset framing across other card families while keeping existing dark surfaces, status colours, field borders, permissions and sidebar palette distinct. Mobile totals stack their icon and label inside two columns; all role/language, denied-read, keyboard and empty/loading states remain required.

## Pricing-inspired card frames — 23 October 2026

Plan: apply a shared2px #F3F3E0 frame to card surfaces across public discovery, registration, onboarding and all role workspaces. Keep existing white/ivory/lavender fills, Manrope/Noto Sans Devanagari, content and rounding. Use near-black #191919 only for primary form/decision cards, hovered interactive cards, checked relationship choices and keyboard focus inside a card. Preserve the lavender invited-learner stripe and existing sidebar palette. Do not recolour input, alert, table-divider or status borders: these communicate validation and affordance. Prefer a single scoped surface rule and shared card-border tokens over changing the general --line token. Review guardian relationship cards from the owner screenshot plus search, onboarding and all role dashboards in English/Hindi and narrow layouts.

## Compact dashboard sidebar — 23 October 2026

Plan: retain readable icon-and-label navigation in Manrope/Noto Sans Devanagari. The owner replaced the grey treatment with soft ivory #F3F1EB, a quiet #E5E5D8 inset outline and #ECECDF hover. Keep black labels/icons and #F0D7FF lavender for the current section, with a restrained lavender outline. Descriptions start collapsed, including the selected row; a separate44px chevron disclosure reveals them without accidentally navigating. Use keyboard-operable buttons, aria-expanded/controls, restrained chevron rotation and reduced-motion support. Reuse identical rows in desktop and the existing mobile menu; preserve destinations, role filtering and API access controls.

## Guardian decision readiness — 23 October 2026

Plan: keep the existing verification worksheet, Manrope/Noto Sans Devanagari, ivory #F4F4EC, white, black text and teal actions. Use a single restrained lavender #F0D7FF panel immediately above the decision button to list only unmet requirements. Derive the button and submit guard from those same requirements. Distinguish student-account acknowledgment from staff-call acknowledgment; show the observed-call checkbox only for the latter. Keep independent authority, clean evidence, matching names or completed call, student acknowledgment, feedback, private reference and final confirmation authoritative. Server permissions and approval rules remain unchanged. Review the English and Hindi phone cases with no overflow, accessible status updates and a refreshed external acknowledgment; never enable approval just because the staff completed unrelated controls.

## Guardian report scan recovery — 23 October 2026

Plan: preserve the ivory/white worksheet, teal actions, restrained lavender highlights and Manrope/Noto Sans Devanagari. Separate uploaded evidence, explicit submission and scan clearance. Show waiting versus failed processing plainly; both owner and staff can refresh status without re-upload. Poll active quarantined records only while no edit/write or retry confirmation is in progress; errors hide private details. Only ADMIN receives a reviewed retry form bound to the current failed scan job. Require infrastructure confirmation and a reason, reuse exact idempotent job recovery, and keep download/approval blocked until CLEAN. Review: never hide a processing failure behind a permanent “pending” message, and never treat a retry as clearance. English/Hindi, mobile, accessibility and denied/uncertain recovery remain required.


Final review: real admin evidence and320px Hindi retry screenshots inspected. Removed inherited nested fieldset padding so the retry reason remains usable; a width assertion guards the phone regression. Current scan status refreshes without re-upload, exhausted scans have an administrator-only reviewed retry, and an explicit refresh recovers stale retry conflicts without trapping the form. Final23 production cases pass, alongside the real upload→worker→admin original-byte download acceptance.

## Visible staff sign-in entry — 23 October 2026

Plan: a quiet white/ivory access row with a lavender shield and a clearly labelled Admin & staff sign-in link below the normal form. Preserve Manrope/Noto Sans Devanagari and44px focusable links. /login?intent=staff uses the same email-only OTP with staff-specific guidance and no signup toggle; verified unknown inboxes cannot create accounts from this flow. Staff intent conveys no role and existing backend MFA/role checks remain authoritative. Show the development selector open in staff mode with explicit loading/empty/unavailable/retry states instead of silently hiding it when the account list is missing. Test shortcuts remain supplied solely by the existing development-only endpoint. Review: no public privileged signup or universal admin password; the missing entry is a navigation/state issue.


Final review: inspected the public desktop entry and Hindi phone staff view. The lavender shield makes staff access discoverable while the learner login stays primary. Staff mode has no signup toggle or name field, and development accounts show meaningful states instead of disappearing. All14 combined development and12 production-CSP cases pass, including the admin MFA gate and verified-unknown-email denial.

## Guardian multi-learner overview — 23 October 2026

Plan: bring learner relationships and student invitations onto the guardian overview above hiring activity. White cards on the existing ivory canvas; black headings, teal verified status and a small #F0D7FF invitation accent. Keep Manrope/Noto Sans Devanagari. Two clearly labelled groups show each learner name, independent relationship/invitation status, permission and next action. Existing private paginated APIs remain authoritative; no public email lookup, new grant, evidence approval or shared-account switch. Never label an adult invitation as a verified parental relationship. Current unverified/pending, revoked/expired, advice-only and management scopes must stay distinct. Stack cards on phones and preserve English/Hindi, keyboard and failed-read recovery. Review: avoid a combined “family” identity or account-wide verified badge, which would wrongly imply one learner’s proof covers another.


Final review: English desktop and Hindi phone screenshots inspected. Two white groups separate named proof status from optional invitations, with a narrow lavender invitation accent; each card identifies the learner and its own permission. Current selected-student context appears in the shared-profile view. Independent pagination, failed-read hiding, revoked/pending no-access, keyboard/axe and scope-specific actions pass. Real API multi-invitation isolation and real web/API acceptance/edit/revocation are validated.

## Learner profile navigation — 23 October 2026

Plan: keep ivory #F4F4EC, black #17201F, white #FFFFFF, lavender #F0D7FF and neutral #DADAD0. Preserve Manrope/Noto Sans Devanagari. Place the three existing links in a right-aligned action row below the learner heading; the verification action alone receives a lavender fill, while dashboard/setup stay quiet. Use shared shadcn buttons with real links,44px targets and visible focus. Phone links wrap into full-width rows with comfortable spacing; keep role visibility, translations and destinations intact. Review: avoid a large colored panel or competing primary buttons; the small lavender action supplies emphasis.


Final review: inspected1440px English desktop and320px Hindi phone captures. The desktop row reaches the content’s right edge; verification alone has lavender emphasis. Phone actions stack without overflow and keep44px targets. All12 existing learner-profile browser cases,23 security/localization checks and workspace types pass; three additional screenshot checks confirm destinations/alignment/touch targets.

## Returning-account sign-in and saved progress — 23 October 2026

Plan: keep the shared ivory/white auth cards and labelled controls. Sign-in asks for the registered email and OTP; account creation explicitly reveals the name field. A reversible, labelled mode switch keeps the entered email, respects request uncertainty and restores keyboard focus. Public request responses never disclose account existence. After a valid OTP, existing users receive a concise status notice and dashboard/saved-verification links. Existing guardians return to their dashboard, teacher recovery stays bound to the original identity, and staff still pass MFA. Existing saved drafts/records are read from their account APIs; no new credential/email browser storage, role conversion, approval or automatic document upload. English/Hindi copy and mobile accessibility remain required. Review against the brief: distinguish registration from returning access without suggesting users need a different email or should repeat their saved application.

Final review: English desktop and Hindi phone notices are readable and actionable. Signup/sign-in switching preserves email and keyboard focus; the returned guardian draft opens from the notice without repeat registration. Final26 combined development browser cases plus3 teacher application/recovery/schedule checks and11 production-CSP cases pass. No new browser credential storage or changes to staff MFA/guardian permissions.

## Search lavender accents — 23 October 2026

Plan: preserve the approved ivory #F4F4EC canvas, black #000000 active tab/headings, white worksheet and teal #034F46 actions. Reintroduce lavender #F0D7FF only as a small active-filter badge, the empty-search icon tile, tab icon accents and the backgrounds of explicitly selected non-empty filter controls. Selected options gain a darker violet border as a second visual cue; existing labels and keyboard focus remain clear. Keep Manrope/Noto Sans Devanagari and the existing layout. No large lavender panels, new state, behavior, API or translation changes. Review contrast and desktop/Hindi phone screenshots against the restrained-color brief before delivery.

Final review: inspected a real-catalog desktop capture with Maths and budget selected, plus the Hindi phone/no-match capture. Selected options and small badges carry the lavender; neutral unselected controls and the black active tab keep the page legible. Existing demo badges fit the same palette. All3 development and3 strict-CSP browser cases pass, including axe, mobile overflow, keyboard and reset behavior.

## Teacher search refinement — 23 October 2026

Plan: use ivory #F4F4EC for the search page, white #FFFFFF for the filter worksheet, black #000000 for headings/active tabs, teal #034F46 for primary next actions and neutral #DADAD0 borders. Keep Manrope/Noto Sans Devanagari. Left-align a concise title, two clearly distinct search tabs, a full-width labelled text query, then evenly spaced filters in four desktop/two tablet/one phone columns. A small filter count and explanation make immediate search behavior explicit. Existing custom curriculum fields remain visible and labelled.

Review against the screenshot: two lavender banners repeat the same help message and compete with results. Replace them with one quiet no-match card containing reset and assisted-search choices, plus one coverage link. Show the secondary help strip only when actual results exist. Preserve teacher-card terms, query state/pagination/return behavior, education-stage resets, pending/error states and all role-specific assisted routes. No backend/query-contract change. Check keyboard, contrast, Hindi, phone overflow and existing return/pagination/readiness/waitlist behavior before pushing.

Final review: inspected English desktop empty/populated results and Hindi phone captures. Removed repeated no-match assistance and the lavender pagination block. A legacy global input selector required a more specific search-field selector to retain56px query height; the final touch-target assertion passes. The phone result caption now stacks without competing for width. Native selects, custom subject/board fields, visible focus and all existing filter semantics remain intact. The final strict-CSP suite passes all10 selected cases, including no-script readiness and return-state behavior.

## Guided guardian verification — 23 October 2026

Plan: the owner now chooses ivory #F4F4EC, black #000000, white #FFFFFF, teal #034F46 and neutral border #DADAD0 for this page. Keep Manrope/Noto Sans Devanagari. A six-stop sequence reflects actual work: relationship details, learning choices, confirmation, report upload, staff review and student setup. The first three steps reveal only their own required fields; answers stay in component memory when navigating back. Review-before-save and server-authoritative later steps stay intact. Left-align the white worksheet and render a restrained connecting line, completed checkmarks and a current-step marker. Animate only state changes; disable animation for reduced motion. Phone layouts use a compact two-column tracker and full-width actions without horizontal scrolling.

Review: replace the static lavender process banner during editing with a live tracker and explicit current-step description. Do not mark staff review or setup completed based on a button click. Rejected/cancelled/revoked/deleted requests must not look successful. Preserve exact versioned writes, retries, private evidence, student acknowledgment and separate consent. The report transport fix belongs to a tested backend commit; do not increase ordinary request limits.

Final critique: desktop and Hindi-phone screenshots inspected. The first screen now fits four relationship fields instead of a long management/consent form. Current-step black markers contrast with ivory upcoming steps and teal completed markers; hints explain the next action. Phone tracker is two columns with no horizontal overflow and a full-width primary action. Validation, Back preservation, explicit review confirmation, reduced motion and server-derived closed/review/approved states are tested. Staff approval and separate learning consent remain real later operations, not UI success assumptions.

## Guardian verification and student handoff — 23 October 2026

Plan: retain teal #034F46 for the next action, lavender #F0D7FF for the chosen management option, cream #FFFFEB for guidance, white #FFFFFF for the worksheet and charcoal #17201F/muted #586562 for text. Keep Manrope/Noto Sans Devanagari. One page title leads into a concise actual sequence: relationship details, school report/student confirmation, staff review, then consent/student profile. A left-aligned white worksheet has32px desktop/20px phone padding, labelled sections and separated checkbox/action areas; prior requests follow it rather than interrupting entry. Keep the three management options and canonical review/write/upload states.

```text
Guardian verification
[How it works: details / report + confirmation / review / student setup]
[Relationship worksheet: names, management, confirmation, permissions   ]
[Previous requests, only when there are records                        ]
Student chooses help:
[What your guardian does] [What you do] [What happens after approval]
[Copy guardian signup link] [Open my relationship requests]
```

Review against brief: avoid another oversized slogan and a blank history row above a crowded form. The handoff must identify the actor and destination, and must not open the child's existing session as if it were the guardian's account. Copying a public signup URL sends no email and grants no access. Explain separate devices/browser profiles, use of the student's existing email for acknowledgment, and that no access link is created just by selecting help. Adult optional support remains distinct from mandatory managed-student setup. Preserve consent, staff review, uncertain retry, same-account boundaries and bilingual keyboard/mobile behavior; inspect the resulting screenshots.

Final review: English desktop/Hindi phone captures inspected after the worksheet/step-guide and actor-specific handoff were implemented. Radio-card choices and declaration checkboxes have separate spacing; old request rows follow the active task. Avoid presenting an unusable education button beneath guardian guidance. Returning to adult eligibility clears the age declaration and restores focus; clipboard denial leaves a selected manual-copy field with a translated status. The student relationship view never asks the pending student to introduce themselves as a guardian. All17 production verification/guidance/eligibility checks pass; real staff/inbox/physical-device qualification stays separate.

## Dashboard and individual registration redesign — 22 October 2026

Owner brief: make teacher/student/guardian/admin dashboards understandable at a glance, use distinct cards, bold descriptive labels with regular-weight values, and explain every sidebar destination. Promote separate student, parent/guardian and teacher registration; account linking follows registration when relevant, not a mandatory family identity.

Plan: retain deep teal #034F46 for the lead action/navigation, lavender #F0D7FF for learning guidance/status, cream #FFFFEB for the public welcome, white #FFFFFF for information cards, charcoal #17201F for labels and muted #586562 for helpers. Manrope and Noto Sans Devanagari retain the bilingual scale. Left-align all data. Use a restrained greeting followed by a distinct action summary, four compact real-count cards, then a wide enquiry/arrangement workspace beside a teacher profile or learner-information card; help and privacy get a separate card. Bold field labels pair with regular values in definition lists. Navigation has readable names, concise descriptions, current-page indication and a collapsible phone menu.

```text
Public:     [Student registration] [Parent / guardian registration] [Teacher registration]
Dashboard:  [identity + menu] [greeting + primary action                 ]
                            [enquiries] [responses] [pending] [active]
                            [enquiries / arrangements] [profile       ]
                            [review + existing actions] [help/privacy ]
Phone: identity/menu, greeting, counts, records, help, profile; one reading column.
```

Review before build: cards are explicitly requested, but avoid a wall of identical decorative tiles. Counts stay compact; the enquiry workspace has the dominant width, while teaching credentials and help are quieter secondary surfaces. No invented qualification, income, activity or completion percentages. Reuse private APIs for teacher education/work details, never public projections. Registration communicates actual age/consent requirements without creating linked accounts automatically; preserve current managed-student, verification and supporter permissions. Loading/error/empty states must retain truthful states and privacy-safe read recovery. Test English/Hindi, desktop/phone, menu keyboard access and actual registration transitions, then inspect screenshots.

Final critique: desktop and Hindi-phone screenshots were inspected for all five participant/admin account views and the public entry. The student registration card needed explicit white body text on teal; corrected and checked with axe. Help moved below the main enquiry workspace to balance the empty dashboard and shorten the path to assistance. Qualification labels carry bold weight while authored degrees and institutions remain regular. Expanded education/work history stays optional so the main profile remains scannable. Phone navigation has visible descriptions, translated accessible names and Escape/focus recovery. Final strict-CSP teacher/registration captures pass with no page errors or horizontal overflow; existing hiring/consent/retry and teacher evidence checks remain intact.

Teacher registration/session recovery —22 October2026: reuse the existing white form and cream guidance panel, teal primary actions, Manrope/Noto Sans Devanagari and shared labelled controls. Signup leads with “Create your teacher account”, email verification and the private application sequence; returning teachers have a separate sign-in link. Stack into one column on phones. If sign-in expires, focus an inline recovery heading and keep the original application hidden/inert rather than discarding its fields. Explain the same-email requirement and that a reload/closed page loses unsaved entries. Restore only the original account. Desktop English/mobile Hindi signup screenshots and production recovery checks were reviewed; no cosmetic redesign or new credential storage is needed.

Owner direction, 12 October 2026: use shadcn/ui, the installed [frontend-design skill](../.agents/skills/frontend-design/SKILL.md), and the Wispr Flow palette supplied by the owner. The environment proxy denies both `wisprflow.ai` and its `www` address; no full-site inspection is claimed. The owner's supplied colors are authoritative for this implementation.

## Current product emphasis

Owner direction, 14 October 2026: design for finding and hiring a teacher. Follow [the current MVP scope](MVP_SCOPE.md). Discovery, profile fit, manual/assisted enquiries, teacher responses and confirmed arrangements take priority in navigation, calls to action and dashboards. Avoid making individual class booking, calendars or attendance the centre of the initial experience. Preserve the established palette, accessible controls and private consent/screening boundaries. Existing class-management screens remain implemented but further development is deferred until scale.

## Tokens and layout

| Token | Hex | Role |
| --- | --- | --- |
| Deep teal | `#034F46` | Primary actions, focus and brand accents |
| Lavender | `#F0D7FF` | Selected discovery tab and assistance highlights |
| Cream | `#FFFFEB` | Main canvas |
| White | `#FFFFFF` | Forms and content surfaces |
| Charcoal | `#17201F` | Primary text |
| Muted gray | `#586562` | Helper text |

Use self-hosted Manrope Variable for English interface text and headings; browser sans-serif fallback covers characters outside that font. The whole Hindi interface uses self-hosted Noto Sans Devanagari Variable with natural line height, zero negative heading tracking and wrapping mobile actions. Teal is paired with white on primary controls; lavender carries dark text rather than white text. Borders and disabled states are derived neutral colors; error red is reserved for errors.

Teacher discovery uses two equally visible tabs above the page content. Manual search has a full-width text field, visibly labelled criteria in a four-column desktop/two-column mobile grid, then teacher cards. Assisted discovery explains what information is needed and leads into guardian criteria intake. A chosen teacher remains identified through sign-in and submission. Returning from a public teacher profile preserves manual-search filters and loaded result pages in memory. Reset clears the search; a full reload starts fresh. Keep original result freshness and current API eligibility checks, and clear the public search after confirmed sign-out. Never persist these criteria in browser storage or extend private query-cache lifetimes for navigation convenience.

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

The initial draft is saved on each successful Continue action and can resume after reload. Version conflicts keep local edits until an explicit reload. Uncertain submissions keep the original payload/retry key and disable editing until the same submission is confirmed. The API preserves initial onboarding separately from one active additional-enquiry draft per guardian. Later enquiries save privately on successful Continue actions and resume after return/reload. Completed additional drafts restart explicitly with version checks; unfinished drafts cannot be silently replaced by a different teacher link. Multiple simultaneous unfinished drafts remain outside this increment.

## Teacher application and private evidence

Three focused steps collect the teaching profile, explicit coverage/tuition, and a review. Reuse the guardian progress rail and white form surface; selected checkbox choices use lavender with dark text. No boards, classes or languages are silently advertised. Home tuition requires declared localities. Review preserves paise precision and explicitly explains that submission changes the account to a teacher; existing application resubmission reopens screening and revokes private-note sharing.

Continue checkpoints persist the initial draft. Version conflicts require an explicit reload; uncertain saves/submissions keep their retry key and prevent editing. Existing application revisions remain on the page until submitted. The owner workspace shows actual review status and private evidence metadata. PDF/PNG/JPEG uploads are limited to 5 MiB, retained only in memory during retry, and have no download link until the API reports a clean safety scan. A scan never substitutes for independent approval.

## Teacher schedule

The teacher workspace adds an anchored schedule section and a dashboard navigation entry. Three keyboard-accessible shadcn tabs separate weekly hours, capacity/travel and private leave. Reuse the existing Manrope, white form surface, teal actions and lavender selected tab. Desktop pairs related time/date inputs; mobile stacks them with visible IST labels. Entries survive switching tabs. Saved windows display their validity and enabled/paused state; midnight has an explicit next-day control.

Each save uses the owner API and current resource version. Refresh preserves form entries; uncertain outcomes freeze edits and reuse the exact operation/retry key. Pausing/reopening hours and cancelling leave require an inline reason and confirmation. Leave conflicts point to accepted bookings rather than cancelling them. The current calendar API returns at most 50 weekly windows and 50 active leave periods; the UI states that bound. Full calendar pagination requires a separate backend increment. Calls stay unavailable.

## Family and student spaces

Guardian/student overview content now uses a restrained teal introduction, server-backed activity summary, upcoming classes and active learning-team records. Guardians see learner cards linking to a dedicated Learners & access screen; students see only their learning overview and role-appropriate navigation. Avoid invented trends/charts: the API supplies an aggregate reporting window and a bounded lesson snapshot, not a complete time series. The dashboard’s horizontal navigation stays within the mobile viewport and uses the neutral text token for contrast.

Learner access separates first invitation, existing-device authorization, session revocation and consent withdrawal. Codes are explicitly revealed and remain in page memory; they never enter browser storage or return URLs. Every sensitive action explains its effect and requires confirmation. Device names are not recorded, so the UI shows session identifiers/expiry and the API’s 50-group limit instead of inventing device labels.

A student-session handover hides all guardian screens and cancels/clears private query data before sending authorization. Its recovery screen inspects the current session rather than repeating a non-idempotent authorization or activation. Only the intended student account or original guardian may reopen the app; inspection failure keeps guardian content hidden. Revocations retain the same retry key/payload after an uncertain response. Consent withdrawal likewise checks current status before offering another submission. Verification, current consent, ownership and server version checks remain authoritative.

## Shortlists, demos and tuition terms

The guardian Requests screen focuses on one saved request at a time. Its learner, exact budget, discovery method and availability precede reviewed teacher cards. White surfaces, teal actions and lavender tags use the established tokens; mobile stacks the summary and labelled IST controls. Teacher acceptance and the guardian's saved choice remain separate. Record a shortlist impression only after a current, identified card is actually visible. Never label an unresolved public profile as ineligible or invent an algorithm confidence score.

Teacher selection uses inline review and explicit confirmation, then saves the preference without claiming an assignment. Availability edits explain that they clear the existing shortlist and teacher choice. A demo proposal uses 20–40 minutes and paginated advertised times; the server checks the final proposed slot. Existing booking details retain acceptance, rescheduling and outcome controls. Completed demos remain a route to pending tuition terms even after their shortlist expires.

Tuition review separates opening an agreement, each party's terms acceptance and each party's actual first-paid-lesson confirmation. Show the stored policy version and exact monthly amount; label the teacher placement fee as the proposed pilot policy pending final live qualification. Start requires both acceptances and an accepted recurring timetable. Unknown write outcomes freeze editing and retain the exact operation/key for retry; stale versions require explicit refresh without discarding confirmation. A saved decision followed by a failed refresh is reported as saved with unavailable current details. Students cannot open private guardian request or agreement controls.

The public profile catalog loads up to four pages automatically, then offers more pages explicitly. Demos and recurring schedules retain the current API list bounds (100 and 50); complete timetable/demo histories require backend pagination. The remaining booking-detail design is a subsequent increment.

## Weekly timetables and attendance

Owner feedback, 13 October 2026: the palette needs a more intentional, premium treatment. Use color to convey the learning flow rather than tinting every surface. A deep-teal introduction anchors the Classes screen; lavender carries the IST label and pending proposals. The weekly strip uses lavender teaching days while awaiting agreement, then teal after both parties accept. White keeps timetable editing and lesson records legible. Cream marks an inline review step. Delivered present/late records use teal, scheduled records use lavender, and absent/cancelled records remain neutral; disputed records carry an explicit review label rather than relying on color. The shortlist brief now has a teal heading and a lavender criteria summary, with white teacher cards and restrained teal edges.

Keep Manrope and a left-aligned hierarchy. On desktop, seven weekday columns make the teaching pattern visible; mobile shows only teaching days to avoid empty tiles dominating the screen. Forms stack on mobile, with independent first/last validity dates, labelled IST weekly times, a reason and explicit confirmation. Explain replacement effects above a short acknowledgement rather than squeezing policy into a checkbox label. The confirmation describes replacement of pending proposals and cancellation/rebooking of future commitments after mutual acceptance, while preserving earlier commitments.

Guardians and teachers propose, accept and check bookings using current resource versions. An agreement becomes an accepted timetable only after the server confirms mutual acceptance and availability; paid tuition start remains separate. The booking check uses the actual extension response (created count and 60-day horizon), without expecting an invented resource ID. Unknown writes reuse their exact payload/key and original completion callback, so a successful replay closes the same confirmation form. Stale refresh preserves edits, and a saved result with failed refresh blocks further decisions until explicit recovery.

Lesson records use owner-scoped date queries and cursor pagination, with Upcoming and Attendance & records tabs. Teachers can record present/late/absent only after the lesson's end, with a reason and a required recap for delivered revision lessons. Guardian/student confirmation and disputes use inline review, not browser prompts. An uncertain attendance decision freezes date/tab/pagination changes and other lesson actions. The backend allows one attendance review per person per lesson. History exposes no other actor identity; the owner-safe current-person review now preserves confirmation status after reload. Each person can review a lesson once; changed attendance after that review directs them to support. Students never query guardian timetables. Reporting and whole-app localization are now implemented; release qualification remains separate.

## Revision bookings, checkout and private meetings

The Revision screen gives guardians a focused path from an owned learner and eligible expert to a 20- or 40-minute topic brief, advertised IST time and explicit scope request. Teal introduces the service and exact amount; white carries labelled fields; lavender marks timing and state; cream marks the final review before a versioned save. A hold and an accepted expert scope are separate decisions. Expiry or cancellation removes payment availability without claiming a refund. Student and unverified accounts do not load the private guardian form.

Booking and teacher invoice checkout share a review of the server-owned amount and policy. An owned order lookup survives reload and prevents a second order; rapid taps are guarded before the asynchronous preflight. The live Razorpay script loads only after a deliberate checkout action and opens with the public key, exact paise and server order ID. Its browser callback triggers a status check and never marks payment or a booking as confirmed. Unknown saves retain their exact retry key; a saved sandbox order is labelled unusable for live charging. Captured but unallocated funds and failed orders direct the user to support. Real provider qualification and refund/payout settlement remain open.

Confirmed demo, revision and lesson participants discover private meetings through their reservation, with no guardian financial query from the student view. A live join link appears only in the server/client time window and only for an HTTPS Google Meet URL. Sandbox, pending, failed and expired meetings give explicit guidance without a join action. The link has no referrer and is never put in page storage. Current Meet credentials and real 40-minute delivery remain provider acceptance work. See [remaining MVP work](MVP_REMAINING.md) for every open frontend, backend and release item.

## Staff security

Staff verification uses a teal workspace header, lavender role context, white labelled authenticator form and cream recovery review, with Manrope and shared controls. Private content and queries wait for server-confirmed MFA; recovery codes remain in memory until explicitly acknowledged as saved. Expiry/errors restore the verification screen and remove private query data. Mobile keyboard and accessibility checks cover the verification flow.

HTML responses receive fresh script nonces; the Razorpay SDK inherits the document nonce. Production script policy excludes unsafe-inline and unsafe-eval. Inline styles remain allowed for existing React/Radix dynamic positioning; this CSS exception must be revisited if the component implementation changes. Browser tests inject through HTML parsing and include an unprotected positive control, rather than claiming DevTools evaluation proves CSP.

## Private lesson feedback

The teacher recap is a deep-teal teaching note with a restrained lavender edge, white text and a recorded date. Lavender identifies the viewer’s own attendance review; white carries an explicit five-choice rating and optional comment. The cream final review repeats the lesson/date, rating and comment and asks the guardian to acknowledge that this lesson’s teacher can read it. Students can see their recap but no guardian comments or feedback form. Saved feedback uses a quiet white surface with the actual rating and date, without invented quality scores or public-review claims.

Forms retain edits on a stale version and retry the exact saved operation on an unknown result. Pending/uncertain/conflicted lesson decisions hold date/tab/pagination controls until recovery. Recaps/comments render as text. Screen-level tests cover role access, reload status, keyboard radio controls, mobile contrast/overflow and real API persistence. Public publication/moderation and dashboard feedback sample-size metrics remain separate.

## Private notes and named sharing

Teal introduces a practical private learning notebook; a lavender privacy guide explains access. White carries labelled writing and named-teacher selection; cream marks the explicit save/share/withdraw/acknowledge review. A restrained lavender badge identifies actual named sharing, while private and paused states remain explicit. Card footers use a compact timestamp/acknowledgement row rather than inheriting page-footer styling. Native selects retain keyboard behavior with the same borders, spacing and focus treatment as shared form controls.

New and edited notes save privately. Editing withdraws previous teacher access and clears acknowledgement; sharing is a separate named decision. A current draft prevents another note action from silently replacing it. Unknown writes retain their exact payload/key; stale edits survive explicit recovery, and a saved note followed by failed refresh cannot be submitted as a fresh write. Teachers receive an acknowledgement-only view; students never fetch the notes endpoint. A missing learner leads back to onboarding and no active named teacher leaves sharing unavailable. Current read history is capped at 50 and does not imply complete pagination. Screenshot fixtures use synthetic data; screenshot-only styling hides Next development indicators without changing app content.

Teacher acknowledgement spacing correction, 14 October: note cards use 24px desktop/20px mobile padding and 16px content gaps. Completed acknowledgements omit empty action containers. Review panels and metadata rows have no top border; intro paragraphs use explicit margins to prevent inherited extra whitespace.


## Private support conversations

The teal introduction leads to a distinct, always-visible emergency guidance panel. Safety reporting stays free without Pro; anonymous users can read India 112 guidance without fetching cases. A lavender case-history pane holds status filtering and cursor pagination beside a white conversation surface. Cream marks the explicit request/reply review. Desktop uses 24px outer padding; mobile uses 16px with 20px content insets and stacked controls. Text status labels and minimal author labels do not rely on color or expose update actor IDs.

Guardians, teachers and students read only their own cases. The newest visible update page loads first; earlier pages appear chronologically above it. Resolved/closed cases show their resolution without a reply form. Creating/replying requires review and acknowledgement. Drafts block selection/filter changes; uncertain writes freeze editing and replay the exact request/key, stale versions retain text for a fresh review after recovery, and saved-but-unrefreshed results block further decisions. Cases are not emergency response, refunds or replacement fulfilment. The development service has no live operator or notification delivery; staff queues and dispute reviews are implemented in F17.


## Arrangement closure and replacement

A teal introduction anchors the guardian-only Arrangements & replacement workspace. Lavender identifies the actual arrangement status; a white summary names the learner/teacher and monthly amount. Cream carries the final effects review. Preserve the 24px desktop/16px mobile outer gutters and 24px/20px card padding. IST windows and editable subject, format, language, locality and exact-paise budget remain visibly labelled. No operational metrics or replacement guarantee are invented.

Separate close-only and close-and-request-replacement decisions. Both review cancellation of future scheduled lessons/meeting access, timetable ending, withdrawal of named note access and preservation of past/financial records. Required acknowledgement precedes a versioned, idempotent write. Replacements retain the owned learner/region, exclude the previous teacher and follow normal shortlist/demo/terms/timetable review. Unknown writes freeze editing and retain the exact operation/key; stale versions preserve entries for a fresh review, and saved results with failed refresh block another decision. Closed arrangements derive replacement progress from the latest 50 request records and link to support; financial fulfilment remains separate. Students/teachers never query private guardian criteria here.


## Owner privacy requests

Reuse the teal introduction, white owned-record form, lavender status and cream effects review with consistent 24px/16px outer gutters. Guardians select their account, learner or private note; teachers select only their own account. Proposed corrections remain text, with explicit name-versus-note limits. Deletion review explains immediate note unsharing or wider consent/student/discovery pause, retained evidence and separate file/backup handling. Saved requests remain awaiting review until the owner API reports completion/rejection; rejection does not restore consent or approval automatically. Unknown writes retain the original operation/key and freeze editing; saved-but-unrefreshed results block new requests. History is the latest 50; approved note corrections stay private. Students never query privacy or note records.


## Teacher reviewer workspace

The teal introduction anchors a private evidence-first workspace, with lavender status and current revision, white evidence/check history and cream final assessment. Only ADMIN/REVIEWER roles enter; staff MFA remains outside all private content and queries. Downloads exist only for scanner-cleared evidence; a quarantined retry queues work rather than claiming safety. Reviewers explicitly choose pass/fail, validity in IST, matching clean evidence and full declared capability coverage. Existing immutable check kinds are unavailable on the same revision. Current passed checks and accepted fee terms enable an approval review; missing/old/expired/failed checks leave approval unavailable, and the server rechecks. Self-review offers no private check/evidence queries or decisions. Suspension explains discovery/booking/note effects and separate paid-booking review. Drafts freeze selection during uncertain/stale decisions and survive explicit recovery. Latest-50 queue/history bounds and live staffing limits remain visible. Shared Notice wraps mixed prose/link children into a single flow to avoid grid-induced broken sentences.


## Operator matching

Use the established teal brief, lavender search path/eligibility tags, white current candidates/history and cream review. Manual requests retain the guardian's named teacher; assisted requests use a reviewed rules pool. Show recorded rule scores and reasons, never confidence or invented fit claims. Operators may select, exclude and reorder current eligible candidates but cannot bypass screening, coverage, budget, travel, capacity, schedule, consent or replacement exclusions. Matching rebuild and shortlist publication are separate acknowledged decisions. The reviewed publication replaces the current set; guardian views, teacher acceptance and assignment remain distinct evidence. Unpublished candidates survive reload through a scoped API. Unknown decisions freeze selection and reuse the exact operation/key; stale edits preserve order/reason for review against refreshed metadata. No-match/schedule states give a next action without relaxing eligibility. Explicit limits remain 50 queue/runs, 200 inspected teachers and 10 shortlisted candidates.


## Staff support and disputes

The teal introduction anchors three keyboard-accessible case/demo/attendance tabs. Lavender distinguishes regional status and staff-only messages; white holds evidence and conversations; cream marks acknowledged decisions. Wrapped mobile tabs must stay inside their container above filters, with 20px mobile/24px desktop content gaps and the established outer gutters. Case queues and update history are paginated; optional demo history uses its scoped paginated API. Server filters cover status, category and self/unassigned ownership. Self-assignment/release supports handoff; staff provisioning uses the independently approved B2 workflow.

Private staff notes and owner-visible replies have explicit audience labels before confirmation and in history. Reviewed triage does not substitute for a linked dispute outcome. Demo review loads its linked case evidence; attendance review shows reported participant reasons and linked case references without private feedback or actor identities. Decisions retain versions, reasons and exact uncertain retry operations. Stale decisions preserve edits for renewed review; saved refresh failures block another action until recovery. Legacy attendance case association is owner-bound by canonical description until support-history migration adds an explicit relation. Attendance eligibility and case resolution do not establish financial settlement. Live support hours, safeguarding operation and notification delivery remain open.


## Finance records and provider-status review

Use a ledger layout with the established teal introduction, lavender recorded-status badges and amount dividers, white evidence surfaces and cream query review. Keep Manrope, exact INR/paise formatting, 24px desktop/16px mobile outer gutters and 24px/20px card padding. Stack rows and reference fields on mobile with full UUID wrapping. Accessible definition lists associate recorded amounts with their actual counts; no invented chart or settlement metric is shown.

MFA-verified ADMIN/FINANCE have audited global finance access, matching the existing report boundary. Invoice, checkout, capture, refund-request and payable queues have server type/status/exact-ID filters and cursor pagination. Stable ID-descending order does not imply chronology; invoice creation dates remain explicitly unrecorded. Aggregate captures/refund requests/payables use whole IST calendar dates with an exclusive next-day boundary. Outstanding platform invoices use a visibly separate current/all-date basis. Development totals may include sandbox records.

Linked checkout reads expose current local status/version and provider mode before a separate acknowledged query. Query reasons freeze navigation between records and can be explicitly discarded. Uncertain results retain their exact operation/key; stale versions preserve the reason for renewed review; saved-but-unrefreshed decisions block another action until recovery. Sandbox query results establish only local evidence. A live provider paid response does not repair the local order or prove bank settlement. No refund, payout or adjustment execution controls are offered until the corresponding provider workflows exist. Error/empty/retry states remain separate for totals and queues.


## Administrator console

Use the established teal introduction, lavender workspace/status context, white evidence surfaces and cream acknowledged review. The wrapped tab strip keeps all controls inside its container; inactive text uses charcoal on transparent lavender and active text teal on white to pass contrast. Preserve 24px desktop/16px mobile outer gutters and 24px/20px card insets. Privacy explanation alerts have a separate 24px/20px gap before the cream review. Account/resource IDs wrap on mobile rather than forcing overflow.

Only MFA-verified ADMIN accesses the console. People/linkage inspection excludes contact/session/notes/feedback data; staff grants use the independently approved B2 workflow. Supply groups represent recorded profile status, not qualified/current capacity. Commercial examples call existing pricing rules without allowing accepted-term edits; versioned policy administration remains separate. Runtime provider modes are configuration evidence, not uptime or qualification, and the release verifier remains blocked. Specialist evidence, matching, support and finance workspaces remain separate routes.

Flag, privacy, permitted private-media retry and deletion replay decisions need a reason, visible effects review and acknowledgement. Privacy correction explains note unsharing/acknowledgement clearing or owned-name updates; deletion requires an explicit retention exception and policy. Rejection never promises restored consent or approval. Self-review is unavailable and server denied. Deletion replay needs a separately verified restore reference, not a restore action. Media retry remains queued until the worker supplies actual outcomes; money/meeting/notification jobs cannot use that retry. Tabs/filters stay locked while a decision is open; unknown writes retain their exact key/body, stale metadata preserves inputs for renewed review, and saved-refresh failures prevent another action until recovery. Account/privacy/audit reads paginate; linkage/supply/media-job bounds are stated explicitly.


## Operational reports

Use teal for manual-search/live-mode series and principal recorded totals, lavender for assisted-search/sandbox series, and cream with a teal outline for unrecorded capture modes. Keep labels and legends charcoal; pale swatches need an outline. The shared shadcn-style chart primitive uses pinned Recharts, keyboard tooltips, disabled animation and exact accessible tables. Preserve the existing desktop/mobile gutters and card insets; stack path tables and observation cards on narrow screens.

Report date drafts apply explicitly. Presets use whole IST calendar dates, with the displayed through-date mapped to the exclusive next-day boundary. Preserve region selection between views; ADMIN chooses regions and OPERATOR is server-scoped to the assigned region. Request creation selects the cohort and current recorded evidence supplies independent milestones; a chart must not imply ordered stage transitions or a historical snapshot at the range end. Empty cohorts have no estimable rate.

Day-30 continuation requires mature starts and qualified observations. Display continued, stopped, unknown, missing observation, immature and missing-start evidence separately, with known-outcome denominators and observed/mature coverage. Finance reports belong to ADMIN/FINANCE global scope and separate capture modes from refund requests, current-all-time invoice dues and dated payable obligations. Never combine these into a cash balance or claim settlement. Missing classification and failed reads need explicit notices and retry; charts and data tables must derive from the same response.


## Dedicated role overviews

Keep Manrope and the approved tokens: teal #034F46 carries recorded activity, lavender #F0D7FF is the next-class rail, cream #FFFFEB marks the overall service total/canvas, white #FFFFFF holds forms and evidence, charcoal #17201F holds text and muted #586562 explains boundaries. Use the established card gutters/insets. The memorable element is the lavender upcoming-class block inside each learner record; other measures remain quiet and left aligned. A single learner fills the width, multiple learners form two desktop columns and stack on mobile.

```text
Family:  period -> family activity -> learner [next class / current teacher] -> family next steps
Student: period -> own activity   -> own learner [next class / teacher]
Teacher: period -> teaching activity + completeness / feedback sample -> profile -> assigned learners
```

Use the typed role-scoped learning read rather than computing totals from a bounded lesson preview. Default rolling 30 days has a server-owned read-time end; calendar/custom dates apply explicitly and map whole IST days to an exclusive next-day boundary. Show exact timestamps, update time and current-record basis. Recurring/revision lesson tables and demo outcomes have independent counts. Completed status differs from completed, ended, undisputed PRESENT/LATE classes taken. Teacher completeness uses recorded undisputed attendance over ended non-cancelled lessons; feedback must show its sample size and a null/unestimable state. Do not invent quality/improvement or teacher-responsibility claims from absence/cancellation/no-show reports.

Per-learner activity is period-bound; current assignment and next scheduled class are current evidence outside that period. Learner pagination preserves full scoped totals, resets on changed applied dates and is absent when one page suffices. Student screens and responses omit membership/financial/feedback data and supervised family controls. Guardian recorded Pro allowance includes used/reserved/unreserved evidence and an explicit disabled-calling limitation. Errors distinguish unavailable, empty and last-successful retained records, with labelled refresh/retry.


## Hiring overviews and discovery emphasis

Use a white introduction with the role's next action, a single teal bar for current recorded counts, lavender for selected views/status and teacher response effects, and cream for acknowledged review. Manrope, existing 24px/16px outer gutters and 24px/20px evidence-card insets remain. Keep headings and labels left aligned. Manual search and assisted search are primary navigation actions; the profile action starts an enquiry and explains that it does not hire or charge. The homepage no longer promotes individual revision booking.

```text
Student:  explore teachers -> own enquiry / teacher arrangement -> learner profile -> support
Guardian: find teacher    -> enquiries / arrangements -> learner permissions -> privacy / support
Teacher:  application     -> screening status -> assigned enquiries / arrangements -> response review
Admin:    marketplace     -> aggregate queues -> screening / matching / governance drill-downs
```

The primary overview uses /dashboard/hiring, avoiding automatic legacy lesson/financial dashboard reads. Student projections omit budgets, prices, candidate responses and other-family records. Teacher previews omit child aliases before an arrangement, require current presented opportunities and active family permission, and recheck fit. ADMIN aggregates require MFA and audit, and route detailed actions to the existing protected workspaces. Application status, screening currency and fee acceptance are separate evidence fields. Interest, choice, terms acceptance and independent start confirmations must remain visibly distinct.

Teacher response reviews require acknowledgement. Unknown results reuse their exact body/key, stale versions need a fresh read and renewed acknowledgement, and saved-refresh failures prevent a second write. Read errors distinguish unavailable, empty and retained previous records; invalid scoped pagination can return to the first page. Enquiry links select the matching owned request. Preserve deferred class/history routes; keep class booking, attendance and Pro tools out of the primary navigation. H2/H3 still own enquiry simplification and separation of mandatory demo/timetable dependencies.


## Detailed onboarding, optional demos

The teacher flow now has five focused steps: introduction, private address, education/work, preferences and review. Four labelled education groups reveal only fields relevant to their status and official result format. Marks show a calculated percentage; CGPA never gets an invented conversion. New or independent teachers may leave prior employment empty. Experience certificate/reference declarations lead to the existing private scanned evidence upload after submission. Review edit actions return to the relevant step and preserve saved later details. Private owner and reviewer summaries show the submitted declarations explicitly as unverified until independent screening.

Learner school and class subjects appear beside class/board, behind guardian verification and consent, distinct from requested tuition subject. Known school details are read-only in this flow. Teacher demo preference uses two explicit radio choices in a restrained lavender group; opted-in public cards/profile carry a teal-text badge. Declining does not block hiring. Eligible accepted options can open pending terms without a demo, while existing requested demos still need their own cancellation/outcome/review. No hiring-rate or guaranteed-conversion claim is made.


## Hiring-term review

The primary guardian/teacher dashboard now opens a focused white review surface beneath the arrangement list, with keyboard focus on its heading. Existing Manrope/cream/white/teal tokens remain; lavender highlights the optional-demo/no-timetable explanation and a teal button performs the acknowledged acceptance. The review uses recorded monthly tuition (including paise), policy, proposed teacher placement fee and two acceptance states. It closes after a confirmed save, preserves uncertain writes and refreshes stale versions with a renewed acknowledgement. Student cards stay read-only without financial or write metadata. Confirmed hiring terms remain distinct from verified teaching/payment/start evidence and the retained class lifecycle.


## Additional enquiry recovery

Use the existing five-step guardian form, white surfaces, cream canvas, teal actions and lavender progress markers. A visible saved-progress notice explains that current-step edits persist on Continue. Initial onboarding stays separate from additional enquiries; an explicit action starts another draft only after the preceding one is submitted. Unknown submissions/restarts retry the same body/key, while version conflicts preserve local edits until explicit reload. A conflicting teacher link offers a route back to the existing saved draft instead of overwriting criteria. No learner data is placed in browser storage.


## Explicit draft discard and teacher choice

An unfinished initial/additional enquiry offers a separate review panel before discarding criteria. The lavender surface, teal actions and existing Manrope hierarchy distinguish this temporary-draft decision from account deletion or arrangement cancellation. Consequences explicitly include saved criteria and unsaved form edits; submitted enquiries and learner profiles stay intact. A required acknowledgement precedes the write. The review receives keyboard focus and locks the underlying wizard; cancellation preserves edits. Unknown responses freeze controls and retry the identical body/key; stale versions require reload and renewed acknowledgement. A conflicting teacher link offers the same review and continues to that selected teacher only after a confirmed discard. Navigation uses fixed internal paths.


## Broad enquiry availability

New enquiries default to weekly preferences: explicit weekdays and broad from/until times in IST, with no lesson date or duration. The lavender mode selector offers optional specific dates; existing dated drafts retain that mode. The shared weekly editor/summary is used in guardian intake and family preference updates, and operator review displays the same criteria. Ranges validate before review/save; duplicate or overlapping weekday ranges fail. Midnight end times mean the end of the selected day. Saved drafts retain their original format. Changes to an existing enquiry still require acknowledgement of shortlist/choice invalidation. These are family preferences and current overlap evidence, never a confirmed class timetable.

Teacher application revisions reuse the five-step application form. Continue saves each validated step to the private revision draft; returning/reloading restores saved fields while fee acknowledgement remains fresh. The save note distinguishes saved progress from unsaved current-step changes and from resubmission. A stale application opens a single white recovery panel: lavender saved/current headline comparison, clear consequences, and acknowledged draft discard. Approval/evidence are retained until explicit resubmission reopens screening. Unknown saves/submissions freeze editing and replay the same body/key; draft load failures block editing.

Student onboarding after activation now pairs a lavender guardian/privacy notice with a white optional-preferences form on cream. Subject chips reuse existing choice controls; language and learning notes are optional, with a visible 500-character limit and no contact/school fields. Teal save, skip/dashboard and discovery paths keep control with the learner without implying hiring authority. Saved preferences do not change guardian enquiries or ranking. Draft load errors block edits, uncertain writes freeze inputs and replay the same body/key, and stale writes retain input until an explicit reload.

Guardian invitation management now shows private status and expiry after reload without retrieving a code. First creation and replacement use a lavender consequence review with explicit guardian acknowledgement; cancel preserves the current invitation. The code is hidden until revealed and stays only in component memory, outside query caches, links and browser storage. Unknown writes lock learner/consent changes and retry the original body/key. A metadata-only replay requires status refresh and a new acknowledged replacement to obtain another code. Activated learners use existing device controls.

The primary enquiry page now shows a four-step recorded-progress strip and a lavender hiring handoff. Teacher replies, explicit choice and opening terms stay separate. The handoff opens the exact owned arrangement in the hiring dashboard, independent of pagination, with guardian/teacher acceptance and mutual confirmation states. Invalid enquiry links never silently substitute another request. Legacy timetable/service-start controls remain on the secondary bookings route, outside the primary enquiry journey.

No-match and future coverage are separate recovery paths. Empty discovery offers assisted search; an existing unmatched/declined/expired enquiry retains its data and links to availability, manual search and support. The public future-coverage page pairs a lavender scope explanation with a white guardian-only criteria form and private recorded history. No child name/contact/school/address fields are collected. Missing criteria receive focus and invalid-field semantics; unknown saves replay the original body/key, confirmed saves prevent accidental resubmission, and failed history reads block creation. Mobile history headings/actions wrap independently.

Support links on enquiries and arrangements retain the owned record through case creation, filtering and private progress. A lavender context panel shows minimal subject/format/reference metadata, with return-to-enquiry, hiring confirmation and guardian-only replacement routes. Context failures block unlinked creation; each participant sees only their own conversations. Replacement links select the exact arrangement; missing IDs never substitute another one. Replacement progress opens the exact new enquiry. Broad weekly preferences are the default for new replacement criteria, with shared optional dated input and explicit closure/record-retention review.

Teacher engagement preferences use a separate cream radio group beside the lavender optional-demo choice: no lock-in, 15 days or 30 days, with no silent default. Review edit actions return to teaching preferences. Public cards/profile and private owner/reviewer summaries reuse one label, including an explicit unrecorded state for legacy profiles. Copy identifies the declaration and current lack of cancellation enforcement; it does not imply accepted contractual terms. Existing responsive gutters, focus, validation and save/retry controls apply.

Education profiles use a separate two-step details → review/save flow, with a lavender scope/privacy sidebar, cream canvas, white form and teal actions. The form reveals early-years level, school class/board or college course/university/year; subjects stay distinct from tuition requests. Desktop fields use two columns and mobile one, with explicit labels, focusable review heading and inline errors. Saved profiles are paginated; verification/consent/privacy/read-only states block data entry. Unknown creation freezes edits and replays the identical body/key. Failed reads preserve form input, and confirmed success cannot submit again. Regional pilot limits remain explicit. Broader student independence/delegation is not implied.


Teacher coverage uses cream teaching-area panels within the existing five-step application, with explicit stage, comma-separated subjects and school boards, and lavender selected class/level/year choices. Separate areas prevent accidental curriculum combinations. Review, private teacher details and reviewer assessment show the same complete declarations; public cards show a bounded summary and profiles show all areas. Discovery adds stage-specific controls, including custom subjects/boards and college course/year, while retaining manual/assisted tabs. Linked early-years/college enquiries display the saved education instead of fictitious school fields. Regional waitlists reveal only the relevant education criteria and retain their privacy/retry controls. Mobile panels wrap with existing form gutters; validation, accessible labels and focus stay within the shared form system.

Learner profile editing reuses the education details → review → save flow. An edit action reads the latest exact profile before opening; the lavender context names the learner and explains that access permissions remain unchanged. Uncertain saves freeze selection/cancel/edit controls and repeat the same versioned operation. Conflicts retain local review until an explicit discard-and-reload action; fresh data always requires another review. Historical profiles route to name-correction/privacy and education support instead of silently changing matching or recorded history. Deleted profiles remain closed. Forms stay in memory, with focused headings and mobile gutters from the existing learner layout.

Guardian setup separates account/permission/learner preparation from tuition enquiries. A lavender ordered path sits beside one white next-action panel on cream, with Manrope, teal actions and a cream teacher-discovery inset. Blocked verification/privacy states collect no learner details; consent is explicit and purpose-specific. Unknown permission results offer status checking rather than another grant. Existing drafts get a resume action. The add-profile handoff opens the existing form only after the profile API authorizes entry, then consumes its non-sensitive URL flag. Returning from a confirmed profile save re-reads setup progress. Main action links use the shared button styles with explicit white foreground on the default teal variant.

Activated-student setup uses details/support → review/save, with a lavender authority/privacy panel, cream education summary, white form and teal actions. Education is read-only and explicitly acknowledged; support choices have no default and do not grant account authority. Optional subjects follow the actual education profile with bounded custom additions. Review preserves edits, uncertain confirmations freeze inputs and retry the identical operation, and stale profiles require explicit reload and another review. Permission loss hides private content. Mobile controls wrap, labels remain visible, and distinct keyed footer actions prevent review/edit clicks from submitting the next step.

Student device labels stay in the guardian access workspace, beside the existing session identifier, expiry and revoke action. White session rows use a compact wrapping action group; the selected naming form uses lavender to distinguish a private reminder from an access change. Label entry is optional, prefilled for renaming and blank to clear. The focused field, plain privacy guidance, confirmed status and frozen identical retries reuse the family recovery patterns. Labels are explicitly unverified descriptions; no browser or location fingerprinting is implied.

Student device pagination adds a compact wrapping footer beneath the existing white session list: current page status and shared previous/next controls. Browsing moves keyboard focus to the list heading after a successful read; failed pages hide stale actions and retain refresh/back recovery. Open naming/revocation/authorization forms disable pagination so entered details and exact selected sessions remain intact. Confirmed mutations refresh the current page, and a newly empty later page explains how to return. Cursor state stays in memory and resets when the selected learner changes. Existing teal/cream/lavender surfaces remain unchanged.

## Mobile controls and navigation refinement — 16 October 2026

Phone screens use 16px outer gutters, 20px family-card insets and 20px gaps without duplicated card margins. Form actions stack at full width in DOM order with readable 14px labels and 44–48px minimum touch targets; device action pairs share equal width/height and stack on the narrowest phones. Naming confirmation removes the compounded field/action spacing. Sign-in inputs use at least 16px text to avoid iPhone focus zoom, and email recovery actions align. The header uses concise Dashboard/Sign in labels and a 44px menu target instead of shrinking text.

Mobile dashboard navigation is an explicit expanded/collapsed shared button with the current section, aria-expanded/controls, and a role-scoped grid of links. Selection closes the menu; desktop retains its sidebar. The student setup form comes first in DOM and on phones, with the full lavender privacy/authority guide below; desktop positions the guide alongside the form using grid areas. Keyboard order follows the form-first DOM. Shared button transitions animate colors/borders/shadows rather than geometry, preventing resizing during layout changes. No authority, consent or provider behavior changes.

Hindi sign-in keeps the existing teal/cream/lavender layout and exposes a labelled English/हिन्दी select on every phone width. The current choice updates header/sign-in copy through the existing language state and remembers only the non-sensitive interface language. Input, OTP challenge and semantic error keys stay in memory so switching language preserves values, deadlines and translated validation. The root document language, title, description and interface follow the current locale, including server rendering from the non-sensitive language cookie. Hindi headings use natural line height and zero negative tracking. Optional API locale selects the email template without granting permissions. OTP entry accepts ASCII or Devanagari digits and sends the same ASCII six-digit code. All other screens and the footer are covered by the final whole-app localization increment; live email qualification remains separate.

Independent student signup is a form-first readiness → education → review flow. A restrained lavender ownership guide sits beside the white form on cream; teal anchors primary actions. The explicit 18+ declaration is separate from learning readiness and never shown as verified age. Guided/under-18 choices offer the existing guardian invitation route without collecting education details. School and college fields reveal by stage; new consent is explicit at review. The language selector stays visible at 320px. Confirmed accounts open their own education dashboard, profile editing, public discovery and account privacy; student enquiry/hiring controls remain visibly pending. Education stays in memory until saved, and uncertain writes freeze changes and retry the identical body/key. Existing family, teacher and staff accounts cannot be converted.

Independent student enquiries reuse the weekly-availability and decision/retry controls. A white form on cream records subject, format, language, locality and monthly budget, followed by explicit review and acknowledgement. A lavender education snapshot includes only matching criteria and profile version; the separate lavender help panel explains staff review without promising a match or booking. Teacher-profile links bind the exact public teacher ID and slug; unavailable/mismatched links do not substitute another teacher. History/detail are owner-scoped and paginated; withdrawal has a separate consequence review. A regional MFA staff queue has a distinct navigation entry and read-only criteria projection. Unknown decisions freeze editing and retry the original key/body. The enquiry workspace follows the shared English/Hindi interface preference. Mobile uses one field column, readable native time inputs and full-width actions.

## Independent learning decisions and optional support

The independent dashboard links private education, enquiry previews, arrangements, optional learning support, devices/recovery, help and privacy. The enquiry detail shows the actual sequence from staff review to teacher response and explicit student selection; staff review/publish controls are scoped to their queue. Tuition terms group fee/demo/lock-in declarations beside separate acceptance status, with explicit coordination-email consent. Closure and replacement are reviewed separately and explain their actual effects. No class booking or live payment is implied.

Optional support uses a lavender explanation panel and names the exact ADVICE/MANAGE scopes before either party confirms. Account ownership, login, devices and privacy controls stay with the adult student. Invitations, expiry, replacement and immediate revocation are visible; accepted supporters open a separate shared-learning profile. Narrow screens stack actions and terms with 44–48px controls, wrapping text and visible labels. The new independent criteria, shortlist, hiring, supporter and device surfaces support English/Hindi with existing self-hosted typography. Shared support, staff tools and retained legacy screens are also fully localized.

## Owner privacy localization

Privacy correction/deletion forms and history offer a visible page-level English/Hindi selector, including on narrow phones. Switching language keeps entered text, review state, acknowledgement and pending retry identity. Canonical API enums, ownership and request payloads are unchanged. User-written reasons/corrections and reviewer outcomes are shown as authored. Hindi uses the existing self-hosted Devanagari font, with readable line height and stacked mobile actions/locale control. Retention, review, immediate processing effects and lack of live notification delivery remain explicit in both languages.

## Hindi owner support

The shared support page reuses the established teal introduction, lavender enquiry/history surfaces, white conversation and cream canvas. Its page-level English/Hindi selector remains visible at 360px, including before sign-in. Hindi uses the existing self-hosted Devanagari font, untracked headings and comfortable line height; mobile request/reply actions stack and wrap. Forms, categories/statuses, safety guidance, linked progress, pagination controls and recovery feedback translate at display time. Drafts, acknowledgements, uncertain operation keys, canonical API values and user/staff-authored messages remain intact when language changes. Shared footer/development banners are covered by the separate shared-navigation increment; operator consoles are included in the completed whole-app localization.

## Shared Hindi navigation and notices

Keep the established cream header, teal actions, neutral footer and self-hosted Manrope/Devanagari fonts. Header/footer, skip-link labels and preview/live-service limitations follow the existing stored language preference along with all page content. Hindi footer headings use natural spacing. At mobile widths, language and sign-out actions sit inside the navigation disclosure rather than crowding the logo/dashboard row. Its links/buttons have 44px minimum targets; Escape closes the disclosure and restores focus to the toggle. Position the disclosure relative to the header so wrapped Hindi preview text cannot overlap it. Page bodies and access-transition notices now follow the same language through the shared locale context.


## Completed whole-app Hindi interface

All forms, role dashboards, staff consoles and retained legacy workflows use the shared `locale.tsx` display translator and `hindi-messages.ts` catalogue. The existing language preference is mirrored to a non-sensitive SameSite cookie so initial server HTML, metadata and recovery/404/loading screens match the selected language. The language selector remains usable on phones. Hindi headings and controls wrap naturally with the self-hosted Devanagari font.

Translate interface labels, structured statuses, review summaries, validation, notices, chart legends/tooltips, accessible names and declared curriculum labels. Format dates, times and currency with the interface locale. Native invalid-field guidance and the private evidence upload chooser also use Hindi. Preserve names, addresses, custom subjects/courses, institution/work descriptions, filenames and user/staff-authored conversations exactly as entered. Canonical API enum values and payloads remain unchanged; translation is never an authorization decision.

Changing language preserves current form values, acknowledgement/review state, pending retry keys and saved drafts. Unknown server failures receive safe localized guidance without exposing raw internals. Catalogue tests validate placeholders and rendered-copy coverage; desktop/mobile browser journeys cover all roles and production checks verify cookie-backed server rendering and recovery. Hindi localization is complete; launch/provider qualification remains a separate release concern.


## Teacher discovery pages

Search keeps the existing teacher cards and manual/assisted tabs. A lavender continuation surface separates the end of the visible grid from additional matches, with teal progress text and a shared outline button. Phone actions fill the available width with at least 48px height. Counts describe the teachers shown rather than an unprovided total. Loading exposes busy state; a failed additional page keeps the current cards and criteria, while an unreadable first page does not masquerade as no supply. Repeated cursors stop with a refresh action, not an end-of-results claim. Final-page completion returns keyboard focus to the result summary. All copy follows the English/Hindi preference.


## Teacher profile recovery

A concise navigation row pairs the directory link with a shared outline Refresh profile control. Unavailable and temporarily unreadable profiles use a lavender recovery surface with teal headings, one primary retry and secondary manual/assisted discovery links. A failed refresh removes the cached profile and enquiry actions until a current read succeeds. Retry retains the recovery context while loading; headings receive keyboard focus after failure and successful recovery. On phones, actions stack with full-width touch targets. Interface copy is English/Hindi; raw server errors are never displayed.


Onboarding recovery retains the current form and its uncertain-write identity during temporary setup-read failures. Keep it visibly inactive and inert until fresh context succeeds; retries restore focus without clearing local edits. Access denial removes private cached details. A confirmed teacher application with a failed workspace handoff offers opening recovery, not another application submission. English/Hindi copy must distinguish saved data from an unconfirmed write.

### B2 staff access — 18 October 2026

Use the existing design system: deep teal #034F46 anchors decisions, lavender #F0D7FF marks the independent review queue, cream #FFFFEB holds effect summaries, white #FFFFFF holds editable records, charcoal text and muted grey helpers retain contrast. Manrope and Noto Sans Devanagari keep the established English/Hindi hierarchy. Left-align staff identity and role details; current access and review history share two desktop columns and become a single reading column below 800px. Open one full-width review below them, focus it on entry and restore focus on explicit close. Lavender identifies the second-person queue rather than decorating every record. Teal action hierarchy and a quiet cream effects summary make the critical distinction visible: proposing does not grant access; an independently approved change does. Shared controls, 44px actions and wrapping layouts preserve phone and keyboard use.

The new Staff access console tab has current staff, paginated/filter-bound approval history and a reviewed dedicated-email/role/region proposal. The same review surface supports independent approval/rejection and proposer cancellation, with target/self/expiry restrictions. Protected evidence references are plain text; identity documents and secrets do not belong here. Approval effects explicitly include device sign-out and fresh authenticator enrollment. Navigation locks protect open reviews; lost responses preserve exact retries, and failed reads hide private details without destroying the controller. Production identity/key custody and real operator qualification remain separate.

### B3 fees and coverage — design plan

Keep cream #FFFFEB for the current-policy summary, white #FFFFFF for editable records, deep teal #034F46 for confirmed actions, lavender #F0D7FF for proposals awaiting a second administrator, and the established charcoal/grey text. Manrope/Noto Devanagari preserve English/Hindi hierarchy. A current-fee summary and region list lead into one full-width review, followed by immutable history; mobile reads in that order. Before/after values and explicit scope effects carry the visual emphasis rather than decorative tiles. Restoring a revision shows the full proposed snapshot and preserves newer region IDs as disabled. This extends the existing administrative design language while making current settings and unapplied proposals distinct. Use shared controls,44px actions, keyboard focus, honest loading/empty/recovery states and no live-charge promise.

B3 implemented review uses current fee/coverage, a separate independent proposal queue and immutable applied versions. Before/after comparison shows changed coverage and the exact rate/cap; rollback is a new proposal. Private failed reads hide review data while preserving exact uncertain-write retries. Recorded outcomes remain visible after their pending row disappears. Open reviews lock tab/page movement and explicit close restores heading focus. Teacher application/retained-term copy now defers to each arrangement’s recorded fee; the retained terms screen shows the actual server amount. Source types and automated bilingual/mobile/keyboard acceptance cover these additions.

## B1 guardian relationship review

Plan before implementation: preserve teal#034F46 actions/focus, lavender#F0D7FF student acknowledgment/management summaries, cream#FFFFEB explanation surfaces, white#FFFFFF forms and charcoal#17201F text with muted#586562 helpers. Keep Manrope/Noto Sans Devanagari. Use one left-aligned relationship worksheet progressing from declarations to a school-report upload and staff outcome, with an adjacent narrow evidence/privacy explanation on desktop and a single column on phones. Student acknowledgment is a separate, clearly named action; staff sees evidence, missing-name call requirements and explicit attestations together. Native labels, shared shadcn controls, 44px actions, bounded line lengths and no inline document preview protect readability and privacy.

Review against brief: avoid a generic multi-card dashboard and decorative progress percentages. The distinctive structure is the relationship worksheet itself: cream protects the explanation, lavender identifies who manages learning, and teal is reserved for the next confirmed action. Show authored names as entered in both languages. Before approval, explain what is awaiting acknowledgment, scan or staff review; after approval, lead into separate learning consent and learner setup. Preserve uncertain request keys, lock private navigation during writes, hide cached details on read denial, and restore keyboard focus on explicit close. Actual call scheduling/email delivery and launch qualification retain their separate operational gates.


## L3 family learning permissions and student choices

One focused family-management screen names the learner and current guardian choice, then offers three plain-language options and a separate effects review. A lavender current-choice panel leads into a white worksheet, cream consent/financial boundaries and teal confirmation. Student views explain the same choice without offering a permission override. Under15 guidance stays separate from adult status or consent. The student teacher-choice page reuses existing shortlist and optional-demo review, with a concise subject/format/language/area/budget/weekly enquiry form and a reviewed per-enquiry guardian-help option. Learning terms and actual financial commencement remain distinct. Preserve private-read recovery, exact uncertain retries, cursor navigation,44px mobile controls, keyboard focus and complete English/Hindi copy. Do not add individual-class management.

## T2 minimum tuition and financial commencement

Design plan: retain teal #034F46 for confirmed actions and financial text, lavender #F0D7FF for the frozen agreement surface, cream #FFFFEB for help/exception guidance, white #FFFFFF for editable worksheets and charcoal #17201F with muted #586562 for readable content. Manrope leads English; Noto Sans Devanagari keeps Hindi line height generous. Use a left-aligned agreement sheet: the recorded period/monthly amount beside the unpaid minimum, then two compact sections for commencement and confirmed credits, followed by an always-reachable help strip and chronological records. Phones stack all sections and use 44px full-width actions with natural wrapping.

Review against the brief: this is a shared tuition agreement, not a payment checkout or class calendar. Avoid decorative charts, generic statistic tiles or implied payment success. Lavender identifies immutable terms, cream identifies assistance without a debt barrier, and teal denotes the next reviewed decision. Each write has a separate effects review, explicit acknowledgment, exact uncertain retry and private-read recovery. Show original, assessed and outstanding amounts distinctly. Independent staff see a scoped assessment queue and linked support evidence. Complete English/Hindi validation, dates, currency and keyboard labels; preserve authored receipt labels and staff reasons.

T2 visual acceptance: identify teacher/learner/subject before amounts, keep the frozen agreement distinct from the assessed balance, and keep assistance separate from payment actions. English desktop and Hindi participant/staff phone captures were inspected after fixing review focus and shortening receipt/amount accessible names through labelled helper text. All21 feature browser cases and115 strict-CSP production cases pass; the real web/API/database journey confirms the reviewed financial effects. No class calendar, checkout fiction or automatic refund was introduced.

## B8 notification delivery and recovery

Keep teal#034F46 for actions, lavender#F0D7FF for the distinction between accepted and delivered, cream#FFFFEB for preview/privacy/recovery guidance, white#FFFFFF for the delivery record and charcoal#17201F/muted#586562 text. Retain Manrope/Noto Sans Devanagari. A simple update list opens a focused record with attempt and signed-receipt timelines; staff has a scoped failure queue and a separate reason/acknowledgment review. Avoid decorative delivery percentages or treating sandbox/provider acceptance as inbox success. Lock history/filter movement during reviews/uncertain writes, hide denied private reads and retain the controller if a recovered row leaves the failed filter. Sign-in preserves one request identity after lost responses. Mobile actions wrap at44px; English/Hindi labels, native validation and keyboard focus remain complete.

## B13 staff service follow-up worksheet

Plan: teal#034F46 for claim/confirm actions, lavender#F0D7FF for the separation of contact outcomes from immutable cohort evidence, cream#FFFFEB for review and support guidance, white#FFFFFF for readable records, charcoal#17201F and muted#586562 text. Retain Manrope/Noto Sans Devanagari. Left-align one oldest-first queue with concise due/status/assignment controls; opening a learner-teacher row reveals the arrangement, claim ownership, a contact worksheet, a separate effects review and a chronological attempt history. Phones stack controls with44px targets and generous Hindi line height.

Review: this is a staff conversation follow-up, not a class calendar or decorative analytics dashboard. Avoid contact-success counters and invented delivery/continuation percentages. Identify the learner, teacher and subject before recording an attempt; show scheduling in IST, never imply a call/email was sent by the screen, and keep existing support cases reachable. Preserve exact unknown retries, private-read hiding, filter/history locks and keyboard focus. A completed task stays open long enough to acknowledge the write even after it leaves the queue.

B13 acceptance: English desktop and Hindi phone screenshots inspected;320/390/430px layouts,44px actions, native labels, opening/review/cancel/list focus, deliberate contact reveal/hide and private-read/unknown-write recovery pass. Actual commencement dates display without an invented start time. A later-page save regression was reproduced and fixed by refreshing the first queue page after a confirmed write. All17 final feature production checks pass after the earlier144-case full production pass.


24 October 2026 — F49 compact student registration row complete. All three student choices share equal-width columns from1000px upward, with20px gaps,26px padding and reduced heading/body sizes. Existing narrow-screen stacking, colours, actions and permissions remain unchanged. Both desktop geometry/no-overflow and Hindi mobile/status browser checks pass; desktop screenshot reviewed. CSS-only application change; production build and backend suites not repeated. Frontend branch delivery; no main merge/deployment. Next remains reviewed dependency remediation; existing implementation, launch and deferred backlog unchanged.

Inline completion also reuses the protected invitation issuance/recovery controls after education setup. Guardians can finish their setup actions on the same page; activating a student device remains a separate explicit authorization.
