import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emailAddress,sendEmailOtp} from '../apps/api/src/modules/identity/email-otp';
test('email OTP normalizes addresses, requires delivery configuration and never discloses real codes',async()=>{
 const oldMode=process.env.EMAIL_DELIVERY_MODE,oldKey=process.env.RESEND_API_KEY,oldFrom=process.env.EMAIL_FROM,original=globalThis.fetch;
 try{
  assert.equal(emailAddress.parse('  Guardian@Example.test '),'guardian@example.test');
  process.env.EMAIL_DELIVERY_MODE='sandbox';assert.equal((await sendEmailOtp('guardian@example.test','123456','fixture')).developmentCode,'123456');
  process.env.EMAIL_DELIVERY_MODE='resend';delete process.env.RESEND_API_KEY;await assert.rejects(sendEmailOtp('guardian@example.test','123456','fixture'));
  process.env.RESEND_API_KEY='synthetic-provider-key';process.env.EMAIL_FROM='signin@example.test';
  globalThis.fetch=async(input,init)=>{assert.equal(input,'https://api.resend.com/emails');assert.equal(init?.redirect,'error');assert(init?.signal);const payload=JSON.parse(init!.body as string);assert.deepEqual(payload.to,['guardian@example.test']);assert.match(payload.text,/123456/);return new Response(JSON.stringify({id:'synthetic-delivery'}),{status:200});};
  assert.deepEqual(await sendEmailOtp('guardian@example.test','123456','fixture'),{status:'SENT',expiresIn:300});
  globalThis.fetch=async()=>new Response('{}',{status:500});await assert.rejects(sendEmailOtp('guardian@example.test','123456','fixture'));
  globalThis.fetch=async()=>new Response('{}',{status:200});await assert.rejects(sendEmailOtp('guardian@example.test','123456','fixture'));
 }finally{globalThis.fetch=original;for(const [key,value] of Object.entries({EMAIL_DELIVERY_MODE:oldMode,RESEND_API_KEY:oldKey,EMAIL_FROM:oldFrom})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
