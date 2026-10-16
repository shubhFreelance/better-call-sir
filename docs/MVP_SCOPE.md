# Current MVP scope — teacher discovery and hiring

Owner direction, 14 October 2026: prioritize finding a teacher and booking/hiring that teacher. Managing or booking individual classes can follow when the platform scales. This direction takes precedence over the Version 3 PRD's broader class-management launch scope. Existing implementation history remains accurate; deferred work is not completed acceptance.

## Primary journey

Search manually or choose “Let us search for you” → review screened teacher profiles and fit → send a tuition enquiry → receive teacher/operator responses → choose a teacher → review and mutually confirm the teaching arrangement → see hiring status and get support or a replacement when needed.

“Book a teacher” means requesting or confirming a teaching arrangement. It does not mean automatically booking an individual lesson, charging money or claiming that teaching has started. Preserve teacher availability, capacity, eligibility and mutual acceptance checks. A fee quote or hiring acceptance is distinct from captured payment and verified service delivery. Demos are explicitly optional per teacher. An opted-in teacher gets a public “Demo available” badge. Eligible accepted recommendations may open hiring terms without requesting a demo; already requested demos retain outcome/cancellation/dispute safeguards. Primary hiring dashboards now review and mutually accept hiring terms without a class timetable. Service-start/receipt evidence remains a separate legacy workflow; end-to-end enquiry/detail simplification remains H2/H3 work.

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

Continue with separate tested backend/frontend commits and pushes. Active phase remains frontend development; this scope change is not phase acceptance, a production release, or approval to merge/deploy. Original PRD and sprint history are preserved as the broader reference. H1 discovery/profile emphasis and H4 hiring dashboards are implemented in development. Guardian draft recovery/discard, weekly availability and dashboard hiring-term confirmation are implemented. Next is remaining teacher/student/invitation recovery and complete H3 enquiry-to-confirmation navigation. Legacy service-start evidence stays separate from hiring-term acceptance.


## Complete but manageable onboarding

Teacher onboarding uses five steps: teaching introduction and experience; private full address; four education milestones plus previous work; teaching formats/coverage/fees and explicit demo preference; final review. Class 10, Class 12, undergraduate and postgraduate milestones record completed/pursuing/not-applicable status as appropriate, institution, board/degree, completion year and official marks/percentage/CGPA. Work history records institution/practice, role, dates and certificate/reference availability. Evidence is uploaded privately after submission and must pass existing scan/reviewer controls. Neither declarations nor badges imply independent verification of every claim.

Guardian-authorized learner onboarding collects school, class/board and all subjects studied in class separately from the tuition subject requested. Existing recorded school details are protected from silent replacement; legacy blanks can be filled. Full teacher address/results/work and learner school details are excluded from public teacher discovery. Demo copy explains assessment of fit without promising hiring outcomes. Nullable legacy records need details before current approval; no real data is invented. Required application changes need coordinated API/web rollout; image/schema compatibility is still a release gate.


## Hiring-term confirmation in dashboards

Owning guardians and teachers can review recorded monthly tuition, policy, proposed teacher placement fee and each party’s acceptance directly in the hiring dashboard. Both recorded acceptances show “Hiring terms confirmed”; this is independent of the persisted class-start lifecycle and does not imply a lesson, payment or verified service start. The “Awaiting tuition start” count retains the existing TERMS_PENDING lifecycle denominator, including mutually accepted terms awaiting later start evidence. Students see scoped progress without money, policy/write metadata or acceptance controls. Stale details require refresh and a new acknowledgement; uncertain responses retry the same body/key. No new class schedule, invoice or live provider action is created by this review.


## Saved additional enquiries

The guardian wizard retains the original onboarding completion and supports a separate private additional-enquiry draft. Successful Continue actions save its criteria; returning resumes the saved learner/school/tuition details after the permission step. Submission creates exactly one enquiry for a retry key and preserves previous submitted requests. Starting another enquiry is an explicit versioned action after completion. Only one unfinished additional draft is supported at a time; a different teacher link preserves that draft and routes the guardian back to it. Weekly availability is implemented; other H2/H3 recovery/navigation remains open.


Unfinished initial/additional guardian drafts can now be explicitly discarded after consequence review and acknowledgement. Version and consent checks protect against stale or unauthorized changes. Submitted enquiries, learner profiles and arrangements are preserved. Guardians may keep their draft or clear it to choose again; a conflicting teacher link can continue to that teacher after confirmed discard. This is workflow draft management, separate from a privacy deletion request.


## Weekly availability for enquiries

Families can provide weekly IST weekday/time ranges instead of planning individual classes. The API also retains existing dated preferences. Matching checks approved/current teacher coverage, account, travel and capacity, then finds a real free overlap against current patterns, leave and held/confirmed reservations within 60 days. A minimum 20-minute overlap is initial fit evidence only: the family has not agreed lesson duration, dates or a timetable. Preferences are rechecked when matching/choosing; no lesson/reservation is created by saving them. Guardian drafts, family edits and operator summaries preserve weekly intent. Remaining H2 work concerns other recovery/navigation gaps rather than requiring class planning.

Teacher application edits now use a separate private revision draft. Continue saves validated steps; reload restores saved fields. Saving does not publish edits, change approval or reopen screening. Full resubmission requires renewed fee acknowledgement and the current draft/application versions, then reopens review. Reviewer changes make earlier drafts stale; teachers can retain them or explicitly acknowledge discarding only the unfinished revision. Current application, evidence and decisions are preserved. Other onboarding/invitation recovery and H3 navigation remain open.

Student welcome now offers age-appropriate guardian/privacy guidance and optional private subject, language and learning preferences using the existing owner-scoped student onboarding API. Saving/resuming/clearing preferences does not create or change enquiries, match teachers or authorize hiring. Students can skip and explore teacher profiles. Guardian consent and session revocation remain server-enforced. Invitation replacement/idempotency and device labels remain open.

Invitation replacement/recovery now uses code-free private status and acknowledged versioned issuance. New codes invalidate earlier unused codes; activation and replacement share the guardian lock. Retry confirms metadata without creating another invitation or retaining a readable code. A lost code requires explicit replacement after reviewing current status. Existing activated learners cannot receive new invitations and continue through guardian-managed device access. Device labels and other onboarding/navigation gaps remain open.
