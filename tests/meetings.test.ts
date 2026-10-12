import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {create,mode} from '@bcs/meetings';

const originalFetch=globalThis.fetch;
afterEach(()=>{delete process.env.MEETING_PROVIDER_MODE;delete process.env.GOOGLE_MEET_ACCESS_TOKEN;globalThis.fetch=originalFetch;});

test('meeting sandbox produces a non-routable deterministic link',async()=>{
 process.env.MEETING_PROVIDER_MODE='sandbox';
 assert.equal(mode(),'SANDBOX');
 const result=await create('10000000-0000-4000-8000-000000000001');
 assert.equal(result.providerMode,'SANDBOX');
 assert.match(result.joinUrl,/^https:\/\/meet\.invalid\/synthetic\//);
});

test('Google Meet creation uses restricted access and validates the provider response',async()=>{
 process.env.MEETING_PROVIDER_MODE='google-meet';process.env.GOOGLE_MEET_ACCESS_TOKEN='controlled-test-token';
 globalThis.fetch=(async(url,init)=>{
  assert.equal(url,'https://meet.googleapis.com/v2/spaces');
  assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer controlled-test-token');
  assert.deepEqual(JSON.parse(String(init?.body)),{config:{accessType:'RESTRICTED'}});
  return new Response(JSON.stringify({name:'spaces/test-space',meetingUri:'https://meet.google.com/abc-defg-hij'}),{status:200});
 }) as typeof fetch;
 assert.deepEqual(await create('10000000-0000-4000-8000-000000000001'),{providerMode:'LIVE',providerSpaceId:'spaces/test-space',joinUrl:'https://meet.google.com/abc-defg-hij'});
});

test('live meeting creation fails closed without credentials or a valid Meet URL',async()=>{
 process.env.MEETING_PROVIDER_MODE='google-meet';
 await assert.rejects(create('10000000-0000-4000-8000-000000000001'),/GOOGLE_MEET_NOT_CONFIGURED/);
 process.env.GOOGLE_MEET_ACCESS_TOKEN='controlled-test-token';
 globalThis.fetch=(async()=>new Response(JSON.stringify({name:'spaces/test-space',meetingUri:'https://attacker.invalid/room'}),{status:200})) as typeof fetch;
 await assert.rejects(create('10000000-0000-4000-8000-000000000001'),/GOOGLE_MEET_RESPONSE_INVALID/);
});
