import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { validator } from "./contract";
import { chooseHindi, checkHindi } from "./hindi";
const owner = "10000000-0000-4000-8000-000000000911",
  teacher = "10000000-0000-4000-8000-000000000912",
  staff = "10000000-0000-4000-8000-000000000913",
  id = "20000000-0000-4000-8000-000000000911",
  minimumId = "30000000-0000-4000-8000-000000000911",
  caseId = "40000000-0000-4000-8000-000000000911";
const day = () => new Date().toISOString().slice(0, 10),
  url = (kind = "PLACEMENT") =>
    `/dashboard/minimum-tuition?kind=${kind}&arrangement=${id}`;
async function fixture(
  page: Page,
  options: {
    role?: string;
    active?: boolean;
    credit?: boolean;
    pendingReview?: boolean;
    lost?: boolean;
    readFailure?: boolean;
    closed?: boolean;
    legacy?: boolean;
    supporter?: boolean;
    zero?: boolean;
    termsPending?: boolean;
    history?: boolean;
  } = {},
) {
  const role = options.role || "GUARDIAN",
    actor =
      role === "TEACHER"
        ? teacher
        : role === "ADMIN"
          ? staff
          : role === "STUDENT" || options.supporter
            ? "10000000-0000-4000-8000-000000000914"
            : owner,
    kind =
      role === "INDEPENDENT_STUDENT" || options.supporter
        ? "INDEPENDENT"
        : "PLACEMENT",
    now = new Date().toISOString();
  let denied = false,
    lost = false,
    seenHistory = false;
  const writes: any[] = [],
    receipts = new Map<string, unknown>();
  const agreement: any = {
    id: minimumId,
    kind,
    resourceId: id,
    monthlyPaise: 600000,
    days: options.zero ? 0 : 15,
    minimumPaise: options.zero ? 0 : 300000,
    adjustedPaise: options.zero ? 0 : 300000,
    policyVersion: "minimum-tuition-v1",
    commencementDate: options.active ? day() : null,
    familyConfirmedAt: options.active ? now : null,
    teacherConfirmedAt: options.active ? now : null,
    version: options.active ? 3 : 1,
    createdAt: now,
  };
  const credits: any[] = options.credit
    ? [
        {
          id: "50000000-0000-4000-8000-000000000911",
          minimumId,
          proposerId: owner,
          confirmerId: null,
          amountPaise: 100000,
          paidOn: day(),
          reference: "Synthetic tuition receipt",
          status: "PENDING",
          createdAt: now,
          decidedAt: null,
        },
      ]
    : [];
  const review: any = {
    id: "60000000-0000-4000-8000-000000000911",
    minimumId,
    caseId,
    requesterId: owner,
    region: "Raipur",
    reason: "NON_DELIVERY",
    status: "PENDING",
    reviewerId: null,
    decisionReason: null,
    adjustedPaise: null,
    decidedAt: null,
    createdAt: now,
  };
  let reviews: any[] = options.pendingReview ? [review] : [];
  function view(params = new URLSearchParams()) {
    const commenced =
        !!agreement.familyConfirmedAt && !!agreement.teacherConfirmedAt,
      creditedPaise = credits
        .filter((c) => c.status === "CONFIRMED")
        .reduce((sum, c) => sum + c.amountPaise, 0),
      obligationPaise = commenced ? agreement.adjustedPaise : 0,
      pending = reviews.find((r) => r.status === "PENDING") || null;
    return {
      id,
      available: !options.legacy,
      context: {
        teacherName: "Synthetic Teacher",
        learnerName: "Synthetic Learner",
        subject: "Maths",
      },
      startGate: options.closed
        ? "CLOSED"
        : options.termsPending
          ? "TERMS_PENDING"
          : "READY",
      agreement: options.legacy ? null : agreement,
      summary: options.legacy
        ? null
        : {
            commenced,
            creditedPaise,
            obligationPaise,
            outstandingPaise: Math.max(0, obligationPaise - creditedPaise),
            refundAssessmentPaise: Math.max(0, creditedPaise - obligationPaise),
            pendingReview: !!pending,
            endsOn: commenced
              ? new Date(
                  Date.parse(day() + "T00:00:00Z") + agreement.days * 86400000,
                )
                  .toISOString()
                  .slice(0, 10)
              : null,
          },
      pendingReview: options.legacy ? null : pending,
      canDecide:
        !options.legacy &&
        !["STUDENT", "ADMIN"].includes(role) &&
        !options.supporter,
      canReview: role === "ADMIN",
      credits: options.history
        ? params.has("creditsCursor")
          ? credits
          : []
        : credits,
      creditsNextCursor:
        options.history && !params.has("creditsCursor")
          ? "70000000-0000-4000-8000-000000000911"
          : null,
      reviews: options.history ? [] : reviews,
      reviewsNextCursor: null,
    };
  }
  const checked = (name: string, value: unknown) => {
    const check = validator(name);
    expect(check(value), JSON.stringify(check.errors)).toBe(true);
    return value;
  };
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      uri = new URL(request.url()),
      path = uri.pathname.replace("/api/v1", "");
    if (path === "/auth/session")
      return route.fulfill({
        json: {
          account: {
            id: actor,
            name: "Synthetic Account",
            role,
            verified: true,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (path === "/auth/mfa")
      return route.fulfill({
        json: {
          enabled: true,
          verifiedUntil: new Date(Date.now() + 600000).toISOString(),
          recoveryCodesRemaining: 8,
        },
      });
    if (request.method() === "GET") {
      if (path.startsWith("/tuition-minimums/")) {
        if (denied)
          return route.fulfill({
            status: 403,
            json: {
              code: "FORBIDDEN",
              message: "Arrangement access is unavailable.",
            },
          });
        seenHistory ||= uri.searchParams.has("creditsCursor");
        return route.fulfill({
          json: checked("TuitionMinimumView", view(uri.searchParams)),
        });
      }
      if (path === "/admin/tuition-minimum-reviews")
        return route.fulfill({
          json: checked("TuitionMinimumReviewPage", {
            items: reviews
              .filter(
                (r) =>
                  r.status === (uri.searchParams.get("status") || "PENDING"),
              )
              .map((r) => ({ ...r, kind, resourceId: id })),
            nextCursor: null,
          }),
        });
      return route.fulfill({
        json: {
          items: [],
          children: [],
          placements: [],
          teachers: [],
          metrics: {},
        },
      });
    }
    const body = request.postDataJSON(),
      key = request.headers()["idempotency-key"]!;
    expect(key).toBeTruthy();
    expect(request.headers()["x-csrf-token"]).toBe("synthetic-csrf");
    writes.push({ path, body, key });
    let result = receipts.get(key);
    if (!result) {
      expect(body.expectedVersion).toBe(agreement.version);
      if (path.endsWith("/commencements")) {
        agreement.commencementDate =
          body.action === "WITHDRAW" ? null : body.commencementDate;
        agreement[
          role === "TEACHER" ? "teacherConfirmedAt" : "familyConfirmedAt"
        ] = body.action === "WITHDRAW" ? null : now;
        agreement.version++;
        result = structuredClone(agreement);
      } else if (path.endsWith("/credits")) {
        const credit = {
          id: "50000000-0000-4000-8000-000000000912",
          minimumId,
          proposerId: actor,
          confirmerId: null,
          amountPaise: body.amountPaise,
          paidOn: body.paidOn,
          reference: body.reference,
          status: "PENDING",
          createdAt: now,
          decidedAt: null,
        };
        credits.push(credit);
        agreement.version++;
        result = checked("TuitionCredit", credit);
      } else if (path.includes("/credits/") && path.endsWith("/decisions")) {
        const credit = credits.find((c) => path.includes(c.id));
        credit.status = body.decision === "CONFIRM" ? "CONFIRMED" : "REJECTED";
        credit.confirmerId = actor;
        credit.decidedAt = now;
        agreement.version++;
        result = checked("TuitionCredit", credit);
      } else if (path.startsWith("/admin/")) {
        review.status = "RESOLVED";
        review.reviewerId = actor;
        review.decisionReason = body.reason;
        review.adjustedPaise = body.adjustedPaise;
        review.decidedAt = now;
        agreement.adjustedPaise = body.adjustedPaise;
        agreement.version++;
        result = checked("TuitionMinimumReview", review);
      } else if (path.endsWith("/reviews")) {
        review.requesterId = actor;
        review.reason = body.reason;
        reviews = [review];
        agreement.version++;
        result = checked("TuitionMinimumReview", review);
      } else throw new Error("Unexpected minimum write " + path);
      result = structuredClone(result);
      receipts.set(key, result);
      if (options.lost && !lost) {
        lost = true;
        return route.abort("failed");
      }
      if (options.readFailure) denied = true;
    }
    return route.fulfill({ status: 201, json: result });
  });
  return {
    kind,
    writes,
    view,
    restore: () => {
      denied = false;
    },
    historySeen: () => seenHistory,
  };
}
async function confirm(page: Page, name: string | RegExp) {
  await page
    .getByLabel(
      "I reviewed the date, amount and financial effect of this decision.",
    )
    .check();
  await page
    .getByRole("button", { name, exact: typeof name === "string" })
    .click();
}
async function start(page: Page) {
  await page
    .getByRole("button", { name: "Review commencement", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review decision", exact: true })
    .click();
}
export function tuitionMinimumTests() {
  test("guardian reviews the frozen minimum and confirms an actual start without any class timetable", async ({
    page,
  }) => {
    const f = await fixture(page);
    await page.goto(url());
    await expect(
      page.getByRole("heading", { name: "15-day minimum", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".minimum-balance strong")).toHaveText("₹0.00");
    await start(page);
    await expect(
      page.getByRole("heading", { name: "Review your decision", exact: true }),
    ).toBeFocused();
    await confirm(page, "Confirm teaching commencement");
    await expect(
      page.getByText("Your minimum-tuition decision is recorded.", {
        exact: true,
      }),
    ).toBeVisible();
    expect(f.writes[0].body).toMatchObject({
      expectedVersion: 1,
      action: "CONFIRM",
      confirmed: true,
    });
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: "Withdraw my pending confirmation",
        exact: true,
      }),
    ).toBeEnabled();
    expect(f.view().summary!.obligationPaise).toBe(0);
  });
  test("independent adults use the same financial start while managed learners and adult supporters remain read-only for money", async ({
    page,
  }) => {
    const f = await fixture(page, { role: "INDEPENDENT_STUDENT" });
    await page.goto(url(f.kind));
    await start(page);
    await confirm(page, "Confirm teaching commencement");
    expect(f.writes).toHaveLength(1);
  });
  for (const role of ["STUDENT", "GUARDIAN"])
    test(`${role} delegated learning does not grant financial confirmation`, async ({
      page,
    }) => {
      const f = await fixture(page, {
        role,
        supporter: role === "GUARDIAN",
        active: true,
      });
      await page.goto(url(f.kind));
      await expect(
        page.getByText("You can follow this record.", { exact: false }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Record a payment credit",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", {
          name: "Report safety or non-delivery",
          exact: true,
        }),
      ).toBeEnabled();
      expect(f.writes).toHaveLength(0);
    });
  test("a payment proposal stays pending and does not reduce the minimum until the other financial party confirms", async ({
    page,
  }) => {
    const f = await fixture(page, { active: true });
    await page.goto(url());
    await page
      .getByRole("button", { name: "Record a payment credit", exact: true })
      .click();
    await page
      .getByLabel("Amount credited toward the minimum (INR)")
      .fill("1000");
    await page
      .getByLabel("Receipt label", { exact: true })
      .fill("Synthetic advance payment");
    await page
      .getByRole("button", { name: "Review decision", exact: true })
      .click();
    await confirm(page, "Submit payment for confirmation");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(
      page.getByText("Awaiting other party", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".minimum-balance strong")).toHaveText(
      "₹3,000.00",
    );
    expect(f.writes[0].body.amountPaise).toBe(100000);
    await expect(
      page.getByRole("button", {
        name: "Review received payment",
        exact: true,
      }),
    ).toHaveCount(0);
  });
  test("the teacher reviews an already-paid credit and the confirmed balance decreases", async ({
    page,
  }) => {
    const f = await fixture(page, {
      role: "TEACHER",
      active: true,
      credit: true,
    });
    await page.goto(url());
    await page
      .getByRole("button", { name: "Review received payment", exact: true })
      .click();
    await confirm(page, /^Confirm received payment/);
    await expect(page.locator(".minimum-balance strong")).toHaveText(
      "₹2,000.00",
    );
    expect(f.writes[0].body.decision).toBe("CONFIRM");
  });
  test("an unknown start response retains exactly the same key and body for its retry", async ({
    page,
  }) => {
    const f = await fixture(page, { lost: true });
    await page.goto(url());
    await start(page);
    await confirm(page, "Confirm teaching commencement");
    await expect(
      page.getByRole("button", { name: "Retry same decision", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Cancel decision", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Retry same decision", exact: true })
      .click();
    await expect(
      page.getByText("Your minimum-tuition decision is recorded.", {
        exact: true,
      }),
    ).toBeVisible();
    expect(f.writes).toHaveLength(2);
    expect(f.writes[1]).toEqual(f.writes[0]);
  });
  test("a saved decision survives a denied refresh, hides private terms and reloads without another write", async ({
    page,
  }) => {
    const f = await fixture(page, { readFailure: true });
    await page.goto(url());
    await start(page);
    await confirm(page, "Confirm teaching commencement");
    await expect(
      page.getByText(
        "Your decision was saved, but current details could not be loaded. Refresh before making another decision.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "15-day minimum", exact: true }),
    ).toHaveCount(0);
    f.restore();
    await page
      .getByRole("button", { name: "Reload current terms", exact: true })
      .last()
      .click();
    await expect(
      page.getByRole("heading", { name: "15-day minimum", exact: true }),
    ).toBeVisible();
    expect(f.writes).toHaveLength(1);
  });
  test("a learner can request non-delivery assessment while help stays reachable", async ({
    page,
  }) => {
    const f = await fixture(page, { role: "STUDENT", active: true });
    await page.goto(url());
    await page
      .getByRole("button", {
        name: "Report safety or non-delivery",
        exact: true,
      })
      .click();
    await page
      .getByLabel("What needs staff assessment?")
      .selectOption("NON_DELIVERY");
    await page
      .getByLabel("Describe the concern")
      .fill("Synthetic teacher did not provide the agreed tuition.");
    await page
      .getByRole("button", { name: "Review decision", exact: true })
      .click();
    await confirm(page, "Request staff assessment");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: "Staff assessment pending",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole("link", {
        name: "Help, closure and replacement",
        exact: true,
      }),
    ).toHaveAttribute("href", /support\?placement=/);
    expect(f.writes[0].body.reason).toBe("NON_DELIVERY");
  });
  test("staff can assess the current pending exception even when older history is on another page", async ({
    page,
  }) => {
    const f = await fixture(page, {
      role: "ADMIN",
      active: true,
      pendingReview: true,
      history: true,
    });
    await page.goto(url());
    await page
      .getByRole("button", { name: "Assess minimum tuition", exact: true })
      .click();
    await page.getByLabel("Assessed minimum (INR)").fill("0");
    await page
      .getByLabel("Participant-visible assessment reason")
      .fill(
        "Synthetic evidence reviewed; minimum waived, refund assessed separately.",
      );
    await expect(
      page
        .getByRole("link", { name: "Open linked support case", exact: true })
        .first(),
    ).toHaveAttribute("href", "/support?case=" + caseId);
    await page
      .getByRole("button", { name: "Review decision", exact: true })
      .click();
    await confirm(page, "Record staff assessment");
    await expect(page.locator(".minimum-balance strong")).toHaveText("₹0.00");
    await expect(
      page.getByText("No assessments match this status in your region.", {
        exact: true,
      }),
    ).toBeVisible();
    expect(f.writes[0].body.adjustedPaise).toBe(0);
  });
  test("payment history pagination preserves the current agreement and pending assessment", async ({
    page,
  }) => {
    const f = await fixture(page, {
      role: "TEACHER",
      active: true,
      credit: true,
      history: true,
    });
    await page.goto(url());
    await page
      .getByRole("button", { name: "Next payment credits", exact: true })
      .click();
    await expect(
      page.getByText("Synthetic tuition receipt", { exact: false }),
    ).toBeVisible();
    expect(f.historySeen()).toBe(true);
    await page
      .getByRole("button", { name: "Previous payment credits", exact: true })
      .click();
    await expect(
      page.getByText("No payment credits on this page.", { exact: true }),
    ).toBeVisible();
  });
  for (const variant of ["legacy", "closed", "termsPending", "zero"] as const)
    test(`${variant} agreement shows its boundary without an accidental financial action`, async ({
      page,
    }) => {
      const f = await fixture(page, { [variant]: true });
      await page.goto(url());
      if (variant === "legacy") {
        await expect(
          page.getByText("This arrangement has no agreed minimum.", {
            exact: false,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", {
            name: "Review commencement",
            exact: true,
          }),
        ).toHaveCount(0);
      } else if (variant === "zero") {
        await expect(
          page.getByRole("heading", { name: "No minimum period", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", {
            name: "Record a payment credit",
            exact: true,
          }),
        ).toHaveCount(0);
      } else
        await expect(
          page.getByRole("button", {
            name: "Review commencement",
            exact: true,
          }),
        ).toBeDisabled();
      expect(f.writes).toHaveLength(0);
    });
  for (const width of [320, 360, 390, 430])
    test(`Hindi minimum agreement and credit form fit ${width}px phones`, async ({
      page,
    }) => {
      await chooseHindi(page);
      await page.setViewportSize({ width, height: 850 });
      await fixture(page, { active: true });
      await page.goto(url());
      await checkHindi(page, "न्यूनतम ट्यूशन फ़ीस");
      await page
        .getByRole("button", { name: "भुगतान समायोजन दर्ज करें", exact: true })
        .click();
      await checkHindi(page);
      if (width === 390)
        await page.screenshot({
          path: "test-results/minimum-tuition-hindi-mobile.png",
          fullPage: true,
          style: "nextjs-portal{display:none!important}",
        });
      const results = await new AxeBuilder({ page })
        .disableRules(["color-contrast"])
        .analyze();
      expect(
        results.violations.filter((v) =>
          ["critical", "serious"].includes(v.impact || ""),
        ),
      ).toEqual([]);
    });
  test("English agreement has visible keyboard focus and an accessible reviewed financial form", async ({
    page,
  }) => {
    await fixture(page, { active: true });
    await page.goto(url());
    await page
      .getByRole("button", { name: "Record a payment credit", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Review your decision", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.getByLabel("Payment date", { exact: true }),
    ).toBeFocused();
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await page.screenshot({
      path: "test-results/minimum-tuition-english-desktop.png",
      fullPage: true,
      style: "nextjs-portal{display:none!important}",
    });
  });
  test("Hindi staff financial assessment is clear on a phone and keeps evidence reachable", async ({
    page,
  }) => {
    await chooseHindi(page);
    await page.setViewportSize({ width: 390, height: 850 });
    await fixture(page, { role: "ADMIN", active: true, pendingReview: true });
    await page.goto(url());
    await checkHindi(page, "न्यूनतम ट्यूशन फ़ीस");
    await page
      .getByRole("button", {
        name: "न्यूनतम ट्यूशन फ़ीस का आकलन करें",
        exact: true,
      })
      .click();
    await page.getByLabel("आकलन के अनुसार न्यूनतम फ़ीस (रुपये)").fill("0");
    await page
      .getByLabel("दोनों पक्षों को दिखने वाला आकलन का कारण")
      .fill("सिंथेटिक प्रमाण की समीक्षा की गई; न्यूनतम फ़ीस माफ़ की गई।");
    await checkHindi(page);
    await page.screenshot({
      path: "test-results/minimum-tuition-staff-hindi-mobile.png",
      fullPage: true,
      style: "nextjs-portal{display:none!important}",
    });
    await page
      .getByRole("button", { name: "निर्णय की समीक्षा करें", exact: true })
      .click();
    await page
      .getByLabel(
        "मैंने इस निर्णय की तारीख, राशि और पैसों पर असर की समीक्षा कर ली है।",
      )
      .check();
    await page
      .getByRole("button", { name: "कर्मचारी आकलन दर्ज करें", exact: true })
      .click();
    await expect(page.locator(".minimum-balance strong")).toHaveText("₹0.00");
  });
}
