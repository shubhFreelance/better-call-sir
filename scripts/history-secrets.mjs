import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=process.argv[2]||'.',root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),git=(args)=>execFileSync('git',args,{cwd:repo,maxBuffer:256*1024*1024});
if(git(['rev-parse','--is-shallow-repository']).toString().trim()==='true')throw new Error('History scanning requires a complete fetch; shallow history is not security evidence.');
const objects=new Map(git(['rev-list','--objects','--all']).toString().trim().split('\n').filter(Boolean).map(line=>{const split=line.indexOf(' ');return [split<0?line:line.slice(0,split),split<0?'':line.slice(split+1)];}));
const ids=execFileSync('git',['cat-file','--batch-check=%(objectname) %(objecttype)'],{cwd:repo,input:[...objects.keys()].join('\n')+'\n',encoding:'utf8',maxBuffer:10*1024*1024}).trim().split('\n').filter(line=>line.endsWith(' blob')).map(line=>line.split(' ')[0]);
if(!ids.length)throw new Error('No historical blobs available to scan.');
const data=execFileSync('git',['cat-file','--batch'],{cwd:repo,input:ids.join('\n')+'\n',maxBuffer:256*1024*1024}),dir=mkdtempSync(path.join(tmpdir(),'bcs-history-scan-'));
try{
 let offset=0,binary=0;const files=[],batches=[];let batch=[],batchBytes=0;
 for(const id of ids){const end=data.indexOf(10,offset);if(end<0)throw new Error('Incomplete Git object stream.');const header=data.subarray(offset,end).toString().split(' '),size=Number(header[2]);if(header[0]!==id||header[1]!=='blob'||!Number.isSafeInteger(size)||size<0||end+1+size>=data.length)throw new Error('Invalid Git object stream.');const bytes=data.subarray(end+1,end+1+size);offset=end+size+2;if(bytes.includes(0)){binary++;continue;}const file=path.join(dir,id+'.txt');writeFileSync(file,bytes,{mode:0o600});files.push(file);if(batch.length&&(batchBytes+size>2*1024*1024||batch.length>=50)){batches.push(batch);batch=[];batchBytes=0;}batch.push(file);batchBytes+=size;}
 if(batch.length)batches.push(batch);
 if(!files.length)throw new Error('No historical text available to scan.');
 const findings=[];
 for(const files of batches){const scan=spawnSync(process.execPath,[path.join(root,'scripts/secrets-scan.mjs'),...files],{cwd:root,encoding:'utf8',maxBuffer:10*1024*1024,timeout:120000});if(scan.error||![0,1].includes(scan.status))throw new Error('Historical secrets scanner could not complete.');let report;try{report=JSON.parse(scan.stdout);}catch{throw new Error('Historical secrets scanner returned invalid evidence.');}findings.push(...report.findings.map(({file,...finding})=>{const blob=path.basename(file,'.txt');return {blob,path:objects.get(blob),...finding};}));}
 console.log(JSON.stringify({scope:'All fetched Git refs; binary blobs are excluded from text rules',blobs:ids.length,textBlobs:files.length,binaryBlobs:binary,findings},null,2));process.exitCode=findings.length?1:0;
}finally{rmSync(dir,{recursive:true,force:true});}
