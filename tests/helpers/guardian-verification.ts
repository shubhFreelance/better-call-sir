import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { validator, operationValidator } from "./contract";
import { checkHindi } from "./hindi";
import { hindiMessages } from "../../apps/web/app/hindi-messages";
const actor = "10000000-0000-4000-8000-000000000911",
  guardian = "10000000-0000-4000-8000-000000000912",
  id = "20000000-0000-4000-8000-000000000911",
  evidenceId = "30000000-0000-4000-8000-000000000911";
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1x8AAAAASUVORK5CYII=",
  "base64",
);
function record(overrides: any = {}) {
  const now = new Date().toISOString();
  return {
    id,
    learnerId: null,
    guardianId: guardian,
    region: "Raipur",
    guardianName: "Synthetic Guardian",
    learnerName: "Synthetic Learner",
    relationship: "PARENT",
    ageBand: "UNDER_15",
    managementMode: "SHARED",
    studentEmail: null,
    studentAccountId: null,
    studentAcknowledgedAt: null,
    acknowledgmentMethod: "STAFF_CALL",
    guardianAcknowledgedAt: now,
    documentNamesGuardian: false,
    currentEvidenceId: null,
    status: "DRAFT",
    reason: null,
    reviewerId: null,
    reviewReference: null,
    reviewedAt: null,
    callMethod: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    evidence: null,
    policyVersion: "guardian-verification-v1",
    ...overrides,
  };
}
async function setup(
  page: Page,
  options: {
    role?: string;
    empty?: boolean;
    uncertain?: boolean;
    readFailure?: boolean;
    history?: boolean;
    mfaPending?: boolean;
    deleted?: boolean;
    status?: string;
  } = {},
) {
  const role = options.role || "GUARDIAN",
    staff = ["ADMIN", "REVIEWER"].includes(role);
  let fail = false,
    aborted = false;
  let row = record({
    guardianId: staff || role === "STUDENT" ? guardian : actor,
    ...(staff
      ? {
          status: "PENDING",
          currentEvidenceId: evidenceId,
          evidence: {
            id: evidenceId,
            status: "CLEAN",
            mediaType: "image/png",
            version: 2,
            uploadedAt: new Date().toISOString(),
          },
        }
      : {}),
    ...(role === "STUDENT"
      ? {
          studentEmail: "student@example.test",
          acknowledgmentMethod: "STUDENT_ACCOUNT",
        }
      : {}),
  });
  if (options.status) row.status = options.status;
  if (options.deleted)
    row = {
      ...row,
      status: "DELETED",
      guardianName: "Deleted guardian",
      learnerName: "Deleted learner",
    };
  let present = !options.empty;
  const writes: { path: string; body: any; key: string }[] = [],
    reads: URL[] = [],
    replays = new Map<string, any>();
  const checked = (schema: string, value: any) => {
    const v = validator(schema);
    expect(v(value), JSON.stringify(v.errors)).toBe(true);
    return value;
  };
  function result() {
    const r = structuredClone(row);
    if (!staff) {
      delete r.reviewReference;
      delete r.reviewerId;
    }
    return checked("GuardianVerification", r);
  }
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      u = new URL(req.url()),
      p = u.pathname;
    if (p.endsWith("/auth/mfa"))
      return route.fulfill({
        json: {
          enabled: true,
          verifiedUntil: options.mfaPending
            ? null
            : new Date(Date.now() + 600000).toISOString(),
          recoveryCodesRemaining: 8,
        },
      });
    if (p.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: actor,
            name:
              role === "STUDENT" ? "Synthetic Student" : "Synthetic Account",
            role,
            verified: false,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (req.method() === "GET") {
      reads.push(u);
      if(p.includes("/guardian-evidence/") && p.endsWith("/content")) return route.fulfill({
        status:!fail&&row.evidence?.status==="CLEAN"?200:403,
        headers:{"Cache-Control":"no-store","Content-Disposition":"attachment; filename=school-report.png"},
        contentType:!fail&&row.evidence?.status==="CLEAN"?"image/png":"application/json",
        body:!fail&&row.evidence?.status==="CLEAN"?image:JSON.stringify({code:"FORBIDDEN",message:"Private document unavailable"})
      });
      if (
        fail &&
        (p.includes("guardian-verifications") ||
          p.endsWith("/guardian-verification-invitations"))
      )
        return route.fulfill({
          status: 403,
          json: {
            code: "FORBIDDEN",
            message: "Synthetic backend private detail",
          },
        });
      if (p.endsWith("/guardian-verification-invitations")) {
        const values =
          role === "STUDENT"
            ? [
                checked("GuardianVerificationInvitation", {
                  id: row.id,
                  guardianName: row.guardianName,
                  learnerName: row.learnerName,
                  relationship: row.relationship,
                  ageBand: row.ageBand,
                  managementMode: row.managementMode,
                  studentAcknowledgedAt: row.studentAcknowledgedAt,
                  version: row.version,
                  status: row.status,
                }),
              ]
            : [];
        return route.fulfill({ json: { items: values, nextCursor: null } });
      }
      if (p.endsWith("/guardian-verifications")) {
        if (
          p.includes("/admin/") &&
          u.searchParams.get("status") &&
          u.searchParams.get("status") !== row.status
        )
          return route.fulfill({ json: { items: [], nextCursor: null } });
        const first = present ? [result()] : [],
          last = record({
            id: "20000000-0000-4000-8000-000000000919",
            guardianId: actor,
            learnerName: "Last history learner",
            status: "REJECTED",
          });
        return route.fulfill({
          json: {
            items:
              options.history && u.searchParams.has("cursor") ? [last] : first,
            nextCursor:
              options.history && !u.searchParams.has("cursor") ? row.id : null,
          },
        });
      }
      if (p.endsWith("/guardian-verifications/" + row.id))
        return route.fulfill({ json: result() });
      if (p.endsWith("/children"))
        return route.fulfill({ json: { items: [] } });
      return route.fulfill({ json: { items: [] } });
    }
    const body = req.postDataJSON(),
      key = req.headers()["idempotency-key"];
    writes.push({ path: p, body, key });
    if (replays.has(key))
      return route.fulfill({ status: 201, json: replays.get(key) });
    let schemaPath = "";
    if (p.endsWith("/guardian-verifications") && !p.includes("/admin/")) {
      checked("GuardianVerificationInput", body);
      row = record({ ...body, guardianId: actor });
      delete row.adultDeclaration;
      delete row.authorityDeclaration;
      delete row.verificationPermission;
      present = true;
      schemaPath = "/guardian-verifications";
    } else if (p.endsWith("/evidence")) {
      expect(body.expectedVersion).toBe(row.version);
      expect(body.mediaType).toBe("image/png");
      expect(Buffer.from(body.contentBase64, "base64")).toEqual(image);
      row = {
        ...row,
        currentEvidenceId: evidenceId,
        evidence: {
          id: evidenceId,
          status: "QUARANTINED",
          mediaType: "image/png",
          version: 1,
          uploadedAt: new Date().toISOString(),
        },
        version: row.version + 1,
      };
      schemaPath = "/guardian-verifications/{id}/evidence";
    } else if (p.includes("/admin/jobs/") && p.endsWith("/retries")) {
      expect(role).toBe("ADMIN");
      expect(body).toMatchObject({expectedAttempts:5,confirmed:true});
      expect(body.reason).toBeTruthy();
      const value={id:row.scanRetry.jobId,status:"PENDING",attempts:0};
      row={...row,scanStatus:"WAITING"};delete row.scanRetry;
      expect(operationValidator("/admin/jobs/{id}/retries","post","201")(value)).toBe(true);
      replays.set(key,value);
      if(options.uncertain&&!aborted){aborted=true;return route.abort("failed");}
      return route.fulfill({status:201,json:value});
    } else if (p.endsWith("/submissions")) {
      expect(body.expectedVersion).toBe(row.version);
      row = { ...row, status: "PENDING", version: row.version + 1 };
      schemaPath = "/guardian-verifications/{id}/submissions";
    } else if (p.endsWith("/student-acknowledgments")) {
      expect(body.expectedVersion).toBe(row.version);
      row = {
        ...row,
        status: body.decision === "DECLINE" ? "REJECTED" : row.status,
        studentAcknowledgedAt:
          body.decision === "DECLINE" ? null : new Date().toISOString(),
        version: row.version + 1,
      };
      const receipt = {
        id: row.id,
        status: body.decision === "DECLINE" ? "REJECTED" : "ACKNOWLEDGED",
      };
      replays.set(key, receipt);
      return route.fulfill({ status: 201, json: receipt });
    } else if (p.endsWith("/decisions")) {
      checked("GuardianVerificationDecision", body);
      expect(body.expectedVersion).toBe(row.version);
      row = {
        ...row,
        status:
          body.decision === "APPROVE"
            ? "APPROVED"
            : body.decision === "REVOKE"
              ? "REVOKED"
              : body.decision === "REJECT"
                ? "REJECTED"
                : "CHANGES_REQUESTED",
        reason: body.reason,
        reviewReference: "review:private-911",
        reviewerId: actor,
        reviewedAt: new Date().toISOString(),
        callMethod: body.callMethod || null,
        studentAcknowledgedAt: body.studentAcknowledgmentObserved
          ? new Date().toISOString()
          : row.studentAcknowledgedAt,
        version: row.version + 1,
      };
      schemaPath = "/admin/guardian-verifications/{id}/decisions";
    } else if (p.endsWith("/cancellations")) {
      row = { ...row, status: "CANCELLED", version: row.version + 1 };
      schemaPath = "/guardian-verifications/{id}/cancellations";
    } else
      return route.fulfill({
        status: 400,
        json: {
          code: "INVALID_FIXTURE",
          message: "Unexpected synthetic request",
        },
      });
    const value = result(),
      v = operationValidator(schemaPath, "post", "201");
    expect(v(value), JSON.stringify(v.errors)).toBe(true);
    replays.set(key, value);
    if (options.uncertain && !aborted) {
      aborted = true;
      return route.abort("failed");
    }
    if (options.readFailure) fail = true;
    return route.fulfill({ status: 201, json: value });
  });
  await page.goto(role === "STUDENT" ? "/guardian-verification?view=student" : "/guardian-verification");
  await expect(
    page.getByRole("heading", {
      name: options.mfaPending
        ? "Protect your staff access."
        : role === "STUDENT" ? "Confirm your guardian" : "Guardian verification",
      exact: true,
    }),
  ).toBeVisible();
  return {
    writes,
    reads,
    recover: () => {
      fail = false;
    },
    state: () => row,
  };
}
async function openOwner(page: Page) {
  await page
    .getByRole("button", { name: "View verification", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your relationship verification",
      exact: true,
    }),
  ).toBeVisible();
}
async function openStaff(page: Page) {
  await page
    .getByRole("button", { name: "Review guardian evidence", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("textbox", {
      name: "Feedback for the guardian",
      exact: true,
    }),
  ).toBeVisible();
}
async function staffFields(page: Page) {
  await page
    .getByRole("checkbox", {
      name: "I independently checked adult status and authority. A matching report name alone is insufficient.",
      exact: true,
    })
    .check();
  await page
    .getByRole("combobox", { name: "Completed call review", exact: true })
    .selectOption("VIDEO");
  await page
    .getByRole("checkbox", {
      name: "I observed the student acknowledgment during this call.",
      exact: true,
    })
    .check();
  await page
    .getByRole("textbox", { name: "Feedback for the guardian", exact: true })
    .fill("Synthetic staff approval");
  await page
    .getByRole("textbox", { name: /^Protected review reference/ })
    .fill("review:synthetic");
  await page
    .getByRole("checkbox", {
      name: "I reviewed this learner, guardian, evidence and the exact decision.",
      exact: true,
    })
    .check();
}
export function guardianVerificationTests() {
  for(const [method,hindi] of [['STUDENT_ACCOUNT',false],['STAFF_CALL',false],['STUDENT_ACCOUNT',true]] as const)test(`pending verification counts the real remaining steps (${method}, ${hindi?'Hindi':'English'})`,async({page})=>{
    const f=await setup(page,{status:'PENDING'});Object.assign(f.state(),{learnerName:'Sumi',acknowledgmentMethod:method});await openOwner(page);if(hindi)await page.getByRole('button',{name:'Switch English and Hindi',exact:true}).click();
    const t=(s:string)=>hindi?hindiMessages[s]||s:s,card=page.locator('.guardian-review-notice');await expect(card.getByRole('heading',{name:t('2 steps remaining'),exact:true})).toBeVisible();await expect(card.locator('[aria-current="step"]')).toContainText(t('Student confirmation'));await expect(card).toContainText(t('Waiting for {0}').replace('{0}','Sumi'));await expect(card).toContainText(t(method==='STUDENT_ACCOUNT'?'Ask your child to sign in with the email in this request and confirm you as their guardian.':'Your child must confirm the relationship during the staff video or phone call.'));
    f.state().studentAcknowledgedAt=new Date().toISOString();f.state().version++;await page.getByRole('button',{name:t('Refresh verification details'),exact:true}).click();await expect(card.getByRole('heading',{name:t('1 step remaining'),exact:true})).toBeVisible();await expect(card.locator('[aria-current="step"]')).toContainText(t('Staff review'));await expect(card.locator('[data-state="complete"]')).toHaveCount(1);await expect(card).toContainText(t('Student confirmation recorded'));await expect(card).toContainText(t('Awaiting staff approval'));
    await page.setViewportSize({width:hindi?320:390,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).include('.guardian-review-notice').analyze()).violations).toEqual([]);await card.screenshot({path:`test-results/guardian-remaining-steps-${method}-${hindi?'hi':'en'}.png`});expect(f.writes).toHaveLength(0);
  });
  for(const [method,hindi] of [["STUDENT_ACCOUNT",false],["STAFF_CALL",false],["STUDENT_ACCOUNT",true]] as const)test(`guardian sees concise student confirmation guidance before approval (${method}, ${hindi?'Hindi':'English'})`,async({page})=>{
    const f=await setup(page,{status:'PENDING'});Object.assign(f.state(),{learnerName:'Sumi',acknowledgmentMethod:method,studentEmail:method==='STUDENT_ACCOUNT'?'sumi@example.test':null});
    if(hindi)await page.getByRole('button',{name:'Switch English and Hindi',exact:true}).click();
    const t=(s:string)=>hindi?hindiMessages[s]||s:s;
    await page.getByRole('button',{name:t('View verification'),exact:true}).first().click();const notice=page.locator('.guardian-student-confirmation-notice');await expect(notice).toContainText(t('Student confirmation required'));const message=method==='STUDENT_ACCOUNT'?'Ask {0} to sign in and confirm you as their guardian before staff approval.':'Before approval, {0} must confirm you as their guardian during the staff call.';await expect(notice).toContainText(t(message).replace('{0}','Sumi'));await page.setViewportSize({width:390,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).include('.guardian-student-confirmation-notice').analyze()).violations).toEqual([]);await notice.screenshot({path:`test-results/guardian-confirmation-notice-${method}-${hindi?'hi':'en'}.png`});
    const guidance=page.locator('.guardian-student-access-options');await expect(guidance.locator('li')).toHaveCount(2);await expect(guidance).toContainText(t('Sign up or sign in'));await expect(guidance).toContainText(t('Invitation code — after approval'));await expect(guidance).toContainText(t('After approval and learner setup, share a student invitation code to link their account. This does not replace relationship confirmation.'));
    f.state().studentAcknowledgedAt=new Date().toISOString();f.state().version++;await page.getByRole('button',{name:t('Refresh verification details'),exact:true}).click();await expect(notice).toHaveCount(0);await expect(guidance).toHaveCount(0);expect(f.writes).toHaveLength(0);
  });
  test('guardian confirmation form explains signup before approval and invitations after setup',async({page})=>{
    const f=await setup(page,{empty:true});await page.getByRole('button',{name:'Start guardian verification',exact:true}).click();
    await page.getByLabel("Guardian's full name",{exact:true}).fill('Synthetic Parent');await page.getByLabel("Learner's name on the school report",{exact:true}).fill('Sumi');
    await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();
    const guidance=page.locator('.guardian-student-access-options');await expect(guidance.locator('li')).toHaveCount(2);await expect(guidance).toContainText('Enter that same email in this request.');await expect(guidance.getByRole('button',{name:'Generate invitation code',exact:true})).toBeDisabled();await expect(guidance.getByRole('link')).toHaveCount(0);
    await page.getByRole('combobox',{name:/How will the student confirm this relationship/}).selectOption('STUDENT_ACCOUNT');await expect(page.getByText("Use your child's own email, even if they still need to sign up. They sign in and confirm or decline this relationship. Do not enter your own email.",{exact:true})).toBeVisible();
    await page.setViewportSize({width:390,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).include('.guardian-student-access-options').analyze()).violations).toEqual([]);expect(f.writes).toHaveLength(0);
  });
  for(const [hasLearner,hindi] of [[true,false],[true,true],[false,false]] as const)test(`guardian invitation navigation uses the approved saved learner (${hasLearner}, ${hindi?'Hindi':'English'})`,async({page})=>{
    const f=await setup(page,{status:'APPROVED'}),learner='20000000-0000-4000-8000-000000000922';Object.assign(f.state(),{learnerId:hasLearner?learner:null,studentAcknowledgedAt:new Date().toISOString()});await openOwner(page);
    if(hindi)await page.getByRole('button',{name:'Switch English and Hindi',exact:true}).click();const t=(s:string)=>hindi?hindiMessages[s]||s:s,guidance=page.locator('.guardian-student-access-options');
    if(hasLearner)await expect(guidance.getByRole('link',{name:t('Generate invitation code'),exact:true})).toHaveAttribute('href',`/dashboard/family?learner=${learner}#student-invitation`);
    else {await expect(guidance.getByRole('button',{name:t('Generate invitation code'),exact:true})).toBeDisabled();await expect(guidance.getByRole('link')).toHaveCount(0);}
    await page.setViewportSize({width:390,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).include('.guardian-student-access-options').analyze()).violations).toEqual([]);expect(f.writes).toHaveLength(0);
  });
  test('student confirmation guidance is visible on the report step before staff submission',async({page})=>{
    const f=await setup(page);Object.assign(f.state(),{learnerName:'Sumi',acknowledgmentMethod:'STUDENT_ACCOUNT',studentEmail:'sumi@example.test'});await openOwner(page);await expect(page.locator('.guardian-student-confirmation-notice')).toContainText('Ask Sumi to sign in');expect(f.writes).toHaveLength(0);
  });
  for(const [width,hindi] of [[1440,false],[360,true]] as const) test(`student guardian relationship uses compact cards (${width}px)`,async({page})=>{
    const f=await setup(page,{role:"STUDENT",status:"PENDING"});if(hindi)await page.getByRole("button",{name:"Switch English and Hindi",exact:true}).click();await page.setViewportSize({width,height:1000});const t=(text:string)=>hindi?hindiMessages[text]||text:text;
    const panel=page.locator(".guardian-acknowledgment"),card=panel.locator(".guardian-relationship-card"),button=card.getByRole("button",{name:t("Review guardian relationship"),exact:true});
    await expect(panel).toHaveCSS("background-color","rgb(255, 255, 255)");await expect(panel.locator("h2")).toHaveCSS("font-size",width>640?"22px":"20px");await expect(card).toHaveCSS("background-color","rgb(255, 255, 235)");await expect(card.locator(".status-badge")).toHaveText(t("Pending staff review"));await expect(card).toContainText("Synthetic Guardian");await expect(card).toContainText("Synthetic Learner");
    const info=await card.locator("div").first().boundingBox(),action=await button.boundingBox();if(width>640)expect(action!.x).toBeGreaterThan(info!.x+info!.width);else expect(action!.y).toBeGreaterThan(info!.y+info!.height);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).include(".guardian-acknowledgment").analyze()).violations).toEqual([]);await panel.screenshot({path:`test-results/guardian-relationship-card-${width}.png`,style:"nextjs-portal{display:none!important}"});
    await button.click();await expect(panel.getByRole("region",{name:t("Review guardian relationship"),exact:true})).toBeVisible();expect(f.writes).toHaveLength(0);
  });

  for(const [width,hindi] of [[1440,false],[390,false],[320,true]] as const) {
    test(`guardian verification overview uses themed cards and tooltips (${width}px)`,async({page})=>{
      const f=await setup(page,{empty:true});if(hindi) await page.getByRole("button",{name:"Switch English and Hindi",exact:true}).click();await page.setViewportSize({width,height:1000});
      const t=(text:string)=>hindi?hindiMessages[text]||text:text,card=page.locator(".guardian-verification-page");
      await expect(card.locator(".page-title")).toHaveCSS("background-color","rgb(3, 79, 70)");
      await expect(card.locator(".guardian-verification-guidance")).toContainText(t("Verify each child separately. Saving education details does not send a verification request."));
      await expect(card.locator(".guardian-verification-steps > li")).toHaveCount(4);
      await expect(card.locator(".guardian-verification-steps")).toHaveCSS("background-color","rgb(238, 245, 243)");
      const info=card.locator(".guardian-verification-title .info-tooltip-trigger");await info.scrollIntoViewIfNeeded();await info.focus();await info.press("Enter");
      await expect(page.getByRole("tooltip")).toContainText(t("Verify your relationship with each child separately. Approval for another child remains valid. Submit this request to send it to staff; saving education details does not submit verification."));await page.keyboard.press("Escape");
      const start=card.getByRole("button",{name:t("Start guardian verification"),exact:true});await expect(start).toHaveCSS("background-color","rgb(240, 215, 255)");await start.hover();await expect(start).toHaveCSS("background-color","rgb(231, 195, 250)");
      if(hindi) await checkHindi(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      const a=await new AxeBuilder({page}).include(".guardian-verification-page").analyze();expect(a.violations.filter(v=>["serious","critical"].includes(v.impact||""))).toEqual([]);
      await card.screenshot({path:`test-results/guardian-verification-overview-${width}.png`,style:"nextjs-portal{display:none!important}"});
      await start.focus();await page.keyboard.press("Enter");await expect(card.locator(".guardian-verification-editor")).toBeVisible();expect(f.writes).toHaveLength(0);
    });
  }
  for(const hindi of [false,true]) test(`guardian review names are enclosed with filter-button actions (${hindi?"Hindi phone":"English desktop"})`,async({page})=>{
    const f=await setup(page,{empty:true});await page.getByRole("button",{name:"Start guardian verification",exact:true}).click();
    await page.getByLabel("Guardian's full name",{exact:true}).fill("Synthetic Parent");await page.getByLabel("Learner's name on the school report",{exact:true}).fill("Synthetic Child");
    await page.getByRole("button",{name:"Continue",exact:true}).click();await page.getByRole("radio",{name:/Guardian and student manage together/}).check();await page.getByRole("button",{name:"Continue",exact:true}).click();
    await page.getByRole("checkbox",{name:"I am an adult authorized to act for this learner, and I acknowledge this guardian relationship.",exact:true}).check();
    await page.getByRole("checkbox",{name:"I permit private review of these relationship details and the school report for verification. This does not grant learning-data consent.",exact:true}).check();
    await page.getByRole("button",{name:"Review relationship details",exact:true}).click();
    if(hindi) await page.getByRole("button",{name:"Switch English and Hindi",exact:true}).click();await page.setViewportSize({width:hindi?320:1440,height:1000});
    const t=(s:string)=>hindi?hindiMessages[s]||s:s,summary=page.locator(".guardian-relationship-review"),actions=page.locator(".guardian-verification-actions");
    await expect(summary.locator("dd")).toHaveText(["Synthetic Parent","Synthetic Child"]);await expect(summary).toHaveCSS("background-color","rgb(255, 255, 235)");
    for(const row of await summary.locator("dl > div").all()) {const alignment=await row.evaluate(el=>({label:el.querySelector("dt")!.getBoundingClientRect().left,name:el.querySelector("dd")!.getBoundingClientRect().left}));expect(Math.abs(alignment.label-alignment.name)).toBeLessThanOrEqual(1);}
    const confirmation=page.locator(".guardian-review-confirmation"),checkbox=confirmation.locator(".care-check");
    await expect(confirmation).toHaveCSS("padding","16px");const box=await checkbox.boundingBox(),buttons=await actions.boundingBox();expect(buttons!.y-box!.y-box!.height).toBeGreaterThanOrEqual(16);
    await expect(actions).toHaveCSS("background-color","rgb(238, 245, 243)");
    const save=actions.getByRole("button",{name:t("Save relationship details"),exact:true}),back=actions.getByRole("button",{name:t("Back to details"),exact:true});
    await expect(save).toBeDisabled();await expect(save).toHaveAttribute("type","submit");await expect(back).toHaveAttribute("type","button");await back.hover();await expect(back).toHaveCSS("background-color","rgb(238, 245, 243)");
    if(hindi) await checkHindi(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const a=await new AxeBuilder({page}).include(".guardian-verification-editor").analyze();expect(a.violations.filter(v=>["serious","critical"].includes(v.impact||""))).toEqual([]);
    await page.locator(".guardian-verification-editor").screenshot({path:`test-results/guardian-review-${hindi?"hi-phone":"en-desktop"}.png`,style:"nextjs-portal{display:none!important}"});
    await back.click();expect(f.writes).toHaveLength(0);await expect(page.getByRole("button",{name:t("Review relationship details"),exact:true})).toBeVisible();
  });
  test("guardian overview request link opens its named verification without a history search",async({page})=>{
    const f=await setup(page,{empty:true});
    await page.goto("/guardian-verification?request="+f.state().id);
    await expect(page.getByRole("heading",{name:"Your relationship verification",exact:true})).toBeVisible();
    await expect(page.locator(".guardian-verification-editor")).toContainText(f.state().learnerName);
  });

  test("staff school report preview sits beside clearance and only scanner-cleared evidence is available",async({page})=>{
    const f=await setup(page,{role:"ADMIN"}); await openStaff(page);
    const download=page.getByRole("button",{name:"See uploaded document",exact:true});
    await expect(download).toHaveCSS("background-color","rgba(0, 0, 0, 0)");
    await expect(download).toHaveCSS("border-top-width","0px");
    await download.hover();await expect(download).toHaveCSS("color","rgb(240, 215, 255)");
    await expect(download).toHaveCSS("background-color","rgba(0, 0, 0, 0)");
    await expect(download).toHaveCSS("border-top-width","0px");
    await expect(download).toHaveCSS("box-shadow","none");
    await expect(page.locator(".evidence-scan-status")).toContainText("Scan cleared");
    expect(f.reads.some(url=>url.pathname.endsWith("/content"))).toBe(false);
    await download.click();const modal=page.getByRole("dialog");await expect(modal.getByRole("img")).toBeVisible();
    expect(await modal.getByRole("img").evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);
    await page.keyboard.press("Escape");await expect(modal).toHaveCount(0);await expect(download).toBeFocused();await expect(page.locator(".document-preview-image")).toHaveCount(0);
    await page.screenshot({path:"test-results/guardian-review-redesign-desktop.png",fullPage:true});
    f.state().evidence.status="QUARANTINED";
    await page.getByRole("button",{name:"Refresh verification details",exact:true}).click();
    await expect(download).toHaveCount(0);
  });
  test("staff queue shows ten requests per page with right-aligned review actions and safe reload",async({page})=>{
    await setup(page,{role:"ADMIN"});
    const rows=Array.from({length:30},(_,index)=>record({id:`20000000-0000-4000-8000-${String(index+100).padStart(12,"0")}`,learnerName:`Queue learner ${index+1}`,guardianName:`Guardian ${index+1}`,status:"PENDING"}));
    const cursors:string[]=[]; let failNext=false;
    await page.route("**/api/v1/admin/guardian-verifications?**",route=>{
      const url=new URL(route.request().url());expect(url.searchParams.get("limit")).toBe("10");
      const cursor=url.searchParams.get("cursor");if(cursor)cursors.push(cursor);
      if(cursor&&failNext)return route.fulfill({status:503,json:{code:"UNAVAILABLE",message:"Unavailable"}});
      const start=cursor?rows.findIndex(r=>r.id===cursor)+1:0;
      const items=url.searchParams.get("status")==="APPROVED"?[]:rows.slice(start,start+10);
      return route.fulfill({json:{items,nextCursor:items.length&&start+10<rows.length?items.at(-1)!.id:null}});
    });
    const pagination=page.getByRole("navigation",{name:"Guardian review queue",exact:true});
    await pagination.getByRole("button",{name:"Reload history",exact:true}).click();
    const list=page.locator(".guardian-queue-list"), next=pagination.getByRole("button",{name:"Next page",exact:true}),previous=pagination.getByRole("button",{name:"Previous page",exact:true});
    await expect(list.locator("article")).toHaveCount(10);await expect(previous).toBeDisabled();
    const row=list.locator("article").first(), name=await row.locator("h3").boundingBox(),button=await row.getByRole("button").boundingBox();expect(button!.x).toBeGreaterThan(name!.x+name!.width);
    await page.screenshot({path:"test-results/guardian-queue-desktop.png",fullPage:true});
    await next.click();await expect(list).toContainText("Queue learner 11");await expect(list.locator("article")).toHaveCount(10);await expect(list.getByRole("heading",{name:"Queue learner 1",exact:true})).toHaveCount(0);
    await next.click();await expect(list).toContainText("Queue learner 30");await expect(list.locator("article")).toHaveCount(10);await expect(next).toBeDisabled();
    await previous.click();await expect(list).toContainText("Queue learner 11");expect(cursors).toHaveLength(2);
    await page.getByRole("combobox",{name:"Verification queue status",exact:true}).selectOption("APPROVED");await expect(list.locator("article")).toHaveCount(0);await expect(pagination).toContainText("Page 1");
    await page.getByRole("combobox",{name:"Verification queue status",exact:true}).selectOption("PENDING");await pagination.getByRole("button",{name:"Reload history",exact:true}).click();
    failNext=true;await next.click();await expect(page.locator(".guardian-staff-queue").getByRole("alert")).toContainText("Verification records could not be loaded.");await expect(list).toHaveCount(0);
    failNext=false;await pagination.getByRole("button",{name:"Reload history",exact:true}).click();await expect(list.locator("article")).toHaveCount(10);
    await page.getByRole("button",{name:"Switch English and Hindi"}).click();await page.setViewportSize({width:320,height:800});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect((await new AxeBuilder({page}).include(".guardian-staff-queue").analyze()).violations.filter(v=>["serious","critical"].includes(v.impact||""))).toEqual([]);
    await page.screenshot({path:"test-results/guardian-queue-hindi-phone.png",fullPage:true});
  });

  for(const hindi of [false,true]) test(`guardian document modal preserves private preview and keyboard focus (${hindi?"Hindi phone":"English desktop"})`,async({page})=>{
    const f=await setup(page);f.state().evidence={id:evidenceId,status:"CLEAN",mediaType:"image/png",version:1,uploadedAt:new Date().toISOString()};f.state().currentEvidenceId=evidenceId;
    if(hindi) await page.getByRole("button",{name:"Switch English and Hindi",exact:true}).click();await page.setViewportSize({width:hindi?320:1440,height:1000});
    const t=(s:string)=>hindi?hindiMessages[s]||s:s;await page.getByRole("button",{name:t("View verification"),exact:true}).first().click();
    const eye=page.getByRole("button",{name:t("See uploaded document"),exact:true});await eye.hover();await expect(eye).toHaveCSS("color","rgb(240, 215, 255)");
    expect(f.reads.some(url=>url.pathname.endsWith("/content"))).toBe(false);let downloads=0;page.on("download",()=>downloads++);
    await eye.click();const modal=page.getByRole("dialog");await expect(modal).toHaveAccessibleName(t("School report for {0}").replace("{0}",f.state().learnerName));
    const report=modal.getByRole("img");await expect(report).toBeVisible();expect(await report.evaluate((el:HTMLImageElement)=>el.naturalWidth>0)).toBe(true);
    await expect(modal.getByRole("button",{name:t("Close"),exact:true})).toBeFocused();await page.keyboard.press("Tab");expect(await modal.evaluate(el=>el.contains(document.activeElement))).toBe(true);
    expect(await page.evaluate(()=>document.body.style.overflow)).toBe("hidden");
    const a=await new AxeBuilder({page}).include(".app-modal").analyze();expect(a.violations.filter(v=>["serious","critical"].includes(v.impact||""))).toEqual([]);
    const box=(await modal.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(hindi?320:1440);
    await modal.screenshot({path:`test-results/guardian-document-${hindi?"hi-phone":"en-desktop"}.png`,style:"nextjs-portal{display:none!important}"});
    await modal.getByRole("button",{name:t("Close"),exact:true}).click();await expect(modal).toHaveCount(0);await expect(eye).toBeFocused();await expect(page.locator(".document-preview-image")).toHaveCount(0);expect(await page.evaluate(()=>document.body.style.overflow)).toBe("");
    await eye.click();await expect(page.getByRole("dialog").getByRole("img")).toBeVisible();await page.mouse.click(1,1);await expect(page.getByRole("dialog")).toHaveCount(0);expect(downloads).toBe(0);expect(f.reads.filter(url=>url.pathname.endsWith("/content")).length).toBe(2);
  });
  test("document preview shows denied reads and retries without exposing stale evidence",async({page})=>{
    const f=await setup(page,{role:"ADMIN"});await openStaff(page);let denied=true;
    await page.route("**/api/v1/guardian-evidence/*/content*",route=>denied?route.fulfill({status:403,contentType:"application/json",headers:{"Cache-Control":"no-store"},body:JSON.stringify({code:"FORBIDDEN",message:"Private detail must not render"})}):route.fulfill({contentType:"image/png",headers:{"Cache-Control":"no-store"},body:image}));
    await page.getByRole("button",{name:"See uploaded document",exact:true}).click();const modal=page.getByRole("dialog");await expect(modal.getByRole("alert")).toContainText("The document could not be loaded");await expect(modal).not.toContainText("Private detail must not render");await expect(modal.locator("img")).toHaveCount(0);
    denied=false;await modal.getByRole("button",{name:"Retry",exact:true}).click();await expect(modal.getByRole("img")).toBeVisible();await page.keyboard.press("Escape");await expect(page.locator(".document-preview-image")).toHaveCount(0);
    f.state().evidence.status="QUARANTINED";await page.getByRole("button",{name:"Refresh verification details",exact:true}).click();await expect(page.getByRole("button",{name:"See uploaded document",exact:true})).toHaveCount(0);
  });
  test("approved guardian completes consent and student education on the verification page", async ({page}) => {
    const f=await setup(page); f.state().status="APPROVED";
    let consent=false, saved=false;
    const profile={id:"20000000-0000-4000-8000-000000000981",alias:f.state().learnerName,version:1,enquiryEligible:true,education:{stage:"SCHOOL",grade:8,board:"CBSE",institutionName:"Synthetic School",subjects:["Maths"]}};
    await page.route("**/api/v1/onboarding/guardian",route=>route.fulfill({json:{gate:consent?"READY":"CONSENT_REQUIRED",learnerCount:saved?1:0,enquiryStatus:"NONE"}}));
    await page.route("**/api/v1/consents",route=>{consent=true;return route.fulfill({status:201,json:{accepted:true}});});
    await page.route("**/api/v1/learner-profiles**",route=>{
      if(route.request().method()==="POST"){expect(route.request().postDataJSON().alias).toBe(profile.alias);saved=true;f.state().learnerId=profile.id;return route.fulfill({status:201,json:profile});}
      return route.fulfill({json:new URL(route.request().url()).pathname.endsWith(profile.id)?profile:{creationStatus:"READY",items:saved?[profile]:[],nextCursor:null}});
    });
    let issued=false;
    await page.route("**/api/v1/children/*/invitation",route=>route.fulfill({json:{state:issued?"ACTIVE":"NONE",expiresAt:issued?new Date(Date.now()+86400000).toISOString():null,childVersion:issued?2:1}}));
    await page.route("**/api/v1/children/*/invitation-replacements",route=>{
      expect(route.request().postDataJSON()).toEqual({expectedVersion:1,acknowledged:true});issued=true;
      return route.fulfill({status:201,json:{status:"ISSUED",token:"synthetic-invitation-code",expiresAt:new Date(Date.now()+86400000).toISOString(),childVersion:2}});
    });
    await openOwner(page);
    await page.getByRole("checkbox",{name:/I am the learner’s parent or lawful guardian/}).check();
    await page.getByRole("button",{name:"Agree and continue",exact:true}).click();
    await expect(page.getByLabel("Learner name or alias",{exact:true})).toHaveValue(profile.alias);
    await page.getByLabel("School / institution name",{exact:true}).fill("Synthetic School");
    await page.getByLabel("Class",{exact:true}).selectOption("8");
    await page.getByLabel("School board",{exact:true}).fill("CBSE");
    await page.getByLabel("Subjects studied",{exact:true}).fill("Maths");
    await page.getByRole("button",{name:"Review learner profile",exact:true}).click();
    await page.getByRole("button",{name:"Confirm and save profile",exact:true}).click();
    await expect(page.getByText(profile.alias+"’s profile is saved.",{exact:true})).toBeVisible();
    await expect(page).toHaveURL(/guardian-verification$/);
    expect(consent&&saved).toBe(true);
    await page.getByRole("button",{name:"Create first student invitation",exact:true}).click();
    await page.getByRole("checkbox",{name:/I am the learner’s guardian and will authorize only the intended student device/}).check();
    await page.getByRole("button",{name:"Create invitation",exact:true}).click();
    const invite=page.locator(".invitation-recovery"), reveal=invite.getByRole("button",{name:"Reveal invitation code",exact:true}), onboarding=invite.getByRole("link",{name:"Open student onboarding",exact:true});
    await expect(reveal).toHaveCSS("background-color","rgb(240, 215, 255)");
    expect((await reveal.boundingBox())!.width).toBe((await onboarding.boundingBox())!.width);
    await page.emulateMedia({reducedMotion:"reduce"});await expect(reveal).toHaveCSS("animation-name","none");
    await page.setViewportSize({width:390,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const accessibility=await new AxeBuilder({page}).include(".invitation-recovery").analyze();expect(accessibility.violations.filter(v=>["serious","critical"].includes(v.impact||""))).toEqual([]);
    await invite.screenshot({path:"test-results/invitation-redesign-phone.png"});
    await page.getByRole("button",{name:"Reveal invitation code",exact:true}).click();
    await expect(page.getByLabel("Private invitation code",{exact:true})).toHaveValue("synthetic-invitation-code");
    await expect(page).toHaveURL(/guardian-verification$/);
    await page.getByRole("button",{name:"Hide invitation code",exact:true}).click();
    await page.screenshot({path:"test-results/guardian-inline-student-setup.png",fullPage:true});
  });

  test("guardian worksheet has padded sections and keeps empty history out of initial setup", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1050 });
    await setup(page, { empty: true });
    await expect(
      page.getByRole("group", {
        name: "Guardian verification history",
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Start guardian verification", exact: true })
      .click();
    const editor = page.locator(".guardian-verification-editor");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(editor.locator('[aria-current="step"]')).toHaveText(
      /Relationship details/,
    );
    const geometry = await editor.evaluate((el) => ({
      padding: getComputedStyle(el).paddingLeft,
      border: getComputedStyle(el).borderLeftWidth,
    }));
    expect(geometry).toEqual({ padding: "32px", border: "2px" });
    await expect(
      page
        .getByRole("list", { name: "Guardian verification steps", exact: true })
        .getByRole("listitem"),
    ).toHaveCount(6);
    const steps=editor.locator('.step-progress');
    await expect(steps).toHaveCSS('background-color','rgb(238, 245, 243)');
    await expect(steps.locator('[aria-current=step]')).toHaveCSS('background-color','rgb(240, 215, 255)');
    await expect(steps.getByRole('button')).toHaveCount(0);
    await steps.screenshot({path:'test-results/guardian-step-progress-desktop.png'});
    await expect(editor.getByRole("radio")).toHaveCount(0);
    await expect(editor.locator('[aria-current="step"]')).toHaveText(
      /Relationship details/,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(
      editor.locator('[aria-current="step"] .step-progress-marker'),
    ).toHaveCSS("animation-name", "none");
    await editor.focus();
    await page.evaluate(() => document.fonts.ready);
    await page.locator("main").first().screenshot({
      path: "test-results/guardian-verification-redesign-en-desktop.png",
    });
    await page.setViewportSize({ width: 360, height: 850 });
    await expect(editor).toHaveCSS("padding-left", "20px");
    expect(await steps.evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(' ').length)).toBe(2);
    await steps.screenshot({path:'test-results/guardian-step-progress-phone.png'});
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const a = await new AxeBuilder({ page })
      .include(".guardian-requests")
      .analyze();
    expect(
      a.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
  });

  for (const [status, label] of [
    ["PENDING", "Staff review"],
    ["APPROVED", "Student setup"],
    ["REJECTED", null],
    ["CHANGES_REQUESTED", "Report and confirmation"],
  ] as const) {
    test(`verification tracker follows server status ${status} without inventing completion`, async ({
      page,
    }) => {
      await setup(page, { status });
      await openOwner(page);
      const current = page.locator(
        '.verification-progress [aria-current="step"]',
      );
      await expect(page.locator('.verification-summary-card .learning-management-badge')).toBeVisible();
      await expect(page.locator('.guardian-management-summary')).toHaveCount(0);
      if (status === "PENDING") {
        await expect(page.locator('.guardian-review-notice')).toHaveCSS("background-color","rgb(248, 237, 255)");
        for(const description of await page.locator('.guardian-review-notice p').all())await expect(description).toHaveCSS("font-size","12px");
        await expect(page.locator('.guardian-verification-actions .filter-button').filter({hasText:"Cancel verification request"})).toBeVisible();
      }
      if (label) await expect(current).toHaveText(new RegExp(label));
      else {
        await expect(current).toHaveCount(0);
        await expect(
          page.getByText("This request is closed. Check its status below."),
        ).toBeVisible();
        await expect(
          page.locator('.verification-progress [data-state="complete"]'),
        ).toHaveCount(0);
      }
    });
  }

  test("erased relationship history has localized tombstones and no image or mutation controls", async ({
    page,
  }) => {
    await setup(page, { deleted: true });
    await openOwner(page);
    await page
      .getByRole("button", { name: "Switch English and Hindi", exact: true })
      .click();
    await checkHindi(page);
    await expect(
      page.getByRole("button", {
        name: hindiMessages["Upload school report"],
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: hindiMessages["See uploaded document"],
        exact: true,
      }),
    ).toHaveCount(0);
  });

  test("staff authenticator verification precedes every guardian review query", async ({
    page,
  }) => {
    const f = await setup(page, { role: "ADMIN", mfaPending: true });
    expect(
      f.reads.filter((u) => u.pathname.includes("guardian-verifications")),
    ).toHaveLength(0);
    await expect(
      page.getByRole("heading", {
        name: "Review the relationship behind the account.",
        exact: true,
      }),
    ).toHaveCount(0);
  });
  for (const role of ["STUDENT", "ADMIN"])
    test(
      role.toLowerCase() +
        " relationship review is fully Hindi and accessible on phones",
      async ({ page }) => {
        await setup(page, { role });
        if (role === "ADMIN") await openStaff(page);
        else
          await page
            .getByRole("button", {
              name: "Review guardian relationship",
              exact: true,
            })
            .click();
        await page
          .getByRole("button", {
            name: "Switch English and Hindi",
            exact: true,
          })
          .click();
        await page.setViewportSize({ width: 360, height: 900 });
        await checkHindi(page);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const scan = await new AxeBuilder({ page })
          .include(".guardian-verification-workspace")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        expect(
          scan.violations.filter((v) =>
            ["serious", "critical"].includes(v.impact || ""),
          ),
        ).toEqual([]);
        await page
          .locator(
            role === "ADMIN"
              ? ".guardian-verification-editor"
              : ".guardian-acknowledgment",
          )
          .screenshot({
            path: `test-results/guardian-${role.toLowerCase()}-hindi-mobile.png`,
          });
      },
    );

  test("guardian reviews the learner, management choice and separate verification permission before creating a request", async ({
    page,
  }) => {
    const f = await setup(page, { empty: true });
    await page
      .getByRole("button", { name: "Start guardian verification", exact: true })
      .click();
    await page
      .getByLabel("Guardian's full name", { exact: true })
      .fill("Synthetic Parent");
    await page
      .getByLabel("Learner's name on the school report", { exact: true })
      .fill("Synthetic Child");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.locator('.verification-progress [aria-current="step"]'),
    ).toHaveText(/Learning choices/);
    await page
      .getByRole("radio", { name: /Guardian and student manage together/ })
      .check();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(
      page.getByLabel("Guardian's full name", { exact: true }),
    ).toHaveValue("Synthetic Parent");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByRole("radio", { name: /Guardian and student manage together/ }),
    ).toBeChecked();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.locator('.verification-progress [aria-current="step"]'),
    ).toHaveText(/Student confirmation/);
    await page
      .getByRole("checkbox", {
        name: "I am an adult authorized to act for this learner, and I acknowledge this guardian relationship.",
        exact: true,
      })
      .check();
    await page
      .getByRole("checkbox", {
        name: "I permit private review of these relationship details and the school report for verification. This does not grant learning-data consent.",
        exact: true,
      })
      .check();
    await page
      .getByRole("button", { name: "Review relationship details", exact: true })
      .click();
    expect(f.writes).toHaveLength(0);
    await expect(page.locator(".guardian-relationship-review dd")).toHaveText(["Synthetic Parent","Synthetic Child"]);
    await page
      .getByRole("checkbox", {
        name: "I reviewed the names, management choice and verification permission.",
        exact: true,
      })
      .check();
    await page
      .getByRole("button", { name: "Back to details", exact: true })
      .click();
    expect(f.writes).toHaveLength(0);
    await page
      .getByRole("button", { name: "Review relationship details", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Save relationship details",
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole("checkbox", {
        name: "I reviewed the names, management choice and verification permission.",
        exact: true,
      })
      .check();
    await page
      .getByRole("button", { name: "Save relationship details", exact: true })
      .click();
    await expect(
      page.getByText("Relationship details saved for verification."),
    ).toBeVisible();
    expect(f.writes).toHaveLength(1);
    await expect(
      page.locator('.verification-progress [aria-current="step"]'),
    ).toHaveText(/Report and confirmation/);
    expect(f.writes[0].body.managementMode).toBe("SHARED");
    expect(f.writes[0].body.verificationPermission).toBe(true);
    expect(f.writes[0].body).not.toHaveProperty("learningConsent");
    await expect(
      page.getByRole("heading", {
        name: "Upload the school report",
        exact: true,
      }),
    ).toBeVisible();
  });
  test("uploaded report refreshes from quarantine to downloadable without re-upload or submission",async({page})=>{
    const f=await setup(page);await openOwner(page);
    await page.getByLabel("School marksheet or performance-card image",{exact:true}).setInputFiles({name:"report.png",mimeType:"image/png",buffer:image});
    await page.getByRole("button",{name:"Upload school report",exact:true}).click();
    await expect(page.getByText("Scan pending",{exact:true})).toBeVisible();
    await expect(page.getByRole("button",{name:"See uploaded document",exact:true})).toHaveCount(0);
    f.state().evidence.status="CLEAN";f.state().evidence.version++;f.state().scanStatus="CLEARED";
    await expect(page.getByRole("button",{name:"See uploaded document",exact:true})).toBeVisible({timeout:10000});
    expect(f.writes).toHaveLength(1);expect(f.state().status).toBe("DRAFT");
    await expect(page.getByRole("button",{name:"Refresh verification details",exact:true})).toBeVisible();
  });
  test("admin reviews an exhausted scan retry, preserves an exact uncertain retry and gets the report only after scanner clearance",async({page})=>{
    const f=await setup(page,{role:"ADMIN",uncertain:true});
    f.state().evidence.status="QUARANTINED";f.state().scanStatus="RETRY_REQUIRED";f.state().scanRetry={jobId:"40000000-0000-4000-8000-000000000911",expectedAttempts:5};
    await openStaff(page);
    await expect(page.getByText("Safety scan needs recovery",{exact:true})).toBeVisible();
    await expect(page.getByRole("button",{name:"See uploaded document",exact:true})).toHaveCount(0);
    await expect(page.getByRole("button",{name:"Record verification decision",exact:true})).toBeDisabled();
    await page.getByRole("button",{name:"Review scan retry",exact:true}).click();
    await expect(page.getByRole("button",{name:"Retry safety scan",exact:true})).toBeDisabled();
    await page.getByLabel("Reason for scan retry",{exact:true}).fill("Scanner connectivity repaired");
    await page.getByRole("checkbox",{name:"I checked the scanner and worker and want to retry this file's safety scan.",exact:true}).check();
    await page.getByRole("button",{name:"Retry safety scan",exact:true}).click();
    await page.getByRole("button",{name:"Retry same decision",exact:true}).click();
    await expect(page.getByText("Safety scan queued again. The report stays blocked until the scanner clears it.",{exact:true})).toBeVisible();
    expect(f.writes).toHaveLength(2);expect(f.writes[0]).toEqual(f.writes[1]);
    await expect(page.getByRole("button",{name:"See uploaded document",exact:true})).toHaveCount(0);
    f.state().evidence.status="CLEAN";f.state().evidence.version++;f.state().scanStatus="CLEARED";
    await expect(page.getByRole("button",{name:"See uploaded document",exact:true})).toBeVisible({timeout:10000});
    await expect(page.getByRole("button",{name:"Record verification decision",exact:true})).toBeDisabled();
  });
  test("stale scan retry unlocks an explicit status refresh without repeating the mutation",async({page})=>{
    const f=await setup(page,{role:"ADMIN"});f.state().evidence.status="QUARANTINED";f.state().scanStatus="RETRY_REQUIRED";f.state().scanRetry={jobId:"40000000-0000-4000-8000-000000000911",expectedAttempts:5};let writes=0;
    await page.route("**/api/v1/admin/jobs/*/retries",route=>{writes++;f.state().scanStatus="WAITING";delete f.state().scanRetry;return route.fulfill({status:409,json:{code:"CONFLICT",message:"The scan job changed. Reload before retrying."}});});
    await openStaff(page);await page.getByRole("button",{name:"Review scan retry",exact:true}).click();await page.getByLabel("Reason for scan retry",{exact:true}).fill("Scanner connection checked");await page.getByRole("checkbox",{name:"I checked the scanner and worker and want to retry this file's safety scan.",exact:true}).check();await page.getByRole("button",{name:"Retry safety scan",exact:true}).click();
    await page.getByRole("button",{name:"Refresh verification details",exact:true}).click();await expect(page.getByText("Scan pending",{exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Review scan retry",exact:true})).toHaveCount(0);expect(writes).toBe(1);
  });
  test("Hindi scan retry form is accessible on a narrow phone and queues only the reviewed scan",async({page})=>{
    const f=await setup(page,{role:"ADMIN"});f.state().evidence.status="QUARANTINED";f.state().scanStatus="RETRY_REQUIRED";f.state().scanRetry={jobId:"40000000-0000-4000-8000-000000000911",expectedAttempts:5};await openStaff(page);
    await page.getByRole("button",{name:"Switch English and Hindi",exact:true}).click();await page.setViewportSize({width:320,height:900});
    await page.getByRole("button",{name:hindiMessages["Review scan retry"],exact:true}).click();
    await page.getByLabel(hindiMessages["Reason for scan retry"],{exact:true}).fill("स्कैनर की कनेक्टिविटी ठीक की गई");
    await page.getByRole("checkbox",{name:hindiMessages["I checked the scanner and worker and want to retry this file's safety scan."],exact:true}).check();
    await checkHindi(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await page.getByRole("textbox",{name:hindiMessages["Reason for scan retry"],exact:true}).boundingBox())!.width).toBeGreaterThanOrEqual(150);
    const axe=await new AxeBuilder({page}).include(".guardian-verification-editor").analyze();expect(axe.violations.filter(v=>["serious","critical"].includes(v.impact||""))).toEqual([]);
    await page.locator(".guardian-verification-editor").screenshot({path:"test-results/guardian-scan-retry-hi-phone.png"});
    await page.getByRole("button",{name:hindiMessages["Retry safety scan"],exact:true}).click();
    await expect(page.getByText(hindiMessages["Safety scan queued again. The report stays blocked until the scanner clears it."],{exact:true})).toBeVisible();expect(f.writes).toHaveLength(1);expect(f.state().evidence.status).toBe("QUARANTINED");
  });
  test("reviewer sees failed scan guidance without an administrator retry action",async({page})=>{
    const f=await setup(page,{role:"REVIEWER"});f.state().evidence.status="QUARANTINED";f.state().scanStatus="RETRY_REQUIRED";await openStaff(page);
    await expect(page.getByText("Safety scan needs recovery",{exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Review scan retry",exact:true})).toHaveCount(0);
    await expect(page.getByRole("button",{name:"See uploaded document",exact:true})).toHaveCount(0);
    await expect(page.getByRole("button",{name:"Record verification decision",exact:true})).toBeDisabled();
  });
  test("upload progress stays visible and confirmation floats above the scrolled card", async ({page}) => {
    await setup(page); await openOwner(page);
    await page.setViewportSize({width:390,height:720});
    await page.getByLabel("School marksheet or performance-card image",{exact:true}).setInputFiles({name:"report.png",mimeType:"image/png",buffer:image});
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/guardian-verifications/*/evidence",async route => { await gate; await route.fallback(); });
    await page.getByRole("button",{name:"Upload school report",exact:true}).click();
    await expect(page.getByText("Uploading document…",{exact:true})).toBeVisible();
    await expect(page.locator(".guardian-report-upload")).toHaveAttribute("aria-busy","true");
    await expect(page.getByRole("button",{name:"Upload school report",exact:true})).toBeDisabled();
    await expect(page.locator('.guardian-verification-actions .filter-button')).toHaveCount(2);
    await page.locator(".guardian-report-upload").screenshot({path:"test-results/guardian-upload-progress.png"});
    await page.clock.install();
    release();
    const toast=page.locator(".action-toast");
    await expect(toast).toContainText("School report uploaded privately. Scan clearance is still required.");
    await expect(toast.locator("p")).toHaveCSS("color","rgb(252, 254, 235)");
    await expect(page.locator(".report-upload-progress")).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0,document.body.scrollHeight));
    const box=await toast.boundingBox(); expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y+box!.height).toBeLessThan(720); expect(box!.x+box!.width).toBeLessThanOrEqual(390);
    await page.screenshot({path:"test-results/guardian-upload-toast.png"});
    expect((await new AxeBuilder({page}).include(".action-toast").analyze()).violations.filter(v=>["serious","critical"].includes(v.impact||""))).toEqual([]);
    await page.clock.fastForward(5000); await expect(toast).toHaveCount(0);
  });
  test("school reports validate type, stay private in quarantine and submit only the recorded current version", async ({
    page,
  }) => {
    const f = await setup(page);
    await openOwner(page);
    const input = page.getByLabel(
      "School marksheet or performance-card image",
      { exact: true },
    );
    await input.setInputFiles({
      name: "not-an-image.html",
      mimeType: "text/html",
      buffer: Buffer.from("bad"),
    });
    await expect(
      page.getByText("Choose a PNG or JPEG image of at most 5 MiB."),
    ).toBeVisible();
    expect(f.writes).toHaveLength(0);
    await input.setInputFiles({
      name: "school-report.png",
      mimeType: "image/png",
      buffer: image,
    });
    await page
      .getByRole("button", { name: "Upload school report", exact: true })
      .click();
    await expect(page.getByText("Scan pending", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "See uploaded document" }),
    ).toHaveCount(0);
    await page
      .getByRole("checkbox", {
        name: "Send this relationship and its current report to staff for review.",
        exact: true,
      })
      .check();
    await page
      .getByRole("button", { name: "Send for staff review", exact: true })
      .click();
    await expect(
      page.getByText(
        "Verification submitted. Follow acknowledgment, scan and staff-review progress here.",
      ),
    ).toBeVisible();
    expect(f.writes.map((x) => x.body.expectedVersion)).toEqual([1, 2]);
    expect(f.state().status).toBe("PENDING");
  });
  for (const action of ["ACKNOWLEDGE", "DECLINE"])
    test(
      "student " +
        action.toLowerCase() +
        " records the visible guardian and management choice without granting learning consent",
      async ({ page }) => {
        const f = await setup(page, { role: "STUDENT" });
        await page
          .getByRole("button", {
            name: "Review guardian relationship",
            exact: true,
          })
          .click();
        await expect(
          page.getByText("Guardian and student manage together", {
            exact: true,
          }),
        ).toBeVisible();
        await page
          .getByRole("combobox", { name: "Your decision", exact: true })
          .selectOption(action);
        await page
          .getByRole("checkbox", {
            name: "I reviewed this person, the management choice and my decision.",
            exact: true,
          })
          .check();
        await page
          .getByRole("button", {
            name: "Confirm relationship decision",
            exact: true,
          })
          .click();
        await expect(
          page.getByText(
            action === "DECLINE"
              ? "Guardian relationship declined."
              : "Guardian relationship acknowledgment recorded.",
            { exact: true },
          ),
        ).toBeVisible();
        expect(f.writes).toHaveLength(1);
        expect(f.writes[0].body).toEqual({
          expectedVersion: 1,
          decision: action,
          confirmed: true,
        });
        await expect(
          page.getByRole("button", {
            name: "Confirm relationship decision",
            exact: true,
          }),
        ).toHaveCount(0);
      },
    );
  test("staff approval stays blocked until missing-name call review, adult authority and observed acknowledgment are recorded", async ({
    page,
  }) => {
    const f = await setup(page, { role: "REVIEWER" });
    await openStaff(page);
    const approve = page.getByRole("button", {
      name: "Record verification decision",
      exact: true,
    });
    await expect(approve).toBeDisabled();
    await page
      .getByRole("textbox", { name: "Feedback for the guardian", exact: true })
      .fill("Synthetic review");
    await page
      .getByRole("textbox", { name: /^Protected review reference/ })
      .fill("private:record");
    await page
      .getByRole("checkbox", {
        name: "I reviewed this learner, guardian, evidence and the exact decision.",
        exact: true,
      })
      .check();
    await expect(approve).toBeDisabled();
    await staffFields(page);
    await approve.click();
    await expect(
      page.getByText("Guardian verification review recorded."),
    ).toBeVisible();
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0].body.callMethod).toBe("VIDEO");
    expect(f.writes[0].body.adultAndAuthorityChecked).toBe(true);
    expect(f.state().status).toBe("APPROVED");
  });
  for (const hindi of [false, true])
    test(`student-account approval explains the remaining acknowledgment even after all staff fields are filled (${hindi ? "Hindi phone" : "English"})`, async ({
      page,
    }) => {
      const f = await setup(page, { role: "ADMIN" });
      Object.assign(f.state(), {
        acknowledgmentMethod: "STUDENT_ACCOUNT",
        studentEmail: "student@example.test",
        documentNamesGuardian: true,
      });
      if (hindi) {
        await page
          .getByRole("button", {
            name: "Switch English and Hindi",
            exact: true,
          })
          .click();
        await checkHindi(page);
        await page.setViewportSize({ width: 320, height: 900 });
      }
      const text = (value: string) => (hindi ? hindiMessages[value] : value);
      await page
        .getByRole("button", {
          name: text("Review guardian evidence"),
          exact: true,
        })
        .first()
        .click();
      await page
        .getByRole("checkbox", {
          name: text(
            "I independently checked adult status and authority. A matching report name alone is insufficient.",
          ),
          exact: true,
        })
        .check();
      await page
        .getByRole("checkbox", {
          name: text(
            "The clean report names this guardian and matches this learner.",
          ),
          exact: true,
        })
        .check();
      await page
        .getByRole("combobox", {
          name: text("Completed call review"),
          exact: true,
        })
        .selectOption("VIDEO");
      await page
        .getByRole("textbox", {
          name: text("Feedback for the guardian"),
          exact: true,
        })
        .fill("Synthetic review");
      await page
        .getByRole("textbox", {
          name: text("Protected review reference"),
          exact: true,
        })
        .fill("private:synthetic-review");
      const confirm = page.getByRole("checkbox", {
        name: text(
          "I reviewed this learner, guardian, evidence and the exact decision.",
        ),
        exact: true,
      });
      await confirm.check();
      const submit = page.getByRole("button", {
        name: text("Record verification decision"),
        exact: true,
      });
      await expect(submit).toBeDisabled();
      const readiness = page.locator("#guardian-decision-readiness");
      await expect(readiness.locator("li")).toHaveCount(1);
      await expect(readiness).toContainText(
        text(
          "The student must confirm this relationship from their own account. A staff call does not replace this confirmation. After they confirm, refresh verification details.",
        ),
      );
      await expect(
        page.getByRole("checkbox", {
          name: text("I observed the student acknowledgment during this call."),
          exact: true,
        }),
      ).toHaveCount(0);
      expect(f.writes).toHaveLength(0);
      if (hindi) {
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const accessibility = await new AxeBuilder({ page })
          .include(".guardian-verification-editor")
          .analyze();
        expect(
          accessibility.violations.filter((v) =>
            ["serious", "critical"].includes(v.impact || ""),
          ),
        ).toEqual([]);
        await submit.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: "test-results/guardian-decision-blocked-hi-phone.png",
          fullPage: true,
        });
      }
      // Model a separate student acknowledgment persisted by the server.
      f.state().studentAcknowledgedAt = new Date().toISOString();
      f.state().version += 1;
      await page
        .getByRole("button", {
          name: text("Refresh verification details"),
          exact: true,
        })
        .click();
      await expect(readiness).not.toContainText(
        text(
          "The student must confirm this relationship from their own account. A staff call does not replace this confirmation. After they confirm, refresh verification details.",
        ),
      );
      await expect(submit).toBeDisabled();
      await page
        .getByRole("combobox", {
          name: text("Completed call review"),
          exact: true,
        })
        .selectOption("");
      await confirm.check();
      await expect(submit).toBeEnabled();
      await page
        .getByRole("textbox", {
          name: text("Protected review reference"),
          exact: true,
        })
        .fill("   ");
      await expect(submit).toBeDisabled();
      await expect(readiness).toContainText(
        text("Enter a protected review reference."),
      );
      await page
        .getByRole("textbox", {
          name: text("Protected review reference"),
          exact: true,
        })
        .fill("private:synthetic-review");
      await submit.click();
      await expect(
        page.getByText(text("Guardian verification review recorded."), {
          exact: true,
        }),
      ).toBeVisible();
      expect(f.writes).toHaveLength(1);
      expect(f.writes[0].body.expectedVersion).toBe(2);
      expect(f.writes[0].body.studentAcknowledgmentObserved).toBe(false);
    });
  test("unknown staff approval retries the already-committed body and key once without allowing another decision", async ({
    page,
  }) => {
    const f = await setup(page, { role: "ADMIN", uncertain: true });
    await openStaff(page);
    await staffFields(page);
    await page
      .getByRole("button", {
        name: "Record verification decision",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", { name: "Retry same decision", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", {
        name: "Feedback for the guardian",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Close evidence review", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Retry same decision", exact: true })
      .click();
    await expect(
      page.getByText("Guardian verification review recorded."),
    ).toBeVisible();
    expect(f.writes).toHaveLength(2);
    expect(f.writes[1]).toEqual(f.writes[0]);
    expect(f.state().version).toBe(2);
  });
  test("confirmed review followed by denied reads hides private details and recovers without another write", async ({
    page,
  }) => {
    const f = await setup(page, { role: "ADMIN", readFailure: true });
    await openStaff(page);
    await staffFields(page);
    await page
      .getByRole("button", {
        name: "Record verification decision",
        exact: true,
      })
      .click();
    await expect(
      page.getByText(
        "Private verification details are unavailable. Refresh before making another change.",
      ),
    ).toBeVisible();
    await expect(page.getByText("review:private-911")).toHaveCount(0);
    await expect(
      page.getByText("Synthetic backend private detail"),
    ).toHaveCount(0);
    f.recover();
    await page
      .getByRole("button", {
        name: "Refresh verification details",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("review:private-911", { exact: false }),
    ).toBeVisible();
    expect(f.writes).toHaveLength(1);
    await expect(
      page.getByRole("button", {
        name: "Record verification decision",
        exact: true,
      }),
    ).toHaveCount(0);
  });
  test("guardian history reaches later records and explicit close restores heading focus", async ({
    page,
  }) => {
    await setup(page, { history: true });
    await page
      .getByRole("button", { name: "Load more records", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Last history learner", exact: true }),
    ).toBeVisible();
    await openOwner(page);
    await page
      .getByRole("button", { name: "Close verification", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "How guardian verification works",
        exact: true,
      }),
    ).toBeFocused();
  });
  test("Hindi relationship form fits phones and supports keyboard and accessible controls", async ({
    page,
  }) => {
    await setup(page, { empty: true });
    await page
      .getByRole("button", { name: "Start guardian verification", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Switch English and Hindi", exact: true })
      .click();
    await checkHindi(page);
    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        (await page
          .getByRole("button", {
            name: hindiMessages["Continue"],
            exact: true,
          })
          .boundingBox())!.height,
      ).toBeGreaterThanOrEqual(44);
    }
    const name = page.getByLabel(hindiMessages["Guardian's full name"], {
      exact: true,
    });
    await name.focus();
    await expect(name).toBeFocused();
    const axe = await new AxeBuilder({ page })
      .include(".guardian-verification-workspace")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      axe.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await page.locator(".guardian-verification-editor").screenshot({
      path: "test-results/guardian-verification-hindi-mobile.png",
    });
  });
}
