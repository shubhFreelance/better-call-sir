"use client";
import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import Link from 'next/link';
import {Plus} from 'lucide-react';
import {api,type Session,type components} from '@bcs/api-client';
import {useAppTranslation} from './locale';
import {useLearnerDiscovery} from './learner-discovery';
import {StudentSetupForm,StudentSpaceCards} from './student-welcome';
import {ActionToast} from '../components/ui/action-toast';
import {RefreshButton} from '../components/ui/refresh-button';
import {FilterButton} from '../components/ui/filter-button';
type Snapshot=components['schemas']['LearnerSpaces'];
export function CreateSpacesCard({guardian=false}:{guardian?:boolean}){
 const {appText}=useAppTranslation();
 return <section className="create-spaces-card"><Plus size={26} aria-hidden="true"/><div><h2>{appText('Create spaces')}</h2><p>{appText('Create a subject space before searching for teachers for your learner. Everyone can still explore all teacher profiles.')}</p></div><FilterButton asChild accent><Link href={guardian?"/dashboard/learning-preferences":"/onboarding/student"}>{appText('Create spaces')}</Link></FilterButton></section>;
}
export function GuardianLearningSpaces({session}:{session:Session}){
 const {appText,appError}=useAppTranslation(),client=useQueryClient();
 const [editor,setEditor]=useState<{subject?:string;saved?:boolean}|null>(null);
 const family=useLearnerDiscovery(session,!editor),snapshot=family.spacesQuery.data;
 const [notice,setNotice]=useState({id:0,message:'',error:false});
 function notify(message:string,error=false){setNotice(current=>({id:current.id+1,message,error}));}
 const context:components['schemas']['StudentSetupContext']|null=snapshot?{learner:snapshot.learner,spacesVersion:snapshot.version,authority:'GUARDIAN_MANAGED' as const,progress:{kind:'STUDENT' as const,state:snapshot.spaces.length?'READY':'ACTIVE',draft:{spaces:snapshot.spaces,subjects:snapshot.spaces.map(space=>space.subject)},version:snapshot.version,completedResourceId:snapshot.spaces.length?snapshot.learner.id:null}}:null;
 return <div className="student-welcome"><ActionToast key={notice.id} message={notice.message?appText(notice.message):''} error={notice.error}/><header className="wizard-title"><h1>{appText('Learning preferences')}</h1><p>{appText('Create one space per subject, with its own language and learning preferences.')}</p></header>
  <div className="learner-search-context"><label htmlFor="space-learner">{appText('Choose learner')}</label><select id="space-learner" disabled={!!editor||family.transitioning} value={family.learner?.id||''} onChange={e=>{setEditor(null);family.select(e.target.value);}}><option value="">{appText('Choose learner')}</option>{family.learners.map(learner=><option key={learner.id} value={learner.id}>{learner.alias}</option>)}</select>{family.query.hasNextPage&&<FilterButton type="button" onClick={()=>family.query.fetchNextPage()} disabled={family.query.isFetchingNextPage}>{appText('Load more learners')}</FilterButton>}</div>
  {family.query.isPending||family.spacesQuery.isPending&&family.learner?<p role="status">{appText('Loading learner profiles…')}</p>:null}
  {(family.query.error||family.spacesQuery.error)&&<div role="alert"><p>{appError((family.query.error||family.spacesQuery.error)!.message)}</p><RefreshButton label={appText('Reload student setup')} onClick={()=>{void family.query.refetch();void family.spacesQuery.refetch();}}/></div>}
  {snapshot&&!snapshot.spaces.length&&<p className="student-space-guidance">{appText('Create a subject space before searching for teachers for this learner.')}</p>}
  {context&&!family.query.error&&!family.spacesQuery.error&&(editor?<StudentSetupForm key={family.learner?.id+':'+snapshot!.version+':'+editor.subject+':'+!!editor.saved} session={session} context={context} originalSubject={editor.subject} startSaved={!!editor.saved} readBlocked={family.spacesQuery.isFetching||family.query.isFetching} onReload={()=>family.spacesQuery.refetch()} onClose={()=>setEditor(null)} onDuplicate={()=>notify('You cannot change the subject because you have already created a space for it.',true)} saveSpaces={async(body,key)=>{
    const result=await api<Snapshot>(`/children/${context.learner.id}/learning-spaces`,{method:'POST',csrf:session.csrfToken,key,body:{expectedVersion:body.expectedVersion,educationVersion:body.educationVersion,confirmed:true,spaces:body.draft.spaces}});
    return {kind:'STUDENT',state:'READY',draft:{spaces:result.spaces,subjects:result.spaces.map(space=>space.subject)},version:result.version,completedResourceId:result.learner.id};
  }} onSaved={(progress,subject)=>{client.setQueryData<Snapshot>(['learner-spaces',session.account.id,context.learner.id],{learner:context.learner,version:progress.version,spaces:(progress.draft as components['schemas']['StudentLearningPreferences']).spaces||[]});setEditor({subject,saved:true});notify('Your student setup is saved.');}}/>:<StudentSpaceCards guardian context={context} disabled={family.transitioning||family.spacesQuery.isFetching||family.query.isFetching} onEdit={subject=>setEditor({subject})}/>)}
 </div>;
}
