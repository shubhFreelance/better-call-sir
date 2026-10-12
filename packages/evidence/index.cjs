const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');
const crypto=require('node:crypto');
const directory=()=>path.resolve(process.env.EVIDENCE_DIRECTORY||path.join(__dirname,'../../.cache/private-evidence'));
function file(id){if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Invalid evidence identifier.');return path.join(directory(),id);}
function put(id,bytes){fs.mkdirSync(directory(),{recursive:true,mode:0o700});fs.writeFileSync(file(id),bytes,{flag:'wx',mode:0o600});}
function read(id){const fd=fs.openSync(file(id),fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{return fs.readFileSync(fd);}finally{fs.closeSync(fd);}}
function remove(id){try{fs.unlinkSync(file(id));}catch(error){if(error.code!=='ENOENT')throw error;}}
function digest(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function validContent(bytes,type){return bytes.length>0&&bytes.length<=5*1024*1024&&(type==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':type==='image/png'?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):type==='image/jpeg'?bytes.subarray(0,3).equals(Buffer.from('ffd8ff','hex')):false);}
function command(command,bytes){return new Promise((resolve,reject)=>{
 if(!process.env.CLAMAV_HOST||!process.env.CLAMAV_PORT)return reject(new Error('SCANNER_UNCONFIGURED'));
 const socket=net.createConnection({host:process.env.CLAMAV_HOST,port:Number(process.env.CLAMAV_PORT)});let response='',settled=false;
 const finish=(error)=>{if(settled)return;settled=true;socket.destroy();error?reject(error):resolve(response.replace(/\0/g,'').trim());};
 socket.setTimeout(8000,()=>finish(new Error('SCANNER_TIMEOUT')));socket.on('error',()=>finish(new Error('SCANNER_UNAVAILABLE')));
 socket.on('data',chunk=>{response+=chunk.toString();if(response.length>2048)return finish(new Error('SCANNER_PROTOCOL'));if(response.includes('\0')||response.includes('\n'))finish();});socket.on('end',()=>response?finish():finish(new Error('SCANNER_PROTOCOL')));
 socket.on('connect',()=>{socket.write('z'+command+'\0');if(bytes){for(let offset=0;offset<bytes.length;offset+=65536){const chunk=bytes.subarray(offset,offset+65536),size=Buffer.alloc(4);size.writeUInt32BE(chunk.length);socket.write(size);socket.write(chunk);}socket.write(Buffer.alloc(4));}});
 });}
async function scan(bytes){const scannerVersion=await command('VERSION');if(!scannerVersion.startsWith('ClamAV '))throw new Error('SCANNER_PROTOCOL');const result=await command('INSTREAM',bytes);if(result==='stream: OK')return {status:'CLEAN',scannerVersion};if(/^stream: .+ FOUND$/.test(result))return {status:'INFECTED',scannerVersion};throw new Error('SCANNER_PROTOCOL');}
module.exports={put,read,remove,digest,validContent,scan};
