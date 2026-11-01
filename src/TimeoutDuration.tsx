export const durations = [
  {value:60,label:'1 minute'}, {value:300,label:'5 minutes'},
  {value:600,label:'10 minutes'}, {value:3600,label:'1 hour'},
  {value:86400,label:'1 day'}, {value:1209600,label:'2 weeks'},
];
export function durationLabel(seconds:number):string {
  return durations.find(option=>option.value===seconds)?.label??`${seconds} seconds`;
}
export function TimeoutDuration({value,disabled,onChange}:{value:number;disabled:boolean;onChange:(value:number)=>void}) {
  return <label className="timeout-duration">Temporary ban duration<select value={value} disabled={disabled} onChange={event=>onChange(Number(event.target.value))}>
    {durations.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
  </select></label>;
}
