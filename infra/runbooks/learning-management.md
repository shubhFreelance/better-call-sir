# Family learning management

Current hiring scope. A guardian's choice governs learning decisions for one linked learner. It does not create adult status, replace relationship verification, waive learning-data consent, change account ownership or authorize a minor to incur a financial commitment.

## Modes and consent

- `GUARDIAN_ONLY`: the guardian sends enquiries, selects teachers, arranges optional demos and accepts learning terms. The student sees their own progress and the chosen mode.
- `SHARED`: both can manage learning decisions; the guardian retains control of the mode.
- `STUDENT_LED`: the student is the primary learning decision maker; the guardian can follow progress and step in. It grants the same learning actions as shared mode, with different guidance about who leads.

The approved B1 choice initializes a proof-linked learner. Legacy learners default to guardian-only until their guardian explicitly reviews a change. The student sees the current choice; guardian-only students cannot override it. Under15 is an assistance guideline, not proof of adulthood. Managed students aged15–17 can make delegated learning choices with continuing guardian verification and consent. Direct independent signup still requires the existing18+ declaration; this feature does not turn minors into independent adult principals.

## API and enforcement

`GET/POST /children/:id/learning-management` expose current capabilities and a guardian-only, expected-version, confirmed update. `POST /requests/:id/decision-authority` optionally delegates one enquiry to the guardian, or resumes permitted student decisions. A student cannot use this per-enquiry setting to override guardian-only mode.

Canonical enquiry, selection, optional-demo, placement and unlinked education-edit APIs retain the same learner/guardian ownership. Student actions record the actual student actor. A family-side learning-term acceptance records `familyAcceptanceActorId`; it does not claim the guardian personally clicked or confirmed financial commencement. Name corrections and history-linked education corrections keep their existing privacy/support route. Consent, guardian mode, devices, account ownership and financial commencement remain outside student delegation.

Guardian mode changes, consent, per-enquiry authority and delegated writes serialize on the existing guardian transaction lock. Student authorization is rechecked before returning an idempotency receipt, including old already-completed keys. Revocation therefore also prevents replay from revealing an obsolete private response or repeating an obsolete permission. Teacher identity, eligibility, screening, availability and capacity checks remain active. Optional demos do not acquire a new per-teacher guardian approval requirement when the current mode permits student decisions.

## Qualification

Development tests use isolated synthetic accounts and PostgreSQL. Real-person guardian/adult authority review, legal notices/consent/retention, live email and physical-device acceptance remain launch gates. There is no live collection or deployment authorization here. T2 separately implements mutually confirmed commencement and minimum tuition; a minor's delegated learning choice must not silently become a payment authorization.
