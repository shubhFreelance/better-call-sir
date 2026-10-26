"use client";
import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import Link from 'next/link';
import {ShieldCheck,ShieldAlert,Bell} from 'lucide-react';
import {api,type Session,type components} from '@bcs/api-client';
import {useAppTranslation} from './locale';
import {learningModes} from './learning-management';
import {LearningManagementBadge} from '../components/ui/learning-management-badge';
import {ActionToast} from '../components/ui/action-toast';
import {FilterButton} from '../components/ui/filter-button';
import {InfoTooltip} from '../components/ui/info-tooltip';
import {RefreshButton} from '../components/ui/refresh-button';
export function StudentGuardianDetails({session,compact=false}:{session:Session;compact?:boolean}){
 const {appText,appError}=useAppTranslation(),client=useQueryClient();
 const query=useQuery({queryKey:['student-guardian',session.account.id],queryFn:({signal})=>api<components['schemas']['StudentGuardianDetails']>('/student/guardian',{signal}),retry:false});
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState({id:0,message:'',error:false});
 const data=query.error?undefined:query.data;
 const Heading=compact?"h2":"h1";
 const relationship=data?.relationship?appText(data.relationship==='PARENT'?'Parent':data.relationship==='SIBLING'?'Sibling':'Other guardian'):appText('Relationship not recorded');
 async function ping(){if(!data?.canPing||busy)return;setBusy(true);try{const result=await api<components['schemas']['GuardianPing']>('/student/guardian/pings',{method:'POST',csrf:session.csrfToken,key:crypto.randomUUID(),body:{confirmed:true}});setNotice(current=>({id:current.id+1,message:result.sent?'Your guardian has been notified.':'A reminder has already been sent. Please wait before sending another.',error:false}));client.setQueryData(['student-guardian',session.account.id],{...data,canPing:false,nextPingAt:result.nextPingAt});}catch(error){setNotice(current=>({id:current.id+1,message:error instanceof Error?error.message:'Your guardian could not be notified. Try again.',error:true}));}finally{setBusy(false);}}
 return <section className={'student-guardian-card'+(compact?' compact':'')} aria-label={appText('Guardian details')}><ActionToast key={notice.id} message={notice.message?(notice.error?appError(notice.message):appText(notice.message)):''} error={notice.error}/>
  <div className="student-guardian-heading"><div><Heading>{appText(compact?'Your guardian':'Guardian details')}</Heading>{data&&<p><strong>{data.guardianName}</strong><span>{relationship}</span></p>}</div>{data&&<span className={'guardian-verification-badge '+(data.verified?'verified':'unverified')}>{data.verified?<ShieldCheck size={15} aria-hidden="true"/>:<ShieldAlert size={15} aria-hidden="true"/>}{appText(data.verified?'Verified':'Not verified')}</span>}</div>
  {query.isPending&&<p role="status">{appText('Loading guardian details…')}</p>}
  {query.error&&<div role="alert"><p>{appError(query.error.message)}</p><RefreshButton label={appText('Refresh verification details')} disabled={query.isFetching} onClick={()=>query.refetch()}/></div>}
  {data&&(compact?<Link href="/dashboard/guardian-details" className="inline-link">{appText('View guardian details')}</Link>:<>
    <dl className="student-guardian-information"><div><dt>{appText('Email')}</dt><dd>{data.guardianEmail||appText('Not provided')}</dd></div><div><dt>{appText('Relationship status')}</dt><dd>{data.verified?appText('Relationship verified'):appText('Verification needs attention')}</dd></div></dl>
    <LearningManagementBadge label={appText(learningModes[data.managementMode].title)} items={[appText(learningModes[data.managementMode].help)]}/>
    <div className="student-guardian-actions"><InfoTooltip label={appText('About guardian reminders')} items={[appText('Your guardian receives a live notification asking them to complete verification. You can send one reminder per day.'),appText('Learning permissions, account access and guardian verification are separate.')]} /><FilterButton disabled={busy||!data.canPing||query.isFetching} onClick={ping}><Bell size={16} aria-hidden="true"/>{appText(busy?'Sending reminder…':'Ping your guardian')}</FilterButton></div>
    {!data.verified&&!data.canPing&&<p className="student-guardian-help">{appText('A reminder has already been sent. Please wait before sending another.')}</p>}
  </>)}
 </section>;
}
