import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {ids,teachers} from '../packages/test-fixtures/src';
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
async function seed() {
  if (process.env.APP_MODE!=='development' || process.env.NODE_ENV==='production') throw new Error('Synthetic seed is development-only.');
  const accounts=[
    {id:ids.guardian,name:'Kavita · demo parent',role:'GUARDIAN',verified:true},
    {id:ids.otherGuardian,name:'Vivek · demo parent',role:'GUARDIAN',verified:true},
    {id:ids.student,name:'Aarav · demo student',role:'STUDENT',verified:false},
    {id:ids.teacherAccount,name:'Ananya · demo teacher',role:'TEACHER',verified:true},
    {id:ids.admin,name:'Operator · demo admin',role:'ADMIN',verified:true},
    {id:ids.unverified,name:'New · unverified parent',role:'GUARDIAN',verified:false}
  ];
  for (const [i,a] of accounts.entries()) await db.account.upsert({where:{id:a.id},create:{...a,phone:`+9100000000${String(i+1).padStart(2,'0')}`},update:{}});
  for (const id of [ids.guardian,ids.otherGuardian]) await db.consent.upsert({where:{guardianId:id},create:{guardianId:id},update:{}});
  await db.child.upsert({where:{id:ids.child},create:{id:ids.child,guardianId:ids.guardian,alias:'Aarav',grade:8,board:'CBSE',studentAccountId:ids.student},update:{}});
  await db.child.upsert({where:{id:ids.otherChild},create:{id:ids.otherChild,guardianId:ids.otherGuardian,alias:'Tara',grade:9,board:'CGBSE'},update:{}});
  for (const [i,t] of teachers.entries()) {
    const accountId=i===0?ids.teacherAccount:`10000000-0000-4000-8000-${String(i+10).padStart(12,'0')}`;
    if (i>0) await db.account.upsert({where:{id:accountId},create:{id:accountId,name:t.name,phone:`+9100000000${i+10}`,role:'TEACHER',verified:true},update:{}});
    await db.teacher.upsert({where:{slug:t.slug},create:{...t,id:`30000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,accountId,boards:['CBSE','CGBSE'],grades:[6,7,8,9,10],status:'APPROVED',screeningComplete:true,consultationOptIn:true},update:{}});
  }
  await db.tuitionRequest.upsert({where:{id:ids.request},create:{id:ids.request,guardianId:ids.guardian,childId:ids.child,subject:'Maths',mode:'HOME',language:'English',locality:'Shankar Nagar',budgetPaise:400000,schedule:'Weekdays after 5pm',status:'PLACED'},update:{}});
  await db.placement.upsert({where:{requestId:ids.request},create:{id:ids.placement,requestId:ids.request,guardianId:ids.guardian,childId:ids.child,teacherId:ids.teacher,monthlyPaise:300000,status:'ACTIVE',guardianAccepted:true,teacherAccepted:true,guardianStarted:true,teacherReceiptConfirmed:true},update:{}});
  const now=new Date();
  await db.membership.upsert({where:{guardianId:ids.guardian},create:{guardianId:ids.guardian,periodStart:new Date(now.getTime()-5*86400000),periodEnd:new Date(now.getTime()+25*86400000)},update:{}});
  for (let i=0;i<8;i++) {
    const start=new Date(now);start.setUTCDate(start.getUTCDate()+(i<6?-(i*3+1):i-4));start.setUTCHours(12,0,0,0);
    const id=`60000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`;
    if(i>=6) await db.reservation.upsert({where:{id},create:{id,teacherId:ids.teacher,guardianId:ids.guardian,kind:'RECURRING',startsAt:start,endsAt:new Date(start.getTime()+3600000),status:'CONFIRMED'},update:{}});
    await db.lesson.upsert({where:{id},create:{id,placementId:ids.placement,teacherId:ids.teacher,childId:ids.child,kind:'RECURRING',subject:'Maths',startsAt:start,endsAt:new Date(start.getTime()+3600000),status:i<6?'COMPLETED':'SCHEDULED',attendance:i===4?'ABSENT':i<6?'PRESENT':'PENDING'},update:{}});
  }
  for (const [name,enabled] of [['revision',true],['proCalls',true],['checkout',false],['ai',false]] as const) await db.featureFlag.upsert({where:{name},create:{name,enabled},update:{}});
  console.log('Synthetic accounts, four teacher profiles, one family journey and lessons seeded.');
}
seed().finally(()=>db.$disconnect());
