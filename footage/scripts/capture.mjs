import {chromium} from '../../node_modules/playwright/index.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url);await mkdir(new URL('assets/raw/',root),{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1920,height:1080},recordVideo:{dir:new URL('assets/raw/',root).pathname,size:{width:1920,height:1080}}});
const page=await context.newPage();const start=Date.now();const marks={};
try{
 await page.goto('http://127.0.0.1:3000');await page.locator('.connection').filter({hasText:'Server connected'}).waitFor();
 await page.getByRole('button',{name:'Run raid simulation',exact:false}).click();
 await page.waitForTimeout(35000);
 await page.locator('.workspace').evaluate(el=>el.scrollIntoView({block:'start'}));
 marks.walkthrough=(Date.now()-start)/1000;await page.screenshot({path:new URL('assets/network.png',root).pathname});
 await page.waitForTimeout(3000);
 await page.locator('.node').filter({has:page.locator('text')}).first().count();
 await page.locator('.node[aria-label^="echo_01,"]').click();await page.waitForTimeout(4000);
 await page.getByRole('button',{name:'Select toxic users',exact:true}).click();await page.waitForTimeout(3000);
 const gifters=page.getByRole('button',{name:/^Unselect gift-givers/});if(await gifters.count())await gifters.click();
 await page.waitForTimeout(2000);
 const subs=page.getByRole('button',{name:/^Unselect current subs/});if(await subs.count())await subs.click();
 await page.waitForTimeout(2000);
 await page.getByRole('button',{name:/^Ban selected/}).click();await page.waitForTimeout(8500);
 marks.end=(Date.now()-start)/1000;
 await page.screenshot({path:new URL('assets/after-actions.png',root).pathname});
 await writeFile(new URL('assets/capture.json',root),JSON.stringify(marks,null,2));
}finally{const video=page.video();await context.close();await video.saveAs(new URL('assets/walkthrough-raw.webm',root).pathname);await browser.close();}
console.log(JSON.stringify(marks));
