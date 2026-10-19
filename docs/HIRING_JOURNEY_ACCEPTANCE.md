# Integrated hiring-journey acceptance

19 October2026. Current scope: find a teacher, send a manual/assisted enquiry, review responses and mutually hire, with contextual help and replacement. Class booking/timetables, live payments, live Meet and masked calls remain deferred/gated. This record concerns development acceptance with synthetic data, not permission to open a live cohort.

## Continuous scenarios

| Scenario | Language / viewport | Start and end | Execution |
|---|---|---|---|
| Independent adult learner | English /1440px desktop | New OTP signup → readiness/adult declaration → reviewed education/own-data permission → public search/profile → reviewed manual enquiry → MFA staff matching/publication → teacher response → explicit selection → both hiring acceptances → permitted contact → linked help → replacement | Actual local web/API/PostgreSQL; all participant, teacher and matching-staff interactions in browser |
| Independent adult learner | English /360px mobile | Same continuous journey | Same real local services; no mocked workflow responses |
| Independent adult learner | Hindi /1440px desktop | Same continuous journey, including localized teacher and staff screens | Same real local services; canonical subject/language/amount/API values remain unchanged |
| Independent adult learner | Hindi /360px mobile | Same continuous journey | Same real local services; no overflow and accessibility checks |
| Guardian-managed learner | English /1440px desktop | New OTP signup, unverified-account consent denial → learner-specific private report intake/scan → current MFA reviewer decision → separate learning permission → owned reviewed profile → search → enquiry/matching/reply/selection/both acceptances → linked help → owned replacement | Signup, consent, profile, discovery, help and replacement through browser; verification, matching/reply/selection and hiring through their actual scoped APIs |
| Guardian-managed learner | Hindi /360px mobile | Same guardian journey with translated profile fields and replacement controls | Same service boundaries; synthetic staff-call/adult-authority attestations are test fixtures, not real human qualification |

Additional actual-service scenarios exercise optional supporter invitation/acceptance, shared education and immediate revocation, independent device naming/reload/sign-out, and Hindi validation without invalid submission. Existing focused tests cover assisted intake/withdrawal, guardian onboarding/draft recovery, guardian-only/shared/student-led permissions, evidence acknowledgments and private-read/uncertain-write recovery. Continuous scenarios above use manual teacher interest; they do not claim every combination of academic stage, permission mode or discovery method was exercised in one browser journey.

The adult-school fixture represents an adult continuing education and explicitly declares18+; the form does not infer age from school class. The guardian fixture is a managed under15 learner. Teacher accounts begin as explicitly synthetic screened supply with current availability; this does not qualify real teacher credentials. Staff fixtures undergo real MFA, but are not named production staff appointments.

## Acceptance assertions

- Email challenge is explicitly SANDBOX, with a development code; no real inbox delivery or provider credentials. New guardian accounts remain unverified until the review workflow, and cannot grant learning permission prematurely.
- Independent readiness, age declaration and own-data consent are explicit. Managed guardian proof and learning-data consent are separate. Creating the learner binds the approved named proof once and initializes the agreed management mode.
- Search resolves the chosen public profile and preserves the teacher ID into the recorded enquiry. Staff publication and a teacher response remain distinct from selection and mutual hiring. No obligatory demo/class timetable is introduced.
- Both parties accept exact tuition/contact terms; before both accept, contact reveal is unavailable. After confirmation only the authorized counterpart's account email is revealed. No provider payment or class reservation is created by hiring.
- Help is scoped to the actual enquiry/arrangement. Replacement closes the old arrangement and creates exactly one linked replacement request; it does not claim another teacher is already hired. Existing0/15/30-day commencement/minimum/credit/safety rules are verified by the separate T2 suites and preserved here; these scenarios do not invent a teaching commencement.
- English/Hindi controls use actual translated labels, authored text remains unchanged, and desktop/mobile views fit their viewport. Hindi checks include role handoffs. Accessibility checks cover the live arrangement panel; focused profile/replacement suites cover keyboard, validation, loading/error/empty and exact retry states.
- Test cleanup disables only newly created synthetic principals and revokes their sessions; synthetic audit/arrangement/support history remains evidence. It does not modify real accounts or delete project data.

