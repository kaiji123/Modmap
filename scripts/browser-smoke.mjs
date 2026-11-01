import assert from 'node:assert/strict';
import {utimesSync} from 'node:fs';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[],rootWarnings=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(/createRoot|same key|unique.*key/i.test(message.text()))rootWarnings.push(message.text());});
const counts=[];
try{
 await page.goto('http://127.0.0.1:3000');
 await page.locator('.connection').filter({hasText:'Server connected'}).waitFor();
 await page.locator('.graph .node').first().waitFor();
 assert.equal((await page.locator('.mode .tag').textContent())?.trim(),'SIMULATION');
 assert.equal(await page.locator('.autoban-panel').count(),1);
 assert.equal(await page.locator('.word-stats').count(),1);
 assert.equal(await page.locator('.autoban-panel form').count(),1);
 await page.locator('.autoban-words textarea').fill('trash');
 await page.getByLabel('Exclude known gift-givers',{exact:true}).check();
 await page.getByLabel('Exclude current subscribers',{exact:true}).check();
 await page.getByRole('button',{name:'Enable autoban',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.autoban-status')?.textContent.includes('Enabled'));
 await page.getByRole('button',{name:'Run raid simulation',exact:false}).click();
 for(let i=0;i<35;i++){
  counts.push(await page.locator('.autoban-panel form').count());
  assert.equal(counts.at(-1),1);
  assert.equal(await page.locator('.word-stats').count(),1);
  await page.waitForTimeout(200);
 }
 for(const file of ['src/App.tsx','src/main.tsx']){
  const now=new Date();utimesSync(new URL('../'+file,import.meta.url),now,now);
  await page.waitForTimeout(1800);
  await page.locator('.connection').filter({hasText:'Server connected'}).waitFor();
  assert.equal(await page.locator('.autoban-panel').count(),1);
 assert.equal(await page.locator('.word-stats').count(),1);
  assert.equal(await page.locator('.autoban-panel form').count(),1);
 }
 await page.getByRole('button',{name:'Disable autoban',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.autoban-status')?.textContent.includes('Disabled'));
 await page.getByRole('button',{name:'Reset demo',exact:false}).click();
 assert.deepEqual(errors,[]);assert.deepEqual(rootWarnings,[]);
 if(process.env.MODMAP_SCREENSHOT)await page.screenshot({path:process.env.MODMAP_SCREENSHOT,fullPage:true});
 console.log(JSON.stringify({formsAfterUpdates:1,formsAfterAppHotReload:1,formsAfterEntryHotReload:1,pageErrors:errors.length,duplicateRootWarnings:rootWarnings.length,samples:counts.length}));
}finally{await browser.close();}
