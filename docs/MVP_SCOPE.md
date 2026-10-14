# Current MVP scope — teacher discovery and hiring

Owner direction, 14 October 2026: prioritize finding a teacher and booking/hiring that teacher. Managing or booking individual classes can follow when the platform scales. This direction takes precedence over the Version 3 PRD's broader class-management launch scope. Existing implementation history remains accurate; deferred work is not completed acceptance.

## Primary journey

Search manually or choose “Let us search for you” → review screened teacher profiles and fit → send a tuition enquiry → receive teacher/operator responses → choose a teacher → review and mutually confirm the teaching arrangement → see hiring status and get support or a replacement when needed.

“Book a teacher” means requesting or confirming a teaching arrangement. It does not mean automatically booking an individual lesson, charging money or claiming that teaching has started. Preserve teacher availability, capacity, eligibility and mutual acceptance checks. A fee quote or hiring acceptance is distinct from captured payment and verified service delivery. Introductions/demos may help assess fit, but the next implementation must review whether any existing mandatory demo or timetable step unnecessarily blocks hiring.

## Prioritized increments

- **H1 — Discovery and profile journey:** make finding a teacher the primary homepage/navigation action; preserve equally visible manual and assisted search; make subject/class/board, location/mode, language, budget, screening and profile information easy to review. Teacher enquiry is the main profile action.
- **H2 — Simple, recoverable enquiry:** streamline guardian/teacher onboarding and saved tuition requests around learner needs and broad availability preferences. Avoid asking families to manage individual classes. Keep verification, consent and private child data boundaries. Reuse existing matching and request APIs where possible.
- **H3 — Teacher response and hiring confirmation:** make enquiry, shortlist, teacher response, selection and mutually accepted terms/status explicit. Review dependencies on demo/timetable/lesson creation and separate hiring confirmation from those later workflows. No unapproved price, payment method or commercial promise is implied.
- **H4 — Dashboards for hiring:** prioritize enquiry progress, shortlists, teacher responses, confirmed arrangements and teacher application/enquiry status. Class history and activity metrics must not dominate the primary experience.
- **H5 — Complete the focused journey:** useful no-match/out-of-scope recovery, support/replacement, privacy correction/deletion, mobile/keyboard/error/retry review and English/Hindi support for this journey.

## Still needed for this scope

Authentication/email delivery, guardian verification and consent, safe teacher evidence and reviewer screening, staff access boundaries, availability/capacity checks, enquiry notification delivery, privacy and support, approved commercial terms, current supplier coverage and applicable security/release qualification remain relevant. Narrowing the product scope does not authorize weakening these controls.

F22 onboarding recovery/preferences remains relevant where it helps enquiries, consent and teacher applications. F23 waitlist, F24 localization and F25 UI refinement follow the focused journey. Their older class/student-specific portions are reconsidered under this scope rather than automatically implemented next.

## Deferred until later scale

Individual paid class/revision booking and allocation; recurring timetable agreement and lesson materialization; per-class attendance, confirmation/dispute and feedback/recap workflows; learning-note tooling and expanded student learning dashboards; lesson-based analytics; class checkout/refund/payout/reconciliation qualification; Google Meet delivery and lesson meeting recovery. Existing screens, APIs, records and tests are retained. Further investment and launch acceptance for these workflows are deferred; they are not erased or marked live-ready.

Masked calls/Parent Pro delivery and AI/ML ranking retain the owner's earlier deferrals. The existing assisted tab remains a reviewed rules workflow.

If payments are introduced for hiring, their particular checkout, refunds and settlement requirements must be scoped and qualified before enabling them. Existing payment and release gates stay closed; deferring class payments does not enable a hiring charge.

## Delivery and evidence

Continue with separate tested backend/frontend commits and pushes. Active phase remains frontend development; this scope change is not phase acceptance, a production release, or approval to merge/deploy. Original PRD and sprint history are preserved as the broader reference. The next implementation increment is H1, followed by H2/H3 dependency review.
