function mode(){return process.env.MEETING_PROVIDER_MODE==='google-meet'?'LIVE':'SANDBOX';}
async function create(reservationId){
 if(mode()==='SANDBOX')return {providerMode:'SANDBOX',providerSpaceId:'space_synthetic_'+reservationId.replaceAll('-',''),joinUrl:'https://meet.invalid/synthetic/'+reservationId};
 const token=process.env.GOOGLE_MEET_ACCESS_TOKEN;if(!token)throw new Error('GOOGLE_MEET_NOT_CONFIGURED');
 const response=await fetch('https://meet.googleapis.com/v2/spaces',{method:'POST',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({config:{accessType:'RESTRICTED'}})});
 if(!response.ok)throw new Error('GOOGLE_MEET_CREATE_FAILED');const value=await response.json();
 if(typeof value.name!=='string'||typeof value.meetingUri!=='string'||!value.meetingUri.startsWith('https://meet.google.com/'))throw new Error('GOOGLE_MEET_RESPONSE_INVALID');
 return {providerMode:'LIVE',providerSpaceId:value.name,joinUrl:value.meetingUri};
}
module.exports={mode,create};
