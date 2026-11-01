import {writeFile,unlink} from 'node:fs/promises';import {spawnSync} from 'node:child_process';
const root=new URL('../exports/',import.meta.url);const list=new URL('concat.txt',root);
await writeFile(list,"file '01-intro.mp4'\nfile '02-simulation-walkthrough.mp4'\nfile '03-outro.mp4'\n");
try{const r=spawnSync('ffmpeg',['-y','-f','concat','-safe','0','-i',list.pathname,'-c','copy','-movflags','+faststart',new URL('ModMap-footage-preview.mp4',root).pathname],{stdio:'ignore'});if(r.status)throw Error('Assembly failed');}finally{await unlink(list)}
