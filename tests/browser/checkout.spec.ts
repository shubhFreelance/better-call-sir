import { chooseHindi, checkHindi } from "../helpers/hindi";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { validator } from "../helpers/contract";
import { ids } from "../../packages/test-fixtures/src";
const parent = "10000000-0000-4000-8000-000000000081",
  child = "20000000-0000-4000-8000-000000000081",
  teacherId = "30000000-0000-4000-8000-000000000081",
  rId = "40000000-0000-4000-8000-000000000081",
  oId = "50000000-0000-4000-8000-000000000081",
  mId = "60000000-0000-4000-8000-000000000081",
  invoiceId = "70000000-0000-4000-8000-000000000081";
const iso = (days = 2) => new Date(Date.now() + days * 86400000).toISOString(),
  local = (value: string) =>
    new Date(new Date(value).getTime() + 330 * 60000)
      .toISOString()
      .slice(0, 16);
async function mock(page: Page, mode = "normal", role = "GUARDIAN") {
  const profile = {
    id: teacherId,
    slug: "synthetic-checkout",
    name: "Synthetic Expert",
    headline: "Focused practice",
    bio: "Synthetic provider fixture",
    subjects: ["Maths", "Science"],
    boards: ["CBSE"],
    grades: [8],
    languages: ["English", "Hindi"],
    modes: ["ONLINE"],
    localities: [],
    monthlyPaise: 250050,
    experience: 4,
    avatarColor: "#034F46",
    capabilityLabel: "Reviewed Maths/Science",
    consultationOptIn: false,
  };
  const confirmed = mode.includes("meeting") || role === "STUDENT";
  let r: any = {
    id: rId,
    teacherId,
    guardianId: parent,
    childId: child,
    kind: "REVISION",
    startsAt: confirmed ? iso(5 / 1440) : iso(),
    endsAt: confirmed
      ? iso(25 / 1440)
      : new Date(new Date(iso()).getTime() + 1200000).toISOString(),
    status: confirmed ? "CONFIRMED" : "HOLD",
    expiresAt: confirmed ? null : mode === "expired" ? iso(-1) : iso(10 / 1440),
    version: 2,
    topic: "Synthetic fractions brief",
    subject: "Maths",
    language: "English",
    scopeAccepted: mode !== "scope",
    amountPaise: 50105,
    payablePaise: 50105,
    pricePolicyVersion: "synthetic-price-v1",
  };
  let reservations = mode === "form" || mode === "uncertain-hold" ? [] : [r];
  const kind = mode === "invoice" ? "INVOICE" : "REVISION",
    resourceId = kind === "INVOICE" ? invoiceId : rId;
  const gatewayMode =
    mode === "live" ||
    mode === "unallocated" ||
    mode === "sdk-error" ||
    mode === "invoice"
      ? "LIVE"
      : "SANDBOX";
  let order: any =
    mode === "live" ||
    mode === "unallocated" ||
    mode === "sdk-error" ||
    mode === "invoice" ||
    mode === "mismatch"
      ? {
          id: oId,
          accountId: parent,
          kind,
          resourceId,
          amountPaise: 50105,
          currency: "INR",
          provider: "RAZORPAY",
          providerMode: "LIVE",
          providerOrderId: "order_contract_fixture",
          status: "CREATED",
          version: 2,
          createdAt: iso(0),
          updatedAt: iso(0),
        }
      : null;
  if (mode === "mismatch") {
    order.resourceId = invoiceId;
    order.status = "PAID";
  }
  const paths: string[] = [],
    writes: { path: string; key: string; body: any }[] = [],
    replays = new Map<string, any>();
  let orderCount = order ? 1 : 0;
  function check(name: string, value: unknown) {
    const valid = validator(name);
    expect(valid(value), JSON.stringify(valid.errors)).toBe(true);
    return value;
  }
  await page.route(
    "https://checkout.razorpay.com/v1/checkout.js",
    async (route) =>
      mode === "sdk-error"
        ? route.abort("failed")
        : route.fulfill({
            contentType: "application/javascript",
            body: `window.Razorpay = class { constructor(options){this.options=options;window.__gatewayOptions=options;} on(){} close(){} open(){window.__gatewayOpened=(window.__gatewayOpened||0)+1;setTimeout(()=>this.options.handler({razorpay_payment_id:'pay_fixture'}),10);}};`,
          }),
  );
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    paths.push(req.method() + " " + path);
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: parent,
            name: "Synthetic Guardian",
            role,
            verified: mode !== "unverified",
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (path.endsWith("/dashboard"))
      return route.fulfill({
        json: {
          role,
          window: {
            start: iso(-30),
            end: iso(0),
            timezone: "Asia/Kolkata",
            metricVersion: "synthetic-v1",
          },
          metrics: { classesTaken: 0, pendingAttendance: 0, disputed: 0 },
          children: [
            { id: child, alias: "Synthetic Learner", grade: 8, board: "CBSE" },
            {
              id: "20000000-0000-4000-8000-000000000082",
              alias: "Other Learner",
              grade: 8,
              board: "CBSE",
            },
          ],
          teachers: [profile],
          profile: role === "TEACHER" ? profile : undefined,
          lessons: [],
          placements: [],
          requests: [],
          reservations: role === "STUDENT" ? [] : reservations,
          consent: { withdrawnAt: null },
          invoices:
            mode === "invoice"
              ? [
                  {
                    id: invoiceId,
                    amountPaise: 50105,
                    status: order?.status === "PAID" ? "PAID" : "DUE",
                    version: 1,
                    policyVersion: "synthetic-fee-v1",
                  },
                ]
              : [],
        },
      });
    if (path.endsWith("/teachers"))
      return route.fulfill({ json: { items: [profile], nextCursor: null } });
    if (path.endsWith("/demos")) return route.fulfill({ json: { items: [] } });
    if (path.endsWith("/availability")) {
      expect(url.searchParams.get("kind")).toBe("REVISION");
      return route.fulfill({
        json: check("PublicSlots", {
          items: [
            {
              teacherId,
              kind: "REVISION",
              startsAt: iso(),
              endsAt: new Date(
                new Date(iso()).getTime() +
                  Number(url.searchParams.get("duration")) * 60000,
              ).toISOString(),
              timezone: "Asia/Kolkata",
            },
          ],
          nextCursor: null,
          horizonDays: 60,
          timezone: "Asia/Kolkata",
        }),
      });
    }
    if (path.endsWith("/checkout-orders") && req.method() === "GET")
      return route.fulfill({
        json: check("CurrentCheckout", {
          order,
          publicKeyId:
            order?.providerMode === "LIVE" ? "rzp_test_fixture" : null,
        }),
      });
    if (path.endsWith(`/reservations/${rId}/meeting`)) {
      let meeting: any = {
        id: mId,
        reservationId: rId,
        status: mode === "failed-meeting" ? "FAILED" : "READY",
        startsAt: r.startsAt,
        endsAt: r.endsAt,
        provider: "GOOGLE_MEET",
        providerMode: mode === "sandbox-meeting" ? "SANDBOX" : "LIVE",
        canJoin: mode !== "future-meeting" && mode !== "failed-meeting",
        joinUrl:
          mode === "future-meeting" || mode === "failed-meeting"
            ? null
            : mode === "sandbox-meeting"
              ? "https://meet.invalid/synthetic/fixture"
              : mode === "unsafe-meeting"
                ? "https://meet.google.com.attacker.example/abc-defg-hij"
                : "https://meet.google.com/abc-defg-hij",
        version: 1,
      };
      if (mode === "future-meeting") {
        meeting.startsAt = iso(1);
        meeting.endsAt = iso(1 + 20 / 1440);
      }
      return route.fulfill({ json: check("ReservationMeeting", { meeting }) });
    }
    if (path.endsWith("/lessons"))
      return route.fulfill({
        json: check("LessonRecords", {
          items: [
            {
              id: "80000000-0000-4000-8000-000000000081",
              placementId: null,
              recurringScheduleId: null,
              reservationId: rId,
              teacherId,
              childId: child,
              kind: "REVISION",
              subject: "Maths",
              startsAt: r.startsAt,
              endsAt: r.endsAt,
              status: "SCHEDULED",
              attendance: "PENDING",
              disputed: false,
              version: 1,
              learner: { alias: "Synthetic Learner", grade: 8, board: "CBSE" },
              teacher: { id: teacherId, name: profile.name },
              confirmations: [],
              recap: null,
              recapSubmittedAt: null,
              myConfirmation: null,
              feedback: null,
              feedbackEligible: false,
            },
          ],
          nextCursor: null,
        }),
      });
    if (req.method() === "POST") {
      const body = req.postDataJSON(),
        key = req.headers()["idempotency-key"];
      writes.push({ path, key, body });
      expect(req.headers()["x-csrf-token"]).toBe("synthetic-csrf");
      expect(key).toBeTruthy();
      if (replays.has(key))
        return route.fulfill({ status: 201, json: replays.get(key) });
      if (path.endsWith("/checkout-orders") && mode === "paused")
        return route.fulfill({
          status: 503,
          json: {
            code: "CHECKOUT_PAUSED",
            message: "Checkout is temporarily unavailable.",
          },
        });
      let result: any;
      if (path.endsWith("/revision/holds")) {
        expect(body.childId).toBe(child);
        r = {
          ...r,
          ...body,
          version: 1,
          scopeAccepted: false,
          endsAt: new Date(
            new Date(body.startsAt).getTime() + body.duration * 60000,
          ).toISOString(),
        };
        reservations = [r];
        result = r;
      } else if (path.endsWith("/scope")) {
        expect(body.expectedVersion).toBe(r.version);
        r = { ...r, scopeAccepted: true, version: r.version + 1 };
        reservations = [r];
        result = r;
      } else if (path.endsWith("/cancel")) {
        if (mode === "late-cancel")
          return route.fulfill({
            status: 409,
            json: {
              code: "POLICY_REVIEW",
              message:
                "Late cancellation requires support review. No refund was confirmed.",
            },
          });
        r = { ...r, status: "CANCELLED", version: r.version + 1 };
        reservations = [r];
        result = r;
      } else if (path.endsWith("/checkout-orders")) {
        check("CheckoutOrderInput", body);
        expect(body.expectedVersion).toBe(r.version);
        orderCount++;
        order = {
          id: oId,
          accountId: parent,
          kind: body.kind,
          resourceId: body.resourceId,
          amountPaise: r.amountPaise,
          currency: "INR",
          provider: "RAZORPAY",
          providerMode: gatewayMode,
          providerOrderId: "order_contract_fixture",
          status: "CREATED",
          version: 2,
          createdAt: iso(0),
          updatedAt: iso(0),
        };
        result = check("CheckoutOrder", order);
      } else throw new Error("Unexpected mutation " + path);
      replays.set(key, result);
      if (mode.startsWith("uncertain-") && writes.length === 1)
        return route.abort("failed");
      return route.fulfill({ status: 201, json: result });
    }
    return route.fulfill({
      status: 404,
      json: { code: "NOT_FOUND", message: "Unexpected test route" },
    });
  });
  return {
    writes,
    paths,
    count: () => orderCount,
    capture: () => {
      order = { ...order, status: "PAID", version: 3 };
      r = {
        ...r,
        status: mode === "unallocated" ? "PAID_UNALLOCATED" : "CONFIRMED",
        expiresAt: null,
        version: 3,
      };
      reservations = [r];
    },
    getReservation: () => r,
  };
}
async function fillRevision(page: Page) {
  await page.getByLabel("Learner", { exact: true }).selectOption(child);
  await page
    .getByLabel("Revision subject", { exact: true })
    .selectOption("Science");
  await page
    .getByLabel("Teaching language", { exact: true })
    .selectOption("Hindi");
  await page
    .getByLabel("Revision expert", { exact: true })
    .selectOption(teacherId);
  await page.getByLabel("Session duration", { exact: true }).selectOption("40");
  await page.getByLabel("Preferred start (IST)").fill(local(iso()));
  await page
    .getByLabel("Topic brief")
    .fill("Synthetic CBSE Science revision: motion graphs and units.");
  await page.getByRole("button", { name: "Review session request" }).click();
  await page.getByRole("checkbox", { name: /I reviewed this topic/ }).check();
}
async function reviewPayment(page: Page, existing = false) {
  await page
    .getByRole("button", {
      name: existing ? "Review payment terms" : "Review payment",
      exact: true,
    })
    .click();
  await page
    .getByRole("checkbox", { name: /I reviewed the exact amount/ })
    .check();
}
test("revision request selects learner and scope, saves exact UTC and offers no unsupported 60-minute option", async ({
  page,
}) => {
  const state = await mock(page, "form");
  await page.goto("/revision");
  await page.getByRole("button", { name: "Review session request" }).click();
  await expect(
    page.getByText(/Choose a learner, an eligible expert/),
  ).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await fillRevision(page);
  await expect(
    page.getByRole("option", { name: "60 minutes", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Request scope & hold slot" }).click();
  await expect(page.getByText(/Revision hold saved/)).toBeVisible();
  expect(state.writes[0].body).toMatchObject({
    childId: child,
    teacherId,
    subject: "Science",
    language: "Hindi",
    duration: 40,
  });
  expect(new Date(state.writes[0].body.startsAt).getTime()).toBeGreaterThan(
    Date.now() + 3600000,
  );
});
test("unknown revision hold freezes edits and retries exactly once without a duplicate reservation", async ({
  page,
}) => {
  const state = await mock(page, "uncertain-hold");
  await page.goto(`/revision?teacher=${teacherId}`);
  await fillRevision(page);
  await page.getByRole("button", { name: "Request scope & hold slot" }).click();
  await expect(
    page.getByText(/We couldn’t confirm this decision/),
  ).toBeVisible();
  await expect(page.getByLabel("Topic brief")).toBeDisabled();
  await page.getByRole("button", { name: "Retry same decision" }).click();
  await expect(page.getByText(/Revision hold saved/)).toBeVisible();
  expect(state.writes[0]).toEqual(state.writes[1]);
});
test("advertised revision times fill a scoped IST proposal without bypassing the final hold check", async ({
  page,
}) => {
  const state = await mock(page, "form");
  await page.goto("/revision");
  await page.getByLabel("Learner", { exact: true }).selectOption(child);
  await page
    .getByLabel("Revision expert", { exact: true })
    .selectOption(teacherId);
  await page
    .getByRole("button", { name: "See available revision times" })
    .click();
  await expect(
    page.getByText(
      "Advertised free times for the chosen date. Availability is rechecked when saving.",
    ),
  ).toBeVisible();
  await page.locator(".revision-available button").first().click();
  await expect(page.getByLabel("Preferred start (IST)")).not.toHaveValue("");
  expect(state.writes).toHaveLength(0);
});
test("unverified guardians and student accounts never load private revision forms", async ({
  page,
}) => {
  const state = await mock(page, "unverified");
  await page.goto("/revision");
  await expect(
    page.getByText(/Guardian adult verification is required/),
  ).toBeVisible();
  expect(state.paths.some((p) => p.includes("/dashboard"))).toBe(false);
  await page.unroute("**/api/v1/**");
  const second = await mock(page, "normal", "STUDENT");
  await page.reload();
  await expect(
    page.getByText(/Only a guardian can book and pay/),
  ).toBeVisible();
  expect(second.paths.some((p) => p.includes("/dashboard"))).toBe(false);
});
test("expert scope requires explicit review and unknown acceptance preserves the same version/key", async ({
  page,
}) => {
  const state = await mock(page, "uncertain-scope", "TEACHER");
  state.getReservation().scopeAccepted = false;
  await page.goto("/dashboard/bookings");
  await page.getByRole("button", { name: "Review topic scope" }).click();
  await page
    .getByRole("button", { name: "Accept topic scope", exact: true })
    .click();
  expect(state.writes).toHaveLength(0);
  await page
    .getByRole("checkbox", { name: /I can deliver this topic brief/ })
    .check();
  await page
    .getByRole("button", { name: "Accept topic scope", exact: true })
    .click();
  await expect(
    page.getByText(/We couldn’t confirm this decision/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry same decision" }).click();
  await expect(page.getByText(/Expert scope acceptance saved/)).toBeVisible();
  expect(state.writes[0]).toEqual(state.writes[1]);
  expect(state.writes[0].body.expectedVersion).toBe(2);
});
test("checkout release gate shows a definite paused result and never loads Razorpay", async ({
  page,
}) => {
  const state = await mock(page, "paused");
  await page.goto("/dashboard/bookings");
  await reviewPayment(page);
  await page.getByRole("button", { name: "Create secure checkout" }).click();
  await expect(
    page.getByText("Checkout is temporarily unavailable.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /I reviewed the exact amount/ }),
  ).toBeEnabled();
  await expect(page.getByText(/We couldn’t confirm this decision/)).toHaveCount(
    0,
  );
  expect(state.count()).toBe(0);
  expect(await page.evaluate(() => !!window.Razorpay)).toBe(false);
});
test("rapid checkout confirmation submits one review and one saved order", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/dashboard/bookings");
  await reviewPayment(page);
  await page
    .getByRole("button", { name: "Create secure checkout" })
    .evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
  await expect(page.getByText(/This is a local sandbox order/)).toBeVisible();
  expect(
    state.writes.filter((write) => write.path.endsWith("/checkout-orders")),
  ).toHaveLength(1);
  expect(state.count()).toBe(1);
});
test("lost checkout response retries its exact key, reload recovers the saved sandbox order and never offers a new payment", async ({
  page,
}) => {
  const state = await mock(page, "uncertain-order");
  await page.goto("/dashboard/bookings");
  await reviewPayment(page);
  await page.getByRole("button", { name: "Create secure checkout" }).click();
  await expect(
    page.getByText(/We couldn’t confirm this decision/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review cancellation" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Retry same decision" }).click();
  await expect(page.getByText(/This is a local sandbox order/)).toBeVisible();
  expect(state.writes[0]).toEqual(state.writes[1]);
  expect(state.count()).toBe(1);
  await page.reload();
  await expect(page.getByText(/This is a local sandbox order/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create secure checkout" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Continue to Razorpay" }),
  ).toHaveCount(0);
});
test("Razorpay callback is not payment proof; exact money and saved order are used until signed server capture confirms the booking", async ({
  page,
}) => {
  const state = await mock(page, "live");
  await page.goto("/dashboard/bookings");
  await reviewPayment(page, true);
  await page.getByRole("button", { name: "Save payment review" }).click();
  await page.getByRole("button", { name: "Continue to Razorpay" }).click();
  await expect(page.getByText(/Waiting for server confirmation/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Payment captured by the server" }),
  ).toHaveCount(0);
  expect(state.getReservation().status).toBe("HOLD");
  expect(
    await page.evaluate(() => {
      const value = (window as any).__gatewayOptions;
      return {
        amount: value.amount,
        currency: value.currency,
        order: value.order_id,
        key: value.key,
      };
    }),
  ).toEqual({
    amount: 50105,
    currency: "INR",
    order: "order_contract_fixture",
    key: "rzp_test_fixture",
  });
  expect(state.writes).toHaveLength(0);
  state.capture();
  await page.getByRole("button", { name: "Check payment status" }).click();
  await expect(
    page.getByRole("heading", { name: "Payment captured by the server" }),
  ).toBeVisible();
  await expect(page.getByText("confirmed", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review cancellation" }),
  ).toBeEnabled();
  expect(state.count()).toBe(1);
});
test("SDK delivery failure retains the same saved order and offers a safe page-reload recovery", async ({
  page,
}) => {
  const state = await mock(page, "sdk-error");
  await page.goto("/dashboard/bookings");
  await reviewPayment(page, true);
  await page.getByRole("button", { name: "Save payment review" }).click();
  await page.getByRole("button", { name: "Continue to Razorpay" }).click();
  await expect(
    page.getByText(
      "Secure checkout could not load. Refresh the page to retry this saved order.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(state.count()).toBe(1);
  expect(state.writes).toHaveLength(0);
  await page
    .getByRole("button", { name: "Refresh page to reload checkout" })
    .click();
  await expect(
    page.getByRole("button", { name: "Review payment terms" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create secure checkout" }),
  ).toHaveCount(0);
});
test("a mismatched saved checkout cannot expose a payment action or claim captured payment", async ({
  page,
}) => {
  const state = await mock(page, "mismatch");
  await page.goto("/dashboard/bookings");
  await expect(
    page.getByText(/Saved checkout details could not be verified/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Payment captured by the server" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Review payment", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Continue to Razorpay" }),
  ).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});
test("captured but unallocated revision does not become a confirmed class or a settled refund", async ({
  page,
}) => {
  const state = await mock(page, "unallocated");
  state.capture();
  await page.goto("/dashboard/bookings");
  await expect(
    page.getByText(/Payment was captured but this slot was not allocated/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue to Razorpay" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Join Google Meet" }),
  ).toHaveCount(0);
  await expect(page.getByText("confirmed", { exact: true })).toHaveCount(0);
});
test("expired holds stay read-only and cancellation review does not fabricate a refund", async ({
  page,
}) => {
  await mock(page, "expired");
  await page.goto("/dashboard/bookings");
  await expect(page.getByText("hold expired", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review payment", exact: true }),
  ).toHaveCount(0);
  await page.unroute("**/api/v1/**");
  const state = await mock(page, "late-cancel");
  await page.reload();
  await page.getByRole("button", { name: "Review cancellation" }).click();
  await page
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  expect(state.writes).toHaveLength(0);
  await page.getByLabel("Reason for cancellation").fill("Plans changed");
  await page
    .getByRole("checkbox", { name: /I reviewed the cancellation/ })
    .check();
  await page
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await expect(
    page.getByText(/Late cancellation requires support review/),
  ).toBeVisible();
  expect(state.getReservation().status).toBe("HOLD");
});
test("private meetings allow only current live Google Meet URLs and block sandbox, future, failed and lookalike links", async ({
  page,
}) => {
  await mock(page, "live-meeting");
  await page.goto("/dashboard/bookings");
  await expect(
    page.getByRole("link", { name: "Join Google Meet" }),
  ).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");
  await expect(
    page.getByRole("link", { name: "Join Google Meet" }),
  ).toHaveAttribute("rel", "noopener noreferrer");
  for (const mode of [
    "sandbox-meeting",
    "future-meeting",
    "unsafe-meeting",
    "failed-meeting",
  ]) {
    await page.unroute("**/api/v1/**");
    await mock(page, mode);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Refresh meeting access" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Join Google Meet" }),
    ).toHaveCount(0);
  }
});
test("student lesson meeting access never reads or creates guardian checkout", async ({
  page,
}) => {
  const state = await mock(page, "live-meeting", "STUDENT");
  await page.goto("/dashboard/lessons");
  await expect(
    page.getByRole("link", { name: "Join Google Meet" }),
  ).toBeVisible();
  expect(state.paths.some((p) => p.includes("/checkout-orders"))).toBe(false);
  expect(state.writes).toHaveLength(0);
  await expect(
    page.getByRole("button", { name: "Review payment", exact: true }),
  ).toHaveCount(0);
});
test("teacher invoice checkout uses its own stored fee and cannot treat a callback as capture", async ({
  page,
}) => {
  const state = await mock(page, "invoice", "TEACHER");
  await page.goto("/dashboard/bookings");
  await reviewPayment(page, true);
  await page.getByRole("button", { name: "Save payment review" }).click();
  await page.getByRole("button", { name: "Continue to Razorpay" }).click();
  await expect(page.getByText(/Waiting for server confirmation/)).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).__gatewayOptions.description),
  ).toBe("Teacher placement fee");
  expect(state.writes).toHaveLength(0);
  state.capture();
  await page.getByRole("button", { name: "Check payment status" }).click();
  await expect(
    page.getByRole("heading", { name: "Payment captured by the server" }),
  ).toBeVisible();
});
test("revision and payment review use the premium palette, fit mobile and have accessible labels/contrast", async ({
  page,
}) => {
  await mock(page, "form");
  await page.goto("/revision");
  await fillRevision(page);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: "test-results/revision-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  let result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/revision-mobile.png",
    fullPage: true,
  });
  await page.unroute("**/api/v1/**");
  await mock(page, "normal");
  await page.goto("/dashboard/bookings");
  await reviewPayment(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/checkout-mobile.png",
    fullPage: true,
  });
});
async function login(page: Page, name: string) {
  await page.goto("/login");
  await page.getByText("Development accounts", { exact: true }).click();
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(
    page.getByRole("heading", { name: new RegExp(`Hello, ${name}`) }),
  ).toBeVisible();
}
test("real revision hold, expert scope, paused checkout and synthetic capture preserve booking/meeting boundaries", async ({
  page,
  context,
}) => {
  await login(page, "Kavita");
  await page.goto(`/revision?teacher=${ids.teacher}`);
  await page.getByLabel("Learner", { exact: true }).selectOption(ids.child);
  await page
    .getByLabel("Revision expert", { exact: true })
    .selectOption(ids.teacher);
  const start = new Date(Date.now() + 35 * 86400000);
  start.setUTCHours(4, 0, 0, 0);
  const end = new Date(start.getTime() + 4 * 3600000);
  const slots = await page.request.get(
    `/api/v1/teachers/${ids.teacher}/availability?${new URLSearchParams({ kind: "REVISION", duration: "20", startsAt: start.toISOString(), endsAt: end.toISOString(), limit: "50" })}`,
  );
  expect(slots.ok()).toBe(true);
  const free = (await slots.json()).items[0];
  expect(free).toBeTruthy();
  const topic = `Synthetic browser revision ${Date.now()}`;
  await page.getByLabel("Preferred start (IST)").fill(local(free.startsAt));
  await page.getByLabel("Topic brief").fill(topic);
  await page.getByRole("button", { name: "Review session request" }).click();
  await page.getByRole("checkbox", { name: /I reviewed this topic/ }).check();
  await page.getByRole("button", { name: "Request scope & hold slot" }).click();
  await expect(page.getByText(/Revision hold saved/)).toBeVisible();
  const data = await page.request.get("/api/v1/dashboard"),
    hold = (await data.json()).reservations.find((r: any) => r.topic === topic);
  expect(hold.childId).toBe(ids.child);
  expect(hold.status).toBe("HOLD");
  const teacherContext = await context.browser()!.newContext();
  try {
    const expert = await teacherContext.newPage();
    await login(expert, "Ananya");
    await expert.goto("/dashboard/bookings");
    const card = expert.locator(`[data-reservation-id="${hold.id}"]`);
    await card.getByRole("button", { name: "Review topic scope" }).click();
    await card
      .getByRole("checkbox", { name: /I can deliver this topic brief/ })
      .check();
    await card
      .getByRole("button", { name: "Accept topic scope", exact: true })
      .click();
    await expect(card.getByText(/Expert scope acceptance saved/)).toBeVisible();
  } finally {
    await teacherContext.close();
  }
  await page.goto("/dashboard/bookings");
  const card = page.locator(`[data-reservation-id="${hold.id}"]`);
  await card
    .getByRole("button", { name: "Review payment", exact: true })
    .click();
  await card
    .getByRole("checkbox", { name: /I reviewed the exact amount/ })
    .check();
  await card.getByRole("button", { name: "Create secure checkout" }).click();
  await expect(
    card.getByText("Checkout is temporarily unavailable.", { exact: true }),
  ).toBeVisible();
  const session = await (await page.request.get("/api/v1/auth/session")).json();
  const capture = await page.request.post(
    `/api/v1/dev/reservations/${hold.id}/capture`,
    {
      headers: {
        Origin: "http://localhost:3000",
        "X-CSRF-Token": session.csrfToken,
        "Idempotency-Key": crypto.randomUUID(),
      },
      data: {
        providerEventId: `synthetic-ui-${hold.id}`,
        amountPaise: hold.amountPaise,
        currency: "INR",
      },
    },
  );
  expect(capture.status()).toBe(201);
  await card
    .getByRole("button", { name: "Refresh booking", exact: true })
    .click();
  await expect(card.getByText("confirmed", { exact: true })).toBeVisible();
  await expect(
    card.getByText(/This development meeting cannot be joined/),
  ).toBeVisible();
  await expect(
    card.getByRole("link", { name: "Join Google Meet" }),
  ).toHaveCount(0);
});

 test("Hindi complete interface — पुनरावृत्ति और भुगतान", async ({ page }) => {
 await chooseHindi(page);
 await mock(page, "form");
 await page.goto("/revision");
 await checkHindi(page);
 await page.setViewportSize({ width: 360, height: 800 });
 await checkHindi(page);
 });
