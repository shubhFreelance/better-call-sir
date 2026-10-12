import {z} from 'zod';
export const emailAddress=z.string().trim().max(254).pipe(z.email()).transform(s=>s.toLowerCase());
export async function sendEmailOtp(email:string,code:string,deliveryId:string){
 if(process.env.EMAIL_DELIVERY_MODE==='sandbox'||!process.env.EMAIL_DELIVERY_MODE)return {status:'SANDBOX',developmentCode:code,expiresIn:300};
 if(process.env.EMAIL_DELIVERY_MODE!=='resend'||!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)throw new Error('EMAIL_NOT_CONFIGURED');
 const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':deliveryId},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[email],subject:'Your Better Call Sir sign-in code',text:`Your sign-in code is ${code}. It expires in 5 minutes. Do not share this code. If you did not request it, ignore this email.`})});
 if(!response.ok)throw new Error('EMAIL_DELIVERY_FAILED');
 const result=await response.json() as {id?:unknown};if(typeof result.id!=='string'||!result.id)throw new Error('EMAIL_DELIVERY_FAILED');
 return {status:'SENT',expiresIn:300};
}
