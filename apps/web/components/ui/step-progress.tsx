import type {CSSProperties} from "react";
import {Check} from "lucide-react";

export function StepProgress({steps,currentStep,label}:{steps:readonly string[];currentStep:number|null;label:string}){
 return <ol className="step-progress" aria-label={label} data-many={steps.length>3} style={{"--step-count":steps.length} as CSSProperties}>
  {steps.map((step,index)=>{
   const complete=currentStep!==null&&index<currentStep,active=index===currentStep;
   return <li key={step} data-active={active} data-state={currentStep===null?"paused":complete?"complete":active?"current":"upcoming"} aria-current={active?"step":undefined}>
    <span className="step-progress-marker" aria-hidden="true">{complete?<Check size={14}/>:index+1}</span>{step}
   </li>;
  })}
 </ol>;
}
