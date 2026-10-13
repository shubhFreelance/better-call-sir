import {readFileSync,appendFileSync,chmodSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {parseEnv} from 'node:util';
const file=process.argv[2]||'.env',config=parseEnv(readFileSync(file,'utf8'));
if(config.APP_MODE!=='development'||config.NODE_ENV==='production')throw new Error('Key setup is restricted to local development configuration.');
if(config.MFA_ENCRYPTION_KEY&&!/^[A-Za-z0-9+/]{43}=$/.test(config.MFA_ENCRYPTION_KEY))throw new Error('Existing MFA key is invalid; do not replace credentials automatically.');
if(!config.MFA_ENCRYPTION_KEY)appendFileSync(file,'\nMFA_ENCRYPTION_KEY='+randomBytes(32).toString('base64')+'\n');
chmodSync(file,0o600);
console.log('Local MFA encryption key configured. No key material is printed.');
