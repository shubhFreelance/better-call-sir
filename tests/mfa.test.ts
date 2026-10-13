import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,statSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {totp,matchingStep,newMfaSecret,encryptMfa,decryptMfa} from '../apps/api/src/modules/identity/totp';
test('TOTP uses RFC 6238 time steps, limited skew and monotonic replay prevention',()=>{
 const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
 assert.equal(totp(secret,1n),'287082');assert.equal(matchingStep(secret,'287082',-1n,59000),1n);assert.equal(matchingStep(secret,'287082',1n,59000),null);assert.equal(matchingStep(secret,'287082',-1n,120000),null);assert.equal(matchingStep(secret,'1234567',-1n,59000),null);
 assert.match(newMfaSecret(),/^[A-Z2-7]{32}$/);
});
test('MFA secrets use authenticated encryption tied to the account and fail closed without a key',()=>{
 const old=process.env.MFA_ENCRYPTION_KEY;try{process.env.MFA_ENCRYPTION_KEY=randomBytes(32).toString('base64');const secret=newMfaSecret(),encrypted=encryptMfa(secret,'account-a');assert.equal(decryptMfa(encrypted,'account-a'),secret);assert.throws(()=>decryptMfa(encrypted,'account-b'));const bytes=Buffer.from(encrypted,'base64');bytes[bytes.length-1]^=1;assert.throws(()=>decryptMfa(bytes.toString('base64'),'account-a'));delete process.env.MFA_ENCRYPTION_KEY;assert.throws(()=>encryptMfa(secret,'account-a'),/MFA_KEY_UNAVAILABLE/);}finally{if(old)process.env.MFA_ENCRYPTION_KEY=old;else delete process.env.MFA_ENCRYPTION_KEY;}
});
test('local MFA setup generates private keys once, never prints them and refuses production files',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'bcs-mfa-key-')),file=path.join(dir,'.env');try{writeFileSync(file,'APP_MODE=development\n');const first=spawnSync(process.execPath,['scripts/development-key.mjs',file],{encoding:'utf8'});assert.equal(first.status,0);const saved=readFileSync(file,'utf8'),secret=saved.split('MFA_ENCRYPTION_KEY=')[1].trim();assert.equal(Buffer.from(secret,'base64').length,32);assert.equal(first.stdout.includes(secret),false);assert.equal(statSync(file).mode&0o777,0o600);assert.equal(spawnSync(process.execPath,['scripts/development-key.mjs',file]).status,0);assert.equal(readFileSync(file,'utf8'),saved);writeFileSync(file,'APP_MODE=production\n');assert.notEqual(spawnSync(process.execPath,['scripts/development-key.mjs',file],{stdio:'pipe'}).status,0);assert.equal(readFileSync(file,'utf8'),'APP_MODE=production\n');}finally{rmSync(dir,{recursive:true});}
});
