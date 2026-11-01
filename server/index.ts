import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import { Engine } from '../shared/engine';
import type { ChatEvent } from '../shared/types';
const app=express(),http=createServer(app),io=new Server(http),engine=new Engine();
let timer:ReturnType<typeof setInterval>|undefined;
const publish=()=>io.emit('snapshot',engine.snapshot(Date.now(),Boolean(timer)));
const ingest=(e:ChatEvent)=>{engine.ingest(e);publish();};
function stop(){if(timer)clearInterval(timer);timer=undefined;}
function seed(){const ts=Date.now();['Kai','luna','pixelpilot','cozycat','moss'].forEach((name,i)=>ingest({id:randomUUID(),userId:`sim:${name}`,userName:name,text:['Welcome in, everyone!','Love this stream','@Kai great run!','That was close!','Hello chat'][i],mentions:i===2?['sim:Kai']:[],ts:ts+i,simulated:true}));}
seed();
io.on('connection',socket=>{
 socket.emit('snapshot',engine.snapshot(Date.now(),Boolean(timer)));
 socket.on('simulate',()=>{if(timer)return;let index=0;const raid=Date.now();timer=setInterval(()=>{index++;ingest({id:randomUUID(),userId:`sim:raid-${raid}-${index%12}`,userName:`echo_${String(index%12+1).padStart(2,'0')}`,text:'@Kai you are tr4sh at this game',replyToUserId:index%2?'sim:Kai':undefined,mentions:['sim:Kai'],ts:Date.now(),simulated:true});if(index>=25){stop();publish();}},800);publish();});
 socket.on('reset',()=>{stop();engine.reset();seed();publish();});
 socket.on('reveal',(id:unknown,reply:unknown)=>{if(typeof id!=='string'||typeof reply!=='function')return;reply({text:engine.reveal(id)});publish();});
});
app.get('/api/health',(_req,res)=>res.json({ok:true,mode:'simulation'}));
app.use(express.static('dist'));
setInterval(publish,1000).unref();
http.listen(3001,'127.0.0.1',()=>console.log('ModMap server: http://127.0.0.1:3001 (simulation only)'));
