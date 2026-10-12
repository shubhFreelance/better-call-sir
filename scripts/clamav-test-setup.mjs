import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const image='clamav/clamav@sha256:f4bb8882123f505292b4ead6826ff79c56e01d0abaa46b20b42b65f11fce8b21';
const directory=path.resolve('.cache/clamav');mkdirSync(directory,{recursive:true});
writeFileSync(path.join(directory,'clamd.conf'),'Foreground yes\nDatabaseDirectory /definitions\nTCPSocket 3310\nTCPAddr 0.0.0.0\nStreamMaxLength 6M\nMaxFileSize 6M\nMaxScanSize 12M\nLogTime yes\n');
const eicar=Buffer.from('58354f2150254041505b345c505a58353428505e2937434329377d2445494341522d5354414e444152442d414e544956495255532d544553542d46494c452124482b482a','hex');
writeFileSync(path.join(directory,'eicar.ndb'),'BCS.Eicar.Test:0:*:'+eicar.toString('hex')+'\n');
try{const existing=JSON.parse(execFileSync('docker',['inspect','bcs-dev-clamav'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}))[0];if(existing.Config.Image!==image)throw new Error('Existing scanner uses a different image; do not replace it automatically.');if(!existing.State.Running)execFileSync('docker',['start','bcs-dev-clamav'],{stdio:'inherit'});}catch(error){if(error.status!==1)throw error;execFileSync('docker',['run','-d','--name','bcs-dev-clamav','--publish','127.0.0.1:3310:3310','--mount',`type=bind,src=${directory},dst=/definitions,readonly`,'--entrypoint','clamd',image,'--config-file=/definitions/clamd.conf'],{stdio:'inherit'});}
console.log('ClamAV engine fixture uses only the EICAR test definition; this is not a current production signature database.');
