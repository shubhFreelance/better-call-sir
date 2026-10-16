import {z} from 'zod';
import {createHmac} from 'node:crypto';
export const emailAddress=z.string().trim().max(254).pipe(z.email()).transform(s=>s.toLowerCase());
export function otpDigest(email:string,code:string){const key=process.env.OTP_HASH_KEY||'';if(!/^[A-Za-z0-9+/]{43}=$/.test(key))throw new Error('OTP_KEY_UNAVAILABLE');return createHmac('sha256',Buffer.from(key,'base64')).update('bcs.email.otp.v1\0'+email+'\0'+code).digest('hex');}
export async function sendEmailOtp(email:string,code:string,deliveryId:string,locale:'en'|'hi'='en'){
 if(process.env.EMAIL_DELIVERY_MODE==='sandbox'||!process.env.EMAIL_DELIVERY_MODE)return {status:'SANDBOX',developmentCode:code,expiresIn:300};
 if(process.env.EMAIL_DELIVERY_MODE!=='resend'||!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)throw new Error('EMAIL_NOT_CONFIGURED');
 const response=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':deliveryId},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[email],subject:locale==='hi'?'आपका Better Call Sir साइन-इन कोड':'Your Better Call Sir sign-in code',text:locale==='hi'?`आपका साइन-इन कोड ${code} है। यह 5 मिनट में समाप्त हो जाएगा। यह कोड किसी से साझा न करें। यदि आपने कोड नहीं माँगा है, तो इस ईमेल को अनदेखा करें।`:`Your sign-in code is ${code}. It expires in 5 minutes. Do not share this code. If you did not request it, ignore this email.`})});
 if(!response.ok)throw new Error('EMAIL_DELIVERY_FAILED');
 const result=await response.json() as {id?:unknown};if(typeof result.id!=='string'||!result.id)throw new Error('EMAIL_DELIVERY_FAILED');
 return {status:'SENT',expiresIn:300};
}
