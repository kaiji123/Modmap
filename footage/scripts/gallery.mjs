import {chromium} from '../../node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const out=new URL('../../submission/gallery/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
try{
 await page.goto('http://127.0.0.1:3000');await page.locator('.connection').filter({hasText:'Server connected'}).waitFor();
 if((await page.locator('.mode .tag').textContent())?.trim()!=='SIMULATION')throw Error('Refusing to capture outside simulation mode');
 await page.getByRole('button',{name:'Run raid simulation',exact:false}).click();await page.waitForTimeout(36000);
 await page.locator('.workspace').evaluate(el=>el.scrollIntoView({block:'start'}));await page.waitForTimeout(500);
 await page.screenshot({path:new URL('01-network-map.png',out).pathname});
 await page.locator('.node[aria-label^="echo_01,"]').click();await page.waitForTimeout(400);
 await page.screenshot({path:new URL('02-chatter-context.png',out).pathname});
 await page.getByRole('button',{name:'Select toxic users',exact:true}).click();await page.waitForTimeout(400);
 const gifts=page.getByRole('button',{name:/^Unselect gift-givers/});if(await gifts.count()&&await gifts.isEnabled())await gifts.click();
 const subs=page.getByRole('button',{name:/^Unselect current subs/});if(await subs.count()&&await subs.isEnabled())await subs.click();
 await page.waitForTimeout(400);await page.screenshot({path:new URL('03-review-and-support.png',out).pathname});
 await page.getByRole('button',{name:/^Ban selected/}).click();await page.waitForTimeout(7500);
 await page.screenshot({path:new URL('04-simulated-action-results.png',out).pathname});
 await page.locator('.autoban-panel').scrollIntoViewIfNeeded();await page.waitForTimeout(300);
 await page.screenshot({path:new URL('05-autoban-controls.png',out).pathname});
 await page.getByRole('button',{name:'Reset demo',exact:false}).click();
 await writeFile(new URL('capture.json',out),JSON.stringify({mode:'simulation',capturedAt:new Date().toISOString(),files:['01-network-map.png','02-chatter-context.png','03-review-and-support.png','04-simulated-action-results.png','05-autoban-controls.png']},null,2));
}finally{await browser.close()}
console.log('Captured five screenshots in submission/gallery (simulation mode).');
