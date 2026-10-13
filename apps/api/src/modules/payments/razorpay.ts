import {createHmac,timingSafeEqual} from 'node:crypto';
export type RazorpayOrder={id:string;amount:number;currency:'INR';status:string;receipt:string};
export function paymentMode(){return process.env.PAYMENT_PROVIDER_MODE==='razorpay'?'LIVE':'SANDBOX';}
function credentials(){
  if(!process.env.RAZORPAY_KEY_ID||!process.env.RAZORPAY_KEY_SECRET)throw new Error('RAZORPAY_NOT_CONFIGURED');
  return 'Basic '+Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
}
export async function createRazorpayOrder(id:string,amount:number):Promise<RazorpayOrder>{
  if(paymentMode()==='SANDBOX')return {id:'order_synthetic_'+id.replaceAll('-',''),amount,currency:'INR',status:'created',receipt:id};
  const response=await fetch('https://api.razorpay.com/v1/orders',{method:'POST',signal:AbortSignal.timeout(8000),headers:{Authorization:credentials(),'Content-Type':'application/json'},body:JSON.stringify({amount,currency:'INR',receipt:id,notes:{checkoutOrderId:id}})});
  if(!response.ok)throw new Error('RAZORPAY_ORDER_FAILED');
  const value=await response.json() as Partial<RazorpayOrder>;
  if(typeof value.id!=='string'||value.amount!==amount||value.currency!=='INR'||value.receipt!==id)throw new Error('RAZORPAY_ORDER_INVALID');
  return value as RazorpayOrder;
}
export async function fetchRazorpayOrder(id:string):Promise<RazorpayOrder>{
  if(paymentMode()==='SANDBOX')throw new Error('SANDBOX_RECONCILIATION_LOCAL_ONLY');
  const response=await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(id)}`,{signal:AbortSignal.timeout(8000),headers:{Authorization:credentials()}});
  if(!response.ok)throw new Error('RAZORPAY_RECONCILIATION_FAILED');
  const value=await response.json() as RazorpayOrder;if(value.id!==id||typeof value.amount!=='number'||value.currency!=='INR')throw new Error('RAZORPAY_ORDER_INVALID');return value;
}
export function verifyWebhook(raw:Buffer,signature:string){
  const secret=process.env.RAZORPAY_WEBHOOK_SECRET;if(!secret)throw new Error('RAZORPAY_WEBHOOK_NOT_CONFIGURED');
  const expected=createHmac('sha256',secret).update(raw).digest();return /^[a-f0-9]{64}$/i.test(signature)&&timingSafeEqual(Buffer.from(signature,'hex'),expected);
}
