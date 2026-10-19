# Access-control source inventory

19 October 2026. Snapshot of all 219 declared API operations reviewed for this internal verification. This is an inventory, not 219 independently proven authorization policies. `Helper/public/variable` requires reading the named controller and its shared helpers. Explicit roles describe the entry gate, not ownership, consent, regional or financial authority. See [review and test evidence](ACCESS_PRIVACY_REVIEW.md).

| Method | Route (under `/api/v1`) | Literal entry roles | Controller |
|---|---|---|---|
| GET | `/admin/console` | ADMIN | [administration.module.ts](../apps/api/src/modules/administration/administration.module.ts) |
| GET | `/admin/accounts` | ADMIN | [administration.module.ts](../apps/api/src/modules/administration/administration.module.ts) |
| GET | `/admin/accounts/{id}/linkage` | ADMIN | [administration.module.ts](../apps/api/src/modules/administration/administration.module.ts) |
| GET | `/admin/audit` | ADMIN | [administration.module.ts](../apps/api/src/modules/administration/administration.module.ts) |
| GET | `/admin/jobs` | ADMIN | [administration.module.ts](../apps/api/src/modules/administration/administration.module.ts) |
| POST | `/admin/jobs/{id}/retries` | ADMIN | [administration.module.ts](../apps/api/src/modules/administration/administration.module.ts) |
| GET | `/dashboard` | GUARDIAN, STUDENT, TEACHER, ADMIN, OPERATOR, REVIEWER, FINANCE | [administration.module.ts](../apps/api/src/modules/administration/administration.module.ts) |
| POST | `/admin/flags/{name}` | ADMIN | [administration.module.ts](../apps/api/src/modules/administration/administration.module.ts) |
| GET | `/admin/commercial` | Helper/public/variable | [commercial.module.ts](../apps/api/src/modules/administration/commercial.module.ts) |
| GET | `/admin/commercial/history` | Helper/public/variable | [commercial.module.ts](../apps/api/src/modules/administration/commercial.module.ts) |
| GET | `/admin/commercial/changes` | Helper/public/variable | [commercial.module.ts](../apps/api/src/modules/administration/commercial.module.ts) |
| POST | `/admin/commercial/changes` | Helper/public/variable | [commercial.module.ts](../apps/api/src/modules/administration/commercial.module.ts) |
| POST | `/admin/commercial/changes/{id}/decision` | Helper/public/variable | [commercial.module.ts](../apps/api/src/modules/administration/commercial.module.ts) |
| GET | `/admin/staff` | Helper/public/variable | [staff.module.ts](../apps/api/src/modules/administration/staff.module.ts) |
| GET | `/admin/staff/changes` | Helper/public/variable | [staff.module.ts](../apps/api/src/modules/administration/staff.module.ts) |
| POST | `/admin/staff/changes` | Helper/public/variable | [staff.module.ts](../apps/api/src/modules/administration/staff.module.ts) |
| POST | `/admin/staff/changes/{id}/decision` | Helper/public/variable | [staff.module.ts](../apps/api/src/modules/administration/staff.module.ts) |
| GET | `/dashboard/hiring` | Helper/public/variable | [analytics.module.ts](../apps/api/src/modules/analytics/analytics.module.ts) |
| GET | `/dashboard/learning` | Helper/public/variable | [analytics.module.ts](../apps/api/src/modules/analytics/analytics.module.ts) |
| GET | `/admin/reports/regions` | ADMIN, OPERATOR | [analytics.module.ts](../apps/api/src/modules/analytics/analytics.module.ts) |
| GET | `/admin/reports/funnel` | ADMIN, OPERATOR | [analytics.module.ts](../apps/api/src/modules/analytics/analytics.module.ts) |
| GET | `/admin/reports/finance` | ADMIN, FINANCE | [analytics.module.ts](../apps/api/src/modules/analytics/analytics.module.ts) |
| GET | `/health/live` | Helper/public/variable | [catalog.module.ts](../apps/api/src/modules/catalog/catalog.module.ts) |
| GET | `/health/ready` | Helper/public/variable | [catalog.module.ts](../apps/api/src/modules/catalog/catalog.module.ts) |
| GET | `/catalog` | Helper/public/variable | [catalog.module.ts](../apps/api/src/modules/catalog/catalog.module.ts) |
| GET | `/teachers` | Helper/public/variable | [catalog.module.ts](../apps/api/src/modules/catalog/catalog.module.ts) |
| GET | `/teachers/{slug}` | Helper/public/variable | [catalog.module.ts](../apps/api/src/modules/catalog/catalog.module.ts) |
| GET | `/demos` | GUARDIAN, STUDENT, TEACHER, ADMIN, OPERATOR | [demos.module.ts](../apps/api/src/modules/demos/demos.module.ts) |
| POST | `/demos` | GUARDIAN, STUDENT | [demos.module.ts](../apps/api/src/modules/demos/demos.module.ts) |
| POST | `/demos/{id}/acceptances` | GUARDIAN, STUDENT, TEACHER | [demos.module.ts](../apps/api/src/modules/demos/demos.module.ts) |
| POST | `/demos/{id}/reschedules` | GUARDIAN, STUDENT, TEACHER | [demos.module.ts](../apps/api/src/modules/demos/demos.module.ts) |
| POST | `/demos/{id}/outcomes` | GUARDIAN, STUDENT, TEACHER | [demos.module.ts](../apps/api/src/modules/demos/demos.module.ts) |
| POST | `/admin/demos/{id}/reviews` | ADMIN, OPERATOR | [demos.module.ts](../apps/api/src/modules/demos/demos.module.ts) |
| POST | `/demos/{id}/cancellations` | GUARDIAN, STUDENT, TEACHER | [demos.module.ts](../apps/api/src/modules/demos/demos.module.ts) |
| GET | `/dev/accounts` | Helper/public/variable | [identity.module.ts](../apps/api/src/modules/identity/identity.module.ts) |
| POST | `/dev/session` | Helper/public/variable | [identity.module.ts](../apps/api/src/modules/identity/identity.module.ts) |
| POST | `/auth/otp/request` | Helper/public/variable | [identity.module.ts](../apps/api/src/modules/identity/identity.module.ts) |
| POST | `/auth/otp/verify` | Helper/public/variable | [identity.module.ts](../apps/api/src/modules/identity/identity.module.ts) |
| GET | `/auth/session` | Helper/public/variable | [identity.module.ts](../apps/api/src/modules/identity/identity.module.ts) |
| POST | `/auth/refresh` | Helper/public/variable | [identity.module.ts](../apps/api/src/modules/identity/identity.module.ts) |
| POST | `/auth/logout` | Helper/public/variable | [identity.module.ts](../apps/api/src/modules/identity/identity.module.ts) |
| POST | `/consents` | GUARDIAN | [identity.module.ts](../apps/api/src/modules/identity/identity.module.ts) |
| POST | `/consents/withdraw` | GUARDIAN | [identity.module.ts](../apps/api/src/modules/identity/identity.module.ts) |
| GET | `/children` | GUARDIAN, STUDENT | [identity.module.ts](../apps/api/src/modules/identity/identity.module.ts) |
| GET | `/children/{id}/invitation` | GUARDIAN | [identity.module.ts](../apps/api/src/modules/identity/identity.module.ts) |
| POST | `/children/{id}/invitation-replacements` | GUARDIAN | [identity.module.ts](../apps/api/src/modules/identity/identity.module.ts) |
| POST | `/children/{id}/invitations` | GUARDIAN | [identity.module.ts](../apps/api/src/modules/identity/identity.module.ts) |
| POST | `/invitations/activate` | GUARDIAN | [identity.module.ts](../apps/api/src/modules/identity/identity.module.ts) |
| GET | `/auth/mfa` | Helper/public/variable | [mfa.module.ts](../apps/api/src/modules/identity/mfa.module.ts) |
| POST | `/auth/mfa/enrollment` | Helper/public/variable | [mfa.module.ts](../apps/api/src/modules/identity/mfa.module.ts) |
| POST | `/auth/mfa/verification` | Helper/public/variable | [mfa.module.ts](../apps/api/src/modules/identity/mfa.module.ts) |
| POST | `/auth/mfa/recovery-codes` | Helper/public/variable | [mfa.module.ts](../apps/api/src/modules/identity/mfa.module.ts) |
| GET | `/children/{id}/student-sessions` | GUARDIAN | [student-access.module.ts](../apps/api/src/modules/identity/student-access.module.ts) |
| POST | `/children/{id}/student-session-labels` | GUARDIAN | [student-access.module.ts](../apps/api/src/modules/identity/student-access.module.ts) |
| POST | `/children/{id}/student-sessions` | GUARDIAN | [student-access.module.ts](../apps/api/src/modules/identity/student-access.module.ts) |
| POST | `/children/{id}/student-access-revocations` | GUARDIAN | [student-access.module.ts](../apps/api/src/modules/identity/student-access.module.ts) |
| GET | `/independent-student/signup` | GUARDIAN, INDEPENDENT_STUDENT | [independent-students.module.ts](../apps/api/src/modules/learners/independent-students.module.ts) |
| POST | `/independent-student/signup` | GUARDIAN, INDEPENDENT_STUDENT | [independent-students.module.ts](../apps/api/src/modules/learners/independent-students.module.ts) |
| GET | `/independent-student/profile` | INDEPENDENT_STUDENT | [independent-students.module.ts](../apps/api/src/modules/learners/independent-students.module.ts) |
| POST | `/independent-student/profile/updates` | INDEPENDENT_STUDENT | [independent-students.module.ts](../apps/api/src/modules/learners/independent-students.module.ts) |
| POST | `/learner-profiles` | GUARDIAN | [learners.module.ts](../apps/api/src/modules/learners/learners.module.ts) |
| GET | `/learner-profiles` | GUARDIAN, STUDENT | [learners.module.ts](../apps/api/src/modules/learners/learners.module.ts) |
| GET | `/learner-profiles/{id}` | GUARDIAN, STUDENT | [learners.module.ts](../apps/api/src/modules/learners/learners.module.ts) |
| POST | `/learner-profiles/{id}/updates` | GUARDIAN, STUDENT | [learners.module.ts](../apps/api/src/modules/learners/learners.module.ts) |
| GET | `/children/{id}/learning-management` | GUARDIAN, STUDENT | [learning-management.ts](../apps/api/src/modules/learners/learning-management.ts) |
| POST | `/children/{id}/learning-management` | GUARDIAN | [learning-management.ts](../apps/api/src/modules/learners/learning-management.ts) |
| POST | `/requests/{id}/decision-authority` | GUARDIAN, STUDENT | [learning-management.ts](../apps/api/src/modules/learners/learning-management.ts) |
| GET | `/student-guardian-grants` | INDEPENDENT_STUDENT, GUARDIAN | [student-support.module.ts](../apps/api/src/modules/learners/student-support.module.ts) |
| POST | `/student-guardian-grants` | INDEPENDENT_STUDENT | [student-support.module.ts](../apps/api/src/modules/learners/student-support.module.ts) |
| POST | `/student-guardian-grants/{id}/decisions` | INDEPENDENT_STUDENT, GUARDIAN | [student-support.module.ts](../apps/api/src/modules/learners/student-support.module.ts) |
| GET | `/delegated-students/{id}/profile` | GUARDIAN | [student-support.module.ts](../apps/api/src/modules/learners/student-support.module.ts) |
| GET | `/delegated-students/{id}/enquiry-context` | GUARDIAN | [student-support.module.ts](../apps/api/src/modules/learners/student-support.module.ts) |
| POST | `/delegated-students/{id}/profile/updates` | GUARDIAN | [student-support.module.ts](../apps/api/src/modules/learners/student-support.module.ts) |
| GET | `/independent-student/sessions` | INDEPENDENT_STUDENT | [student-support.module.ts](../apps/api/src/modules/learners/student-support.module.ts) |
| POST | `/independent-student/session-labels` | INDEPENDENT_STUDENT | [student-support.module.ts](../apps/api/src/modules/learners/student-support.module.ts) |
| POST | `/independent-student/session-revocations` | INDEPENDENT_STUDENT | [student-support.module.ts](../apps/api/src/modules/learners/student-support.module.ts) |
| GET | `/admin/lessons/disputes` | ADMIN, OPERATOR | [learning-records.module.ts](../apps/api/src/modules/learning-records/learning-records.module.ts) |
| GET | `/lessons` | GUARDIAN, STUDENT, TEACHER | [learning-records.module.ts](../apps/api/src/modules/learning-records/learning-records.module.ts) |
| POST | `/lessons/{id}/attendance` | TEACHER | [learning-records.module.ts](../apps/api/src/modules/learning-records/learning-records.module.ts) |
| POST | `/lessons/{id}/confirmations` | GUARDIAN, STUDENT | [learning-records.module.ts](../apps/api/src/modules/learning-records/learning-records.module.ts) |
| POST | `/lessons/{id}/disputes` | GUARDIAN, STUDENT | [learning-records.module.ts](../apps/api/src/modules/learning-records/learning-records.module.ts) |
| POST | `/admin/lessons/{id}/dispute-resolutions` | ADMIN, OPERATOR | [learning-records.module.ts](../apps/api/src/modules/learning-records/learning-records.module.ts) |
| POST | `/lessons/{id}/feedback` | GUARDIAN | [learning-records.module.ts](../apps/api/src/modules/learning-records/learning-records.module.ts) |
| POST | `/admin/requests/{id}/recommendations` | ADMIN, OPERATOR | [matching.module.ts](../apps/api/src/modules/matching/matching.module.ts) |
| GET | `/admin/requests/{id}/recommendations` | ADMIN, OPERATOR | [matching.module.ts](../apps/api/src/modules/matching/matching.module.ts) |
| GET | `/admin/requests/{id}/recommendation-runs` | ADMIN, OPERATOR | [matching.module.ts](../apps/api/src/modules/matching/matching.module.ts) |
| POST | `/admin/requests/{id}/presentations` | ADMIN, OPERATOR | [matching.module.ts](../apps/api/src/modules/matching/matching.module.ts) |
| POST | `/requests/{id}/presentations` | GUARDIAN, STUDENT | [matching.module.ts](../apps/api/src/modules/matching/matching.module.ts) |
| POST | `/candidates/{id}/responses` | TEACHER | [matching.module.ts](../apps/api/src/modules/matching/matching.module.ts) |
| POST | `/requests/{id}/selections` | GUARDIAN, STUDENT | [matching.module.ts](../apps/api/src/modules/matching/matching.module.ts) |
| GET | `/meetings/{id}` | GUARDIAN, TEACHER, STUDENT | [meetings.module.ts](../apps/api/src/modules/meetings/meetings.module.ts) |
| GET | `/reservations/{id}/meeting` | GUARDIAN, TEACHER, STUDENT | [meetings.module.ts](../apps/api/src/modules/meetings/meetings.module.ts) |
| POST | `/admin/meetings/{id}/retries` | ADMIN, OPERATOR | [meetings.module.ts](../apps/api/src/modules/meetings/meetings.module.ts) |
| GET | `/pro/membership` | GUARDIAN | [memberships.module.ts](../apps/api/src/modules/memberships/memberships.module.ts) |
| POST | `/pro/membership/cancellations` | GUARDIAN | [memberships.module.ts](../apps/api/src/modules/memberships/memberships.module.ts) |
| POST | `/pro/calls/{id}/cancellations` | GUARDIAN, TEACHER | [memberships.module.ts](../apps/api/src/modules/memberships/memberships.module.ts) |
| POST | `/pro/calls` | GUARDIAN | [memberships.module.ts](../apps/api/src/modules/memberships/memberships.module.ts) |
| POST | `/pro/calls/{id}/accept` | TEACHER | [memberships.module.ts](../apps/api/src/modules/memberships/memberships.module.ts) |
| POST | `/dev/pro/calls/{id}/outcome` | TEACHER | [memberships.module.ts](../apps/api/src/modules/memberships/memberships.module.ts) |
| POST | `/notes` | GUARDIAN | [notes.module.ts](../apps/api/src/modules/notes/notes.module.ts) |
| POST | `/notes/{id}/updates` | GUARDIAN | [notes.module.ts](../apps/api/src/modules/notes/notes.module.ts) |
| POST | `/notes/{id}/shares` | GUARDIAN | [notes.module.ts](../apps/api/src/modules/notes/notes.module.ts) |
| POST | `/notes/{id}/acknowledgements` | TEACHER | [notes.module.ts](../apps/api/src/modules/notes/notes.module.ts) |
| GET | `/notes` | GUARDIAN, TEACHER | [notes.module.ts](../apps/api/src/modules/notes/notes.module.ts) |
| GET | `/notifications` | GUARDIAN, STUDENT, INDEPENDENT_STUDENT, TEACHER, ADMIN, OPERATOR, REVIEWER, FINANCE | [notifications.module.ts](../apps/api/src/modules/notifications/notifications.module.ts) |
| GET | `/admin/email-deliveries` | ADMIN, OPERATOR | [notifications.module.ts](../apps/api/src/modules/notifications/notifications.module.ts) |
| GET | `/notifications/{id}/history` | GUARDIAN, STUDENT, INDEPENDENT_STUDENT, TEACHER, ADMIN, OPERATOR, REVIEWER, FINANCE | [notifications.module.ts](../apps/api/src/modules/notifications/notifications.module.ts) |
| POST | `/admin/email-deliveries/{id}/retries` | ADMIN, OPERATOR | [notifications.module.ts](../apps/api/src/modules/notifications/notifications.module.ts) |
| POST | `/notifications/webhooks/resend` | Helper/public/variable | [notifications.module.ts](../apps/api/src/modules/notifications/notifications.module.ts) |
| POST | `/onboarding/enquiry/restarts` | GUARDIAN | [onboarding.module.ts](../apps/api/src/modules/onboarding/onboarding.module.ts) |
| POST | `/onboarding/{kind}/discards` | GUARDIAN | [onboarding.module.ts](../apps/api/src/modules/onboarding/onboarding.module.ts) |
| GET | `/onboarding/student/context` | STUDENT | [onboarding.module.ts](../apps/api/src/modules/onboarding/onboarding.module.ts) |
| POST | `/onboarding/student/confirmations` | STUDENT | [onboarding.module.ts](../apps/api/src/modules/onboarding/onboarding.module.ts) |
| GET | `/onboarding/guardian` | GUARDIAN | [onboarding.module.ts](../apps/api/src/modules/onboarding/onboarding.module.ts) |
| GET | `/onboarding/{kind}` | Helper/public/variable | [onboarding.module.ts](../apps/api/src/modules/onboarding/onboarding.module.ts) |
| POST | `/onboarding/{kind}/drafts` | Helper/public/variable | [onboarding.module.ts](../apps/api/src/modules/onboarding/onboarding.module.ts) |
| POST | `/onboarding/{kind}/completions` | Helper/public/variable | [onboarding.module.ts](../apps/api/src/modules/onboarding/onboarding.module.ts) |
| GET | `/admin/finance/records` | FINANCE, ADMIN | [payments.module.ts](../apps/api/src/modules/payments/payments.module.ts) |
| GET | `/payables` | TEACHER, FINANCE, ADMIN | [payments.module.ts](../apps/api/src/modules/payments/payments.module.ts) |
| GET | `/checkout-orders` | GUARDIAN, TEACHER | [payments.module.ts](../apps/api/src/modules/payments/payments.module.ts) |
| POST | `/checkout-orders` | GUARDIAN, TEACHER | [payments.module.ts](../apps/api/src/modules/payments/payments.module.ts) |
| GET | `/checkout-orders/{id}` | GUARDIAN, TEACHER, FINANCE, ADMIN | [payments.module.ts](../apps/api/src/modules/payments/payments.module.ts) |
| POST | `/billing/webhooks/razorpay` | Helper/public/variable | [payments.module.ts](../apps/api/src/modules/payments/payments.module.ts) |
| POST | `/admin/checkout-orders/{id}/reconciliations` | ADMIN, FINANCE | [payments.module.ts](../apps/api/src/modules/payments/payments.module.ts) |
| POST | `/placements/{id}/closures` | GUARDIAN, STUDENT | [placements.module.ts](../apps/api/src/modules/placements/placements.module.ts) |
| POST | `/placements/{id}/rematches` | GUARDIAN, STUDENT | [placements.module.ts](../apps/api/src/modules/placements/placements.module.ts) |
| POST | `/placements` | GUARDIAN, STUDENT | [placements.module.ts](../apps/api/src/modules/placements/placements.module.ts) |
| POST | `/placements/{id}/acceptances` | GUARDIAN, STUDENT, TEACHER | [placements.module.ts](../apps/api/src/modules/placements/placements.module.ts) |
| GET | `/tuition-minimums/{kind}/{id}` | Helper/public/variable | [tuition-minimum.ts](../apps/api/src/modules/placements/tuition-minimum.ts) |
| POST | `/tuition-minimums/{kind}/{id}/commencements` | Helper/public/variable | [tuition-minimum.ts](../apps/api/src/modules/placements/tuition-minimum.ts) |
| POST | `/tuition-minimums/{kind}/{id}/credits` | Helper/public/variable | [tuition-minimum.ts](../apps/api/src/modules/placements/tuition-minimum.ts) |
| POST | `/tuition-minimums/{kind}/{id}/credits/{creditId}/decisions` | Helper/public/variable | [tuition-minimum.ts](../apps/api/src/modules/placements/tuition-minimum.ts) |
| POST | `/tuition-minimums/{kind}/{id}/reviews` | Helper/public/variable | [tuition-minimum.ts](../apps/api/src/modules/placements/tuition-minimum.ts) |
| GET | `/admin/tuition-minimum-reviews` | ADMIN, OPERATOR | [tuition-minimum.ts](../apps/api/src/modules/placements/tuition-minimum.ts) |
| POST | `/admin/tuition-minimum-reviews/{reviewId}/decisions` | ADMIN, OPERATOR | [tuition-minimum.ts](../apps/api/src/modules/placements/tuition-minimum.ts) |
| POST | `/privacy-requests` | GUARDIAN, TEACHER, INDEPENDENT_STUDENT | [privacy.module.ts](../apps/api/src/modules/privacy/privacy.module.ts) |
| GET | `/privacy-requests` | GUARDIAN, TEACHER, INDEPENDENT_STUDENT, ADMIN | [privacy.module.ts](../apps/api/src/modules/privacy/privacy.module.ts) |
| GET | `/admin/privacy-requests` | ADMIN | [privacy.module.ts](../apps/api/src/modules/privacy/privacy.module.ts) |
| POST | `/admin/privacy-requests/{id}/reviews` | ADMIN | [privacy.module.ts](../apps/api/src/modules/privacy/privacy.module.ts) |
| GET | `/admin/privacy/deletion-ledger` | ADMIN | [privacy.module.ts](../apps/api/src/modules/privacy/privacy.module.ts) |
| POST | `/admin/privacy/deletion-ledger/{id}/replays` | ADMIN | [privacy.module.ts](../apps/api/src/modules/privacy/privacy.module.ts) |
| GET | `/placements/{id}/schedules` | GUARDIAN, TEACHER | [recurring.module.ts](../apps/api/src/modules/recurring/recurring.module.ts) |
| POST | `/placements/{id}/schedules` | GUARDIAN, TEACHER | [recurring.module.ts](../apps/api/src/modules/recurring/recurring.module.ts) |
| POST | `/recurring-schedules/{id}/acceptances` | GUARDIAN, TEACHER | [recurring.module.ts](../apps/api/src/modules/recurring/recurring.module.ts) |
| POST | `/recurring-schedules/{id}/extensions` | GUARDIAN, TEACHER | [recurring.module.ts](../apps/api/src/modules/recurring/recurring.module.ts) |
| POST | `/requests` | GUARDIAN, STUDENT | [requests.module.ts](../apps/api/src/modules/requests/requests.module.ts) |
| POST | `/requests/{id}/schedules` | GUARDIAN, STUDENT | [requests.module.ts](../apps/api/src/modules/requests/requests.module.ts) |
| POST | `/waitlist` | GUARDIAN | [requests.module.ts](../apps/api/src/modules/requests/requests.module.ts) |
| GET | `/waitlist` | GUARDIAN | [requests.module.ts](../apps/api/src/modules/requests/requests.module.ts) |
| GET | `/requests` | GUARDIAN, STUDENT, ADMIN, OPERATOR | [requests.module.ts](../apps/api/src/modules/requests/requests.module.ts) |
| GET | `/requests/{id}` | GUARDIAN, STUDENT, ADMIN, OPERATOR | [requests.module.ts](../apps/api/src/modules/requests/requests.module.ts) |
| GET | `/independent-student/enquiry-context` | INDEPENDENT_STUDENT | [student-enquiries.module.ts](../apps/api/src/modules/requests/student-enquiries.module.ts) |
| POST | `/delegated-students/{id}/enquiries` | GUARDIAN | [student-enquiries.module.ts](../apps/api/src/modules/requests/student-enquiries.module.ts) |
| POST | `/student-enquiries` | Helper/public/variable | [student-enquiries.module.ts](../apps/api/src/modules/requests/student-enquiries.module.ts) |
| GET | `/student-enquiries` | INDEPENDENT_STUDENT, GUARDIAN, ADMIN, OPERATOR, TEACHER | [student-enquiries.module.ts](../apps/api/src/modules/requests/student-enquiries.module.ts) |
| GET | `/student-enquiries/{id}` | INDEPENDENT_STUDENT, GUARDIAN, ADMIN, OPERATOR, TEACHER | [student-enquiries.module.ts](../apps/api/src/modules/requests/student-enquiries.module.ts) |
| POST | `/student-enquiries/{id}/withdrawals` | INDEPENDENT_STUDENT, GUARDIAN | [student-enquiries.module.ts](../apps/api/src/modules/requests/student-enquiries.module.ts) |
| POST | `/admin/student-enquiries/{id}/matches` | ADMIN, OPERATOR | [student-hiring.module.ts](../apps/api/src/modules/requests/student-hiring.module.ts) |
| GET | `/student-enquiries/{id}/shortlist` | INDEPENDENT_STUDENT, GUARDIAN, ADMIN, OPERATOR, TEACHER | [student-hiring.module.ts](../apps/api/src/modules/requests/student-hiring.module.ts) |
| POST | `/admin/student-enquiries/{id}/presentations` | ADMIN, OPERATOR | [student-hiring.module.ts](../apps/api/src/modules/requests/student-hiring.module.ts) |
| GET | `/student-opportunities` | TEACHER | [student-hiring.module.ts](../apps/api/src/modules/requests/student-hiring.module.ts) |
| POST | `/student-candidates/{id}/responses` | TEACHER | [student-hiring.module.ts](../apps/api/src/modules/requests/student-hiring.module.ts) |
| POST | `/student-enquiries/{id}/selections` | INDEPENDENT_STUDENT, GUARDIAN | [student-hiring.module.ts](../apps/api/src/modules/requests/student-hiring.module.ts) |
| GET | `/student-arrangements` | INDEPENDENT_STUDENT, GUARDIAN, TEACHER, ADMIN, OPERATOR | [student-hiring.module.ts](../apps/api/src/modules/requests/student-hiring.module.ts) |
| GET | `/student-arrangements/{id}` | INDEPENDENT_STUDENT, GUARDIAN, TEACHER, ADMIN, OPERATOR | [student-hiring.module.ts](../apps/api/src/modules/requests/student-hiring.module.ts) |
| POST | `/student-arrangements/{id}/acceptances` | INDEPENDENT_STUDENT, GUARDIAN, TEACHER | [student-hiring.module.ts](../apps/api/src/modules/requests/student-hiring.module.ts) |
| GET | `/student-arrangements/{id}/contact` | INDEPENDENT_STUDENT, GUARDIAN, TEACHER | [student-hiring.module.ts](../apps/api/src/modules/requests/student-hiring.module.ts) |
| POST | `/student-arrangements/{id}/closures` | INDEPENDENT_STUDENT, GUARDIAN, TEACHER | [student-hiring.module.ts](../apps/api/src/modules/requests/student-hiring.module.ts) |
| POST | `/student-arrangements/{id}/replacements` | INDEPENDENT_STUDENT, GUARDIAN | [student-hiring.module.ts](../apps/api/src/modules/requests/student-hiring.module.ts) |
| POST | `/student-enquiries/{id}/cases` | INDEPENDENT_STUDENT, GUARDIAN, TEACHER | [student-hiring.module.ts](../apps/api/src/modules/requests/student-hiring.module.ts) |
| POST | `/revision/holds` | GUARDIAN | [revision.module.ts](../apps/api/src/modules/revision/revision.module.ts) |
| POST | `/reservations/{id}/scope` | TEACHER | [revision.module.ts](../apps/api/src/modules/revision/revision.module.ts) |
| POST | `/dev/reservations/{id}/capture` | GUARDIAN | [revision.module.ts](../apps/api/src/modules/revision/revision.module.ts) |
| POST | `/reservations/{id}/cancel` | GUARDIAN | [revision.module.ts](../apps/api/src/modules/revision/revision.module.ts) |
| POST | `/teachers/{id}/availability` | TEACHER | [scheduling.module.ts](../apps/api/src/modules/scheduling/scheduling.module.ts) |
| GET | `/teachers/{id}/calendar` | TEACHER | [scheduling.module.ts](../apps/api/src/modules/scheduling/scheduling.module.ts) |
| POST | `/availability/{id}/changes` | TEACHER | [scheduling.module.ts](../apps/api/src/modules/scheduling/scheduling.module.ts) |
| POST | `/teachers/{id}/leave` | TEACHER | [scheduling.module.ts](../apps/api/src/modules/scheduling/scheduling.module.ts) |
| POST | `/leave/{id}/cancellations` | TEACHER | [scheduling.module.ts](../apps/api/src/modules/scheduling/scheduling.module.ts) |
| POST | `/teachers/{id}/capacity` | TEACHER | [scheduling.module.ts](../apps/api/src/modules/scheduling/scheduling.module.ts) |
| GET | `/teachers/{id}/availability` | Helper/public/variable | [scheduling.module.ts](../apps/api/src/modules/scheduling/scheduling.module.ts) |
| GET | `/admin/service-followups` | ADMIN, OPERATOR | [service.module.ts](../apps/api/src/modules/service/service.module.ts) |
| GET | `/admin/service-followups/{kind}/{id}` | ADMIN, OPERATOR | [service.module.ts](../apps/api/src/modules/service/service.module.ts) |
| GET | `/admin/service-followups/{kind}/{id}/contact-details` | ADMIN, OPERATOR | [service.module.ts](../apps/api/src/modules/service/service.module.ts) |
| POST | `/admin/service-followups/{kind}/{id}/assignments` | ADMIN, OPERATOR | [service.module.ts](../apps/api/src/modules/service/service.module.ts) |
| POST | `/admin/service-followups/{kind}/{id}/contacts` | ADMIN, OPERATOR | [service.module.ts](../apps/api/src/modules/service/service.module.ts) |
| GET | `/support/context` | GUARDIAN, TEACHER, STUDENT, INDEPENDENT_STUDENT | [support.module.ts](../apps/api/src/modules/support/support.module.ts) |
| POST | `/cases` | GUARDIAN, TEACHER, STUDENT, INDEPENDENT_STUDENT | [support.module.ts](../apps/api/src/modules/support/support.module.ts) |
| GET | `/cases` | GUARDIAN, TEACHER, STUDENT, INDEPENDENT_STUDENT, ADMIN, OPERATOR | [support.module.ts](../apps/api/src/modules/support/support.module.ts) |
| GET | `/cases/{id}` | GUARDIAN, TEACHER, STUDENT, INDEPENDENT_STUDENT, ADMIN, OPERATOR | [support.module.ts](../apps/api/src/modules/support/support.module.ts) |
| POST | `/cases/{id}/updates` | GUARDIAN, TEACHER, STUDENT, INDEPENDENT_STUDENT, ADMIN, OPERATOR | [support.module.ts](../apps/api/src/modules/support/support.module.ts) |
| POST | `/admin/cases/{id}/triage` | ADMIN, OPERATOR | [support.module.ts](../apps/api/src/modules/support/support.module.ts) |
| POST | `/teacher-applications` | GUARDIAN, TEACHER | [teachers.module.ts](../apps/api/src/modules/teachers/teachers.module.ts) |
| POST | `/teacher-applications/{id}/revisions` | TEACHER | [teachers.module.ts](../apps/api/src/modules/teachers/teachers.module.ts) |
| GET | `/teacher-applications/{id}/revision-draft` | TEACHER | [teachers.module.ts](../apps/api/src/modules/teachers/teachers.module.ts) |
| POST | `/teacher-applications/{id}/revision-drafts` | TEACHER | [teachers.module.ts](../apps/api/src/modules/teachers/teachers.module.ts) |
| POST | `/teacher-applications/{id}/revision-draft-discards` | TEACHER | [teachers.module.ts](../apps/api/src/modules/teachers/teachers.module.ts) |
| POST | `/teacher-applications/{id}/revision-draft-submissions` | TEACHER | [teachers.module.ts](../apps/api/src/modules/teachers/teachers.module.ts) |
| GET | `/admin/teachers` | ADMIN, REVIEWER | [teachers.module.ts](../apps/api/src/modules/teachers/teachers.module.ts) |
| POST | `/admin/teachers/{id}/reviews` | ADMIN, REVIEWER | [teachers.module.ts](../apps/api/src/modules/teachers/teachers.module.ts) |
| GET | `/guardian-verifications` | GUARDIAN | [guardian-verification.ts](../apps/api/src/modules/verification/guardian-verification.ts) |
| POST | `/guardian-verifications` | GUARDIAN | [guardian-verification.ts](../apps/api/src/modules/verification/guardian-verification.ts) |
| GET | `/guardian-verifications/{id}` | GUARDIAN, ADMIN, REVIEWER | [guardian-verification.ts](../apps/api/src/modules/verification/guardian-verification.ts) |
| POST | `/guardian-verifications/{id}/revisions` | GUARDIAN | [guardian-verification.ts](../apps/api/src/modules/verification/guardian-verification.ts) |
| POST | `/guardian-verifications/{id}/evidence` | GUARDIAN | [guardian-verification.ts](../apps/api/src/modules/verification/guardian-verification.ts) |
| GET | `/guardian-verification-invitations` | GUARDIAN, STUDENT | [guardian-verification.ts](../apps/api/src/modules/verification/guardian-verification.ts) |
| POST | `/guardian-verifications/{id}/student-acknowledgments` | GUARDIAN, STUDENT | [guardian-verification.ts](../apps/api/src/modules/verification/guardian-verification.ts) |
| POST | `/guardian-verifications/{id}/submissions` | GUARDIAN | [guardian-verification.ts](../apps/api/src/modules/verification/guardian-verification.ts) |
| POST | `/guardian-verifications/{id}/cancellations` | GUARDIAN | [guardian-verification.ts](../apps/api/src/modules/verification/guardian-verification.ts) |
| GET | `/admin/guardian-verifications` | ADMIN, REVIEWER | [guardian-verification.ts](../apps/api/src/modules/verification/guardian-verification.ts) |
| POST | `/admin/guardian-verifications/{id}/decisions` | ADMIN, REVIEWER | [guardian-verification.ts](../apps/api/src/modules/verification/guardian-verification.ts) |
| POST | `/children/{id}/guardian-verifications` | GUARDIAN | [guardian-verification.ts](../apps/api/src/modules/verification/guardian-verification.ts) |
| GET | `/guardian-evidence/{id}/content` | GUARDIAN, ADMIN, REVIEWER | [guardian-verification.ts](../apps/api/src/modules/verification/guardian-verification.ts) |
| POST | `/teachers/{id}/evidence` | TEACHER | [verification.module.ts](../apps/api/src/modules/verification/verification.module.ts) |
| GET | `/teachers/{id}/evidence` | TEACHER, ADMIN, REVIEWER | [verification.module.ts](../apps/api/src/modules/verification/verification.module.ts) |
| GET | `/evidence/{id}/content` | TEACHER, ADMIN, REVIEWER | [verification.module.ts](../apps/api/src/modules/verification/verification.module.ts) |
| POST | `/admin/evidence/{id}/retries` | ADMIN, REVIEWER | [verification.module.ts](../apps/api/src/modules/verification/verification.module.ts) |
| GET | `/admin/teachers/{id}/checks` | ADMIN, REVIEWER | [verification.module.ts](../apps/api/src/modules/verification/verification.module.ts) |
| POST | `/admin/teachers/{id}/checks` | ADMIN, REVIEWER | [verification.module.ts](../apps/api/src/modules/verification/verification.module.ts) |
