import {lstatSync,readFileSync} from 'node:fs';
export function mfaKeys(){
 const file=process.env.MFA_KEYRING_FILE;
 const decode=(value:unknown)=>{if(typeof value!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(value))throw new Error('MFA_KEY_UNAVAILABLE');const bytes=Buffer.from(value,'base64');if(bytes.length!==32||bytes.toString('base64')!==value)throw new Error('MFA_KEY_UNAVAILABLE');return bytes;};
 if(!file)return {activeId:null,active:decode(process.env.MFA_ENCRYPTION_KEY),get:(id:string|null)=>{if(id)throw new Error('MFA_KEY_UNAVAILABLE');return decode(process.env.MFA_ENCRYPTION_KEY);}};
 const stat=lstatSync(file);if(!stat.isFile()||(stat.mode&0o077)!==0||stat.size>16384)throw new Error('MFA_KEYRING_UNAVAILABLE');
 const ring=JSON.parse(readFileSync(file,'utf8'));
 if(!ring||typeof ring!=='object'||!ring.keys||typeof ring.keys!=='object'||Array.isArray(ring.keys)||!Object.keys(ring.keys).length||Object.keys(ring.keys).length>16||Object.keys(ring.keys).some(id=>!/^[a-zA-Z0-9_-]{1,40}$/.test(id))||!Object.hasOwn(ring.keys,ring.activeId))throw new Error('MFA_KEYRING_UNAVAILABLE');
 const keys=new Map<string,Buffer>(Object.entries(ring.keys).map(([id,value])=>[id,decode(value)]));
 if(ring.legacyKeyId!==undefined&&!keys.has(ring.legacyKeyId))throw new Error('MFA_KEYRING_UNAVAILABLE');
 return {activeId:ring.activeId as string,active:keys.get(ring.activeId)!,get:(id:string|null)=>{const key=keys.get(id||ring.legacyKeyId);if(!key)throw new Error('MFA_KEY_UNAVAILABLE');return key;}};
}
