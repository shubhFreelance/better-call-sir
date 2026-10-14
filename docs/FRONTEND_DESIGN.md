# Frontend design direction

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

Lesson records use owner-scoped date queries and cursor pagination, with Upcoming and Attendance & records tabs. Teachers can record present/late/absent only after the lesson's end, with a reason and a required recap for delivered revision lessons. Guardian/student confirmation and disputes use inline review, not browser prompts. An uncertain attendance decision freezes date/tab/pagination changes and other lesson actions. The backend allows one attendance review per person per lesson. History exposes no other actor identity; the owner-safe current-person review now preserves confirmation status after reload. Each person can review a lesson once; changed attendance after that review directs them to support. Students never query guardian timetables. Reporting/localization screens remain open.

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

The teal introduction anchors three keyboard-accessible case/demo/attendance tabs. Lavender distinguishes regional status and staff-only messages; white holds evidence and conversations; cream marks acknowledged decisions. Wrapped mobile tabs must stay inside their container above filters, with 20px mobile/24px desktop content gaps and the established outer gutters. Case queues and update history are paginated; demo history is explicitly the latest 100. Server filters cover status, category and self/unassigned ownership. Self-assignment/release supports handoff; arbitrary staff provisioning remains separate.

Private staff notes and owner-visible replies have explicit audience labels before confirmation and in history. Reviewed triage does not substitute for a linked dispute outcome. Demo review loads its linked case evidence; attendance review shows reported participant reasons and linked case references without private feedback or actor identities. Decisions retain versions, reasons and exact uncertain retry operations. Stale decisions preserve edits for renewed review; saved refresh failures block another action until recovery. Legacy attendance case association is owner-bound by canonical description until support-history migration adds an explicit relation. Attendance eligibility and case resolution do not establish financial settlement. Live support hours, safeguarding operation and notification delivery remain open.


## Finance records and provider-status review

Use a ledger layout with the established teal introduction, lavender recorded-status badges and amount dividers, white evidence surfaces and cream query review. Keep Manrope, exact INR/paise formatting, 24px desktop/16px mobile outer gutters and 24px/20px card padding. Stack rows and reference fields on mobile with full UUID wrapping. Accessible definition lists associate recorded amounts with their actual counts; no invented chart or settlement metric is shown.

MFA-verified ADMIN/FINANCE have audited global finance access, matching the existing report boundary. Invoice, checkout, capture, refund-request and payable queues have server type/status/exact-ID filters and cursor pagination. Stable ID-descending order does not imply chronology; invoice creation dates remain explicitly unrecorded. Aggregate captures/refund requests/payables use whole IST calendar dates with an exclusive next-day boundary. Outstanding platform invoices use a visibly separate current/all-date basis. Development totals may include sandbox records.

Linked checkout reads expose current local status/version and provider mode before a separate acknowledged query. Query reasons freeze navigation between records and can be explicitly discarded. Uncertain results retain their exact operation/key; stale versions preserve the reason for renewed review; saved-but-unrefreshed decisions block another action until recovery. Sandbox query results establish only local evidence. A live provider paid response does not repair the local order or prove bank settlement. No refund, payout or adjustment execution controls are offered until the corresponding provider workflows exist. Error/empty/retry states remain separate for totals and queues.


## Administrator console

Use the established teal introduction, lavender workspace/status context, white evidence surfaces and cream acknowledged review. The wrapped tab strip keeps all controls inside its container; inactive text uses charcoal on transparent lavender and active text teal on white to pass contrast. Preserve 24px desktop/16px mobile outer gutters and 24px/20px card insets. Privacy explanation alerts have a separate 24px/20px gap before the cream review. Account/resource IDs wrap on mobile rather than forcing overflow.

Only MFA-verified ADMIN accesses the console. People/linkage inspection excludes contact/session/notes/feedback data; staff grants remain unavailable pending independent approvals. Supply groups represent recorded profile status, not qualified/current capacity. Commercial examples call existing pricing rules without allowing accepted-term edits; versioned policy administration remains separate. Runtime provider modes are configuration evidence, not uptime or qualification, and the release verifier remains blocked. Specialist evidence, matching, support and finance workspaces remain separate routes.

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
