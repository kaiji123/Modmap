import type {ChatEvent} from '../shared/types';
interface Line {user:string;name?:string;text:string;mentions?:string[];reply?:string}
const names:Record<string,string>={Kai:'Kai',luna:'luna',pixelpilot:'pixelpilot',cozycat:'cozycat',moss:'moss'};
const attack=(user:string,target:string):Line=>({user,text:`@${target} you are tr4sh at this game`,mentions:[target]});
const echo=(i:number)=>`echo_${String(i).padStart(2,'0')}`;
const ember=(i:number)=>`ember_${String(i).padStart(2,'0')}`;

export const seedLines:Line[]=[
 {user:'Kai',text:'Welcome in, everyone!'},
 {user:'luna',text:'@pixelpilot nice idea — what should we try next?',mentions:['pixelpilot']},
 {user:'pixelpilot',text:'@Kai great run!',mentions:['Kai']},
 {user:'cozycat',text:'@luna I liked your last suggestion.',reply:'luna'},
 {user:'moss',text:'@cozycat same here. Hello chat!',mentions:['cozycat']},
];
export const raidLines:Line[]=[
 // The first wave retains a fast shared-target alert for the demo.
 ...Array.from({length:6},(_,i)=>attack(echo(i+1),'Kai')),
 attack(ember(1),'luna'),
 {user:'cozycat',text:'@Kai @luna we are here with you.',mentions:['Kai','luna']},
 attack(echo(7),'Kai'),
 attack(ember(2),'luna'),
 {...attack(echo(1),'pixelpilot'),reply:'pixelpilot'},
 {user:'moss',text:'@echo_01 keep it kind please.',reply:echo(1)},
 attack(ember(3),'luna'),
 {user:echo(2),text:'@Kai @pixelpilot this is garbage',mentions:['Kai','pixelpilot']},
 attack(echo(8),'Kai'),
 attack(ember(4),'luna'),
 {user:'pixelpilot',text:'@luna thanks for sharing your idea.',reply:'luna'},
 attack(echo(3),'pixelpilot'),
 attack(ember(5),'luna'),
 {user:ember(1),text:'@echo_01 @echo_02 that take is stupid',mentions:[echo(1),echo(2)]},
 {user:'luna',text:'@Kai @cozycat thank you for helping.',mentions:['Kai','cozycat']},
 attack(echo(4),'Kai'),
 attack(ember(6),'luna'),
 {user:echo(5),text:'@ember_01 your take is garbage',reply:ember(1)},
 attack(echo(6),'pixelpilot'),
 attack(ember(2),'cozycat'),
 {user:'moss',text:'@pixelpilot that was a thoughtful suggestion.',reply:'pixelpilot'},
 attack(echo(7),'Kai'),
 attack(ember(3),'luna'),
 {user:echo(8),text:'@moss @cozycat you are trash',mentions:['moss','cozycat']},
 attack(echo(1),'Kai'),
 attack(ember(4),'luna'),
 {user:'cozycat',text:'@moss thanks for keeping chat welcoming.',reply:'moss'},
 attack(echo(2),'pixelpilot'),
 attack(ember(5),'luna'),
 {user:echo(3),text:'@ember_02 that is stupid',mentions:[ember(2)]},
 attack(echo(4),'Kai'),
 attack(ember(6),'luna'),
 {user:'Kai',text:'@luna @pixelpilot let’s focus on the next round.',mentions:['luna','pixelpilot']},
 attack(echo(5),'pixelpilot'),
 attack(echo(6),'Kai'),
 attack(ember(1),'cozycat'),
];
export function scenarioEvent(line:Line,id:string,ts:number):ChatEvent {
 const ids=(line.mentions??[]).map(user=>`sim:${user}`);
 const targets=[...(line.mentions??[]),...(line.reply?[line.reply]:[])];
 return {id:`sim:${id}`,userId:`sim:${line.user}`,userName:line.name??names[line.user]??line.user,text:line.text,
  mentions:ids,replyToUserId:line.reply?`sim:${line.reply}`:undefined,
  targetNames:Object.fromEntries(targets.map(target=>[`sim:${target}`,names[target]??target])),ts,simulated:true};
}
