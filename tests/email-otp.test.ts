import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emailAddress,otpDigest} from '../apps/api/src/modules/identity/email-otp';
import {randomBytes,createHash} from 'node:crypto';
test('email OTP normalizes addresses and rejects invalid recipients',()=>{assert.equal(emailAddress.parse(' Guardian@Example.test '),'guardian@example.test');assert.equal(emailAddress.safeParse('not an email').success,false);});
test('low-entropy OTP storage is keyed and bound to the normalized address',()=>{
 const old=process.env.OTP_HASH_KEY;try{process.env.OTP_HASH_KEY=randomBytes(32).toString('base64');const digest=otpDigest('guardian@example.test','123456');assert.match(digest,/^[a-f0-9]{64}$/);assert.notEqual(digest,createHash('sha256').update('123456').digest('hex'));assert.notEqual(digest,otpDigest('other@example.test','123456'));process.env.OTP_HASH_KEY=randomBytes(32).toString('base64');assert.notEqual(digest,otpDigest('guardian@example.test','123456'));delete process.env.OTP_HASH_KEY;assert.throws(()=>otpDigest('guardian@example.test','123456'),/OTP_KEY_UNAVAILABLE/);}finally{if(old===undefined)delete process.env.OTP_HASH_KEY;else process.env.OTP_HASH_KEY=old;}
});
