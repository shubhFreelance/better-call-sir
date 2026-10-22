import { test } from "node:test";
import assert from "node:assert/strict";
import { supportText, supportError } from "../apps/web/app/support-copy";
import { privacyText, privacyError } from "../apps/web/app/privacy-copy";
import { api, ApiError } from "../packages/api-client/src";
test("browser API transport is bounded, rejects redirects and honors caller cancellation", async () => {
  const original = globalThis.fetch,
    base = process.env.NEXT_PUBLIC_API_BASE;
  try {
    delete process.env.NEXT_PUBLIC_API_BASE;
    let options: RequestInit | undefined;
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "/api/v1/teachers");
      options = init;
      return new Response('{"items":[]}', { status: 200 });
    };
    const controller = new AbortController();
    await api("/teachers", { signal: controller.signal });
    assert.equal(options?.redirect, "error");
    assert.equal(options?.credentials, "include");
    assert.equal(options?.cache, "no-store");
    assert(options?.signal);
    controller.abort();
    assert.equal(options!.signal!.aborted, true);
  } finally {
    globalThis.fetch = original;
    if (base === undefined) delete process.env.NEXT_PUBLIC_API_BASE;
    else process.env.NEXT_PUBLIC_API_BASE = base;
  }
});
test("browser API rejects cross-origin configuration and paths outside the owned API before sending credentials", async () => {
  const original = globalThis.fetch,
    base = process.env.NEXT_PUBLIC_API_BASE;
  try {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response("{}");
    };
    delete process.env.NEXT_PUBLIC_API_BASE;
    for (const path of [
      "https://attacker.invalid",
      "//attacker.invalid",
      "/../../other",
      "/../other",
    ])
      await assert.rejects(
        api(path),
        (error: any) =>
          error instanceof ApiError && error.code === "INVALID_REQUEST",
      );
    process.env.NEXT_PUBLIC_API_BASE = "https://attacker.invalid/api/v1";
    await assert.rejects(api("/auth/session"));
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
    if (base === undefined) delete process.env.NEXT_PUBLIC_API_BASE;
    else process.env.NEXT_PUBLIC_API_BASE = base;
  }
});
test("unreadable API responses preserve uncertainty and malformed error bodies remain safe", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("not-json", { status: 200 });
    await assert.rejects(
      api("/requests"),
      (error: any) =>
        error instanceof ApiError && error.code === "INVALID_RESPONSE",
    );
    globalThis.fetch = async () => new Response("null", { status: 400 });
    await assert.rejects(
      api("/requests"),
      (error: any) => error instanceof ApiError && error.code === "ERROR",
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("privacy display localization preserves authored text and treats unknown/prototype error keys as safe text", () => {
  assert.equal(privacyText(true, "Correction"), "सुधार");
  assert.equal(privacyText(false, "Correction"), "Correction");
  assert.equal(
    privacyText(true, "Reviewer-authored evidence"),
    "Reviewer-authored evidence",
  );
  assert.equal(privacyError(true, ""), "");
  for (const value of [
    "constructor",
    "__proto__",
    "toString",
    "Unrecognized service error",
  ]) {
    assert.equal(privacyText(true, value), value);
    assert.equal(privacyError(false, value), value);
    assert.equal(
      privacyError(true, value),
      "अनुरोध पूरा नहीं हुआ। अपनी अनुमति और मौजूदा जानकारी जाँचकर फिर कोशिश करें।",
    );
  }
  assert.equal(
    privacyError(true, "Your session has expired. Sign in again."),
    "आपका प्रवेश समाप्त हो गया है। फिर साइन इन करें।",
  );
});

test("support localization keeps unknown and prototype keys safe", () => {
  assert.equal(supportText(true, "Safety concern"), "सुरक्षा संबंधी चिंता");
  assert.equal(supportText(false, "Safety concern"), "Safety concern");
  assert.equal(supportError(true, ""), "");
  assert.equal(
    supportError(true, "Your session has expired. Sign in again."),
    "आपका प्रवेश समाप्त हो गया है। फिर साइन इन करें।",
  );
  for (const value of [
    "constructor",
    "__proto__",
    "toString",
    "Authored case message",
  ]) {
    assert.equal(supportText(true, value), value);
    assert.equal(supportError(false, value), value);
    assert.equal(
      supportError(true, value),
      "अनुरोध पूरा नहीं हुआ। अपनी अनुमति और मौजूदा जानकारी जाँचकर फिर कोशिश करें।",
    );
  }
});

test("session recovery serializes expiry refresh, checks identity and replays each save with the original body/key and new CSRF", async () => {
  const { sessionApi } = await import("../packages/api-client/src");
  const original = globalThis.fetch, locks = Object.getOwnPropertyDescriptor(navigator, "locks");
  const session = { account: { id: "teacher-recovery", role: "GUARDIAN", name: "Synthetic teacher", verified: false }, csrfToken: "old-csrf" };
  let active = false, refreshes = 0, reads = 0;
  const writes: RequestInit[] = [], recovered: string[] = [];
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: async (_name: string, fn: () => Promise<unknown>) => fn() } });
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/auth/session")) { reads++; return new Response(JSON.stringify(active ? { ...session, csrfToken: "new-csrf" } : {code:"SESSION_REQUIRED",message:"Sign in to continue."}),{status:active?200:401}); }
    if (String(url).endsWith("/auth/refresh")) { refreshes++; assert.equal((init!.headers as any)["X-CSRF-Token"],"old-csrf"); active=true; return new Response(JSON.stringify({...session,csrfToken:"new-csrf"})); }
    writes.push(init!);
    return new Response(JSON.stringify(active ? { version: 2 } : { code:"SESSION_EXPIRED",message:"Your session has expired. Sign in again." }),{status:active?200:401});
  };
  try {
    const options={method:"POST",csrf:session.csrfToken,body:{expectedVersion:1,draft:{headline:"Preserve my work"}},key:"same-save-key"};
    const results=await Promise.all([sessionApi(session,"/onboarding/teacher/drafts",options,s=>recovered.push(s.account.id)),sessionApi(session,"/onboarding/teacher/drafts",options,s=>recovered.push(s.account.id))]);
    assert.deepEqual(results,[{version:2},{version:2}]);assert.equal(refreshes,1);assert.equal(reads,1);assert.equal(writes.length,4);
    for(const init of writes){assert.equal(init.body,JSON.stringify(options.body));assert.equal((init.headers as any)["Idempotency-Key"],options.key);}
    assert.equal((writes.at(-1)!.headers as any)["X-CSRF-Token"],"new-csrf");assert.deepEqual(recovered,[session.account.id,session.account.id]);
  } finally { globalThis.fetch=original; if(locks)Object.defineProperty(navigator,"locks",locks);else delete (navigator as any).locks; }
});
test("session recovery never replays a save into a different account or after revocation, denial or uncertain network results",async()=>{
 const {sessionApi}=await import('../packages/api-client/src');const original=globalThis.fetch;const session={account:{id:'expected-owner',name:'Synthetic',role:'GUARDIAN',verified:false},csrfToken:'csrf'};
 try{
  let writes=0,reads=0;globalThis.fetch=async(url)=>{if(String(url).endsWith('/auth/session')){reads++;return new Response(JSON.stringify({...session,account:{...session.account,id:'another-owner'}}));}writes++;return new Response(JSON.stringify({code:'SESSION_REQUIRED',message:'Sign in to continue.'}),{status:401});};
  await assert.rejects(sessionApi(session,'/onboarding/teacher/drafts',{method:'POST',csrf:'csrf',body:{draft:{}},key:'preserved-key'}),(e:any)=>e.code==='SESSION_REVOKED');assert.equal(writes,1);assert.equal(reads,1);
  for(const [status,code] of [[401,'SESSION_REVOKED'],[403,'FORBIDDEN'],[500,'INTERNAL']]){let calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({code,message:'Synthetic failure'}),{status:Number(status)});};await assert.rejects(sessionApi(session,'/onboarding/teacher/drafts',{method:'POST',csrf:'csrf'}));assert.equal(calls,1);}
  let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Synthetic lost response');};await assert.rejects(sessionApi(session,'/onboarding/teacher/drafts',{method:'POST',csrf:'csrf'}));assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
test("a rotated CSRF token is recovered from the same live account without rotating refresh credentials",async()=>{
 const {sessionApi}=await import('../packages/api-client/src');const original=globalThis.fetch;const session={account:{id:'rotated-owner',name:'Synthetic',role:'TEACHER',verified:false},csrfToken:'old'};let writes=0;
 try{globalThis.fetch=async(url,init)=>{if(String(url).endsWith('/auth/session'))return new Response(JSON.stringify({...session,csrfToken:'new'}));assert(!String(url).endsWith('/auth/refresh'));writes++;return new Response(JSON.stringify(writes===1?{code:'CSRF',message:'Refresh this page before continuing.'}:{saved:true}),{status:writes===1?403:200});};assert.deepEqual(await sessionApi(session,'/onboarding/teacher/drafts',{method:'POST',csrf:'old'}),{saved:true});assert.equal(writes,2);}finally{globalThis.fetch=original;}
});

test("without browser refresh locking, an expired session requires sign-in instead of risking refresh-family replay",async()=>{
 const {sessionApi}=await import('../packages/api-client/src');const original=globalThis.fetch,locks=Object.getOwnPropertyDescriptor(navigator,'locks');const session={account:{id:'legacy-browser',name:'Synthetic',role:'GUARDIAN',verified:false},csrfToken:'csrf'};let calls=0;
 Object.defineProperty(navigator,'locks',{configurable:true,value:undefined});
 try{globalThis.fetch=async(url)=>{calls++;assert(!String(url).endsWith('/auth/refresh'));return new Response(JSON.stringify({code:'SESSION_REQUIRED',message:'Sign in to continue.'}),{status:401});};await assert.rejects(sessionApi(session,'/onboarding/teacher/drafts',{method:'POST',csrf:'csrf'}),(e:any)=>e.code==='SESSION_REQUIRED');assert.equal(calls,2);}finally{globalThis.fetch=original;if(locks)Object.defineProperty(navigator,'locks',locks);else delete(navigator as any).locks;}
});
test("cancelled saves and repeated expiry never start an unbounded refresh or mutation retry",async()=>{
 const {sessionApi}=await import('../packages/api-client/src');const original=globalThis.fetch;const session={account:{id:'bounded-owner',name:'Synthetic',role:'GUARDIAN',verified:false},csrfToken:'csrf'};let calls=0;
 try{
  const cancel=new AbortController();globalThis.fetch=async()=>{calls++;cancel.abort();return new Response(JSON.stringify({code:'SESSION_REQUIRED',message:'Sign in to continue.'}),{status:401});};await assert.rejects(sessionApi(session,'/onboarding/teacher/drafts',{method:'POST',csrf:'csrf',signal:cancel.signal}));assert.equal(calls,1);
  calls=0;globalThis.fetch=async(url)=>{calls++;return String(url).endsWith('/auth/session')?new Response(JSON.stringify(session)):new Response(JSON.stringify({code:'SESSION_EXPIRED',message:'Your session has expired. Sign in again.'}),{status:401});};await assert.rejects(sessionApi(session,'/onboarding/teacher/drafts',{method:'POST',csrf:'csrf'}));assert.equal(calls,3);
 }finally{globalThis.fetch=original;}
});
