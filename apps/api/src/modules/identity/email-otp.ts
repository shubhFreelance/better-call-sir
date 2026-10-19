import {z} from 'zod';
import {createHmac} from 'node:crypto';
export const emailAddress=z.string().trim().max(254).pipe(z.email()).transform(s=>s.toLowerCase());
export function otpDigest(email:string,code:string){const key=process.env.OTP_HASH_KEY||'';if(!/^[A-Za-z0-9+/]{43}=$/.test(key))throw new Error('OTP_KEY_UNAVAILABLE');return createHmac('sha256',Buffer.from(key,'base64')).update('bcs.email.otp.v1\0'+email+'\0'+code).digest('hex');}
