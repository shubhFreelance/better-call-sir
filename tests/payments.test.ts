import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createRazorpayOrder,paymentMode,verifyWebhook} from '../apps/api/src/modules/payments/razorpay';
test('Razorpay transport validates provider responses and webhook bytes',async()=>{
  const originalFetch=globalThis.fetch,oldMode=process.env.PAYMENT_PROVIDER_MODE,oldId=process.env.RAZORPAY_KEY_ID,oldSecret=process.env.RAZORPAY_KEY_SECRET,oldWebhook=process.env.RAZORPAY_WEBHOOK_SECRET;
  try{
    delete process.env.PAYMENT_PROVIDER_MODE;assert.equal(paymentMode(),'SANDBOX');assert.match((await createRazorpayOrder('10000000-0000-4000-8000-000000000099',12345)).id,/^order_synthetic_/);
    process.env.PAYMENT_PROVIDER_MODE='razorpay';process.env.RAZORPAY_KEY_ID='synthetic-key-id';process.env.RAZORPAY_KEY_SECRET='synthetic-key-secret';
    globalThis.fetch=async(_input,init)=>{assert.equal(init?.redirect,'error');assert(init?.signal);const body=JSON.parse(init!.body as string);return new Response(JSON.stringify({id:'order_provider',amount:body.amount,currency:'INR',status:'created',receipt:body.receipt}),{status:200});};
    assert.equal((await createRazorpayOrder('10000000-0000-4000-8000-000000000099',12345)).id,'order_provider');
    globalThis.fetch=async()=>new Response(JSON.stringify({id:'wrong',amount:1,currency:'INR',receipt:'wrong'}),{status:200});await assert.rejects(createRazorpayOrder('10000000-0000-4000-8000-000000000099',12345));
    const raw=Buffer.from('{"event":"payment.captured"}');process.env.RAZORPAY_WEBHOOK_SECRET='synthetic-webhook-key';const signature=createHmac('sha256',process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');assert(verifyWebhook(raw,signature));assert.equal(verifyWebhook(Buffer.from('{}'),signature),false);
  }finally{globalThis.fetch=originalFetch;for(const [key,value] of Object.entries({PAYMENT_PROVIDER_MODE:oldMode,RAZORPAY_KEY_ID:oldId,RAZORPAY_KEY_SECRET:oldSecret,RAZORPAY_WEBHOOK_SECRET:oldWebhook})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
