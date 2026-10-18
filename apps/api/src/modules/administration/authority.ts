import {AppService,DB,HttpRequest,fail,hash} from '../../shared';
export async function recentAdmin(service:AppService,req:HttpRequest,db:DB=service.db){
 const actor=await service.actor(req,['ADMIN']),session=await db.session.findUnique({where:{accessHash:hash(req.cookies.bcs_access)}}),current=await db.account.findUnique({where:{id:actor.id}});
 if(!session||session.revoked||session.rotated||session.accessExpiresAt<=new Date()||session.expiresAt<=new Date()||!current||current.disabled||current.role!=='ADMIN'||current.authVersion!==session.authVersion)fail(401,'SESSION_REVOKED','Sign in again.');
 if(!session.mfaVerifiedAt||session.mfaVerifiedAt.getTime()<Date.now()-300000)fail(403,'MFA_REQUIRED','Verify your authenticator again before changing administrative settings.');return current;
}