## Issues found and corrected

1. Local guardian scans exhausted retries while remaining quarantined: the existing development worker had no ClamAV connection settings. Verified the local engine, added only absent non-secret loopback settings to the ignored owner-only `.env`, restarted the owned worker and re-ran fresh actual uploads. No evidence was marked CLEAN or batch-retried through database edits. Existing exhausted synthetic cases remain historical failed attempts. Environment startup instructions and the development runbook now include the scanner prerequisite. EICAR-only definitions are development fixtures, not current production signatures.
2. Learner-profile dynamic field labels bypassed translation although their Hindi entries existed. The shared field renderer now translates all create/edit labels. The continuous Hindi guardian test reproduced English labels before the fix; focused Hindi create/edit checks now open the editor and inspect labels, rather than only checking a closed list.
3. Replacement/closure reason captions were constructed from independently translated fragments. They now use whole English/Hindi captions, preserving the English labels and giving natural, accessible Hindi names.

Early test corrections used the actual enquiry relation on support cases, awaited the profile-save response before database assertions, and selected current legacy form/feedback Hindi labels. These were test fixture/synchronization issues, not claimed application failures. No production authorization checks were weakened.

## Repeatable checks

Run API/web/worker/PostgreSQL and the local test scanner using `infra/runbooks/development.md`; use the existing checkout. Current migration45 and generated client are prerequisites. Keep real credentials/providers disabled. Local browsers need both uppercase/lowercase loopback proxy exceptions in this environment.

```
NO_PROXY=localhost,127.0.0.1 no_proxy=localhost,127.0.0.1 npx playwright test tests/browser/independent-journey.spec.ts tests/browser/guardian-hiring-journey.spec.ts
NO_PROXY=localhost,127.0.0.1 no_proxy=localhost,127.0.0.1 npx playwright test tests/browser/learner-profiles.spec.ts tests/browser/learner-profile-edit.spec.ts tests/browser/placement-care.spec.ts
npm run typecheck
npm run test:security
npm run test:contract
```

Stop the owned development web process before a production build. Selected production-CSP tests use synthetic/mocked API scenarios and are distinct from the actual local-service continuous runs. Production host/provider/physical-device acceptance remains separate.

Screenshots are generated in ignored `test-results`: independent `journey-{en|hi}-{desktop|mobile}-{terms|confirmed|replacement}.png` and guardian `guardian-hiring-{en|hi}-{desktop|mobile}.png`. They contain synthetic data only. Preserve exact-source artifacts in CI during final release qualification; local screenshots are not hosted CI evidence.

## Final local evidence

- All four continuous independent signup-to-replacement combinations passed, plus three supporter/device/Hindi-validation cases. Their combined run had two guardian failures caused by missing local scanner settings; those failures are not counted as passes.
- After configuring the real local worker, fixing the translated field renderer and synchronizing the profile-save assertion, the final39-case guardian/profile-create/profile-edit/closure/replacement run passed with no skips. It contains both continuous guardian scenarios and the strengthened open-form Hindi regressions.
- All70 selected production-browser checks passed against the rebuilt app, including the two new mobile Hindi create/edit label checks. These production scenarios use synthetic/mocked APIs; the continuous journeys above use actual local services.
- Final whole-workspace TypeScript, Next build,18 frontend security/client/localization and16 contract checks passed. Source scan393 files and built JavaScript scan17 assets reported no secret findings. Backend application/contract source did not change; the preceding200-case API review remains historical evidence, not a new full API run in this increment.
- English/Hindi mobile screenshot artifacts were inspected. Local web/API readiness is rechecked after restoring the development server. No real provider credential, human verification, live message, collection, merge or deployment.

## Remaining live qualification

Real reviewer identity/appointments and training, consent/privacy/legal approval, final retention/deletion policy, real screened supply, verified-domain email, actual devices/participants, provider qualification when enabled, B14 production storage/scanning/backup/deletion replay, B15 final migrations/contracts/coordinated images and independent security/operational release evidence remain open. Policy preparation is tracked separately from test acceptance; real staff calls or identity checks were not performed. No merge/deployment or release gate was enabled.
