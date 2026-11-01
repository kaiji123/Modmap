import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
const runtime=join(root,'node_modules/node/bin/node');
const cli=join(root,'node_modules/hyperframes/bin/hyperframes.mjs');
const result=spawnSync(runtime,[cli,...process.argv.slice(2)],{cwd:root,stdio:'inherit',env:{...process.env,PATH:dirname(runtime)+':'+process.env.PATH,HYPERFRAMES_TELEMETRY_DISABLED:'1'}});
if(result.error)throw result.error;
process.exitCode=result.status??1;
