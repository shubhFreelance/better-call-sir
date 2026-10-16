import type {Account} from '@prisma/client';
import {DB,fail} from '../../shared';
export async function studentAuthority(db:DB,actor:Account,id:string,write=false){
 if(write)await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
 if(actor.role==='INDEPENDENT_STUDENT'&&actor.id===id)return;
 if(actor.role!=='GUARDIAN')fail(404,'NOT_FOUND','Student access not found.');
 const grant=await db.studentGuardianGrant.findFirst({where:{studentAccountId:id,acceptedById:actor.id,status:'ACTIVE',...(write?{supportMode:'MANAGE'}:{})}}),owner=await db.account.findUnique({where:{id}});
 if(await db.privacyRequest.count({where:{accountId:actor.id,kind:'DELETION',scope:'ACCOUNT',status:'PENDING'}}))fail(404,'NOT_FOUND','Student access not found.');
 if(!grant||!owner||owner.role!=='INDEPENDENT_STUDENT'||owner.disabled||!await db.independentStudentProfile.count({where:{accountId:id}})||await db.privacyRequest.count({where:{accountId:id,kind:'DELETION',scope:'ACCOUNT',status:'PENDING'}}))fail(404,'NOT_FOUND','Student access not found.');
}
