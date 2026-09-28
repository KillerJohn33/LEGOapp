// Read-only UI checks against a local page with synthetic collection data.
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const source=fs.readFileSync('index.html','utf8').replace(/<script src="[^"]+"><\/script>/g,'').replace('<script>','<script>const supabase={createClient:()=>({auth:{onAuthStateChange:()=>{}}})};').replace('initAuth();',fs.readFileSync('tools/ui-fixture.js','utf8'));
 fs.writeFileSync('.ui-preview.html',source);
 const browser=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9237',`--user-data-dir=${path.resolve('.edge-ui-review-cdp')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let ws;
 try{
  let targets;
  for(let i=0;i<40;i++){try{targets=await(await fetch('http://127.0.0.1:9237/json')).json();break}catch{await new Promise(r=>setTimeout(r,250))}}
  if(!targets)throw Error('Browser did not start');
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  let id=0;const pending=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const {resolve,reject}=pending.get(m.id);pending.delete(m.id);m.error?reject(Error(m.error.message)):resolve(m.result)}});
  const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
  await send('Page.enable');
  const errors=[];await send('Runtime.enable');ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text)});
  for(const width of [320,390,768,1024,1440]){
   await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<800});
   await send('Page.navigate',{url:pathToFileURL(path.resolve('.ui-preview.html')).href});await new Promise(r=>setTimeout(r,900));
   for(const theme of ['light','dark']){
    await send('Runtime.evaluate',{expression:`document.documentElement.dataset.theme='${theme}'`});
    await new Promise(r=>setTimeout(r,350));
    const check=await send('Runtime.evaluate',{expression:`JSON.stringify({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,cardVisible:getComputedStyle(document.querySelector('.card-body')).display!=='none',bulkHidden:getComputedStyle(document.getElementById('collection-bulk-bar')).display==='none',nav:getComputedStyle(document.querySelector('.mobile-bottom-nav')).display})`,returnByValue:true});
    const result=JSON.parse(check.result.value);console.log(theme,JSON.stringify(result));if(result.width!==width||result.overflow||!result.cardVisible||!result.bulkHidden)throw Error('Layout check failed');
    if(width===390||width===1440){const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(`ui-${width}-${theme}.png`,Buffer.from(shot.data,'base64'))}
   }
   for(const view of ['collection','wishlist','options','add','minifigs']){
    await send('Runtime.evaluate',{expression:`views.forEach(v=>document.getElementById('view-'+v).hidden=v!=='${view}');allWishlist=[{...allSets[0],priority:1,estimated_price:150}];renderWishlist();renderOptionsView();`});
    if(['collection','wishlist','minifigs'].includes(view)){
     const filters=await send('Runtime.evaluate',{expression:`(()=>{const panel=document.getElementById('${view}-filters');const button=document.querySelector('#view-${view} .mobile-filter-toggle');const visible=()=>getComputedStyle(panel).display!=='none';const initial=visible();let expanded=true,closed=true,retained=true;if(innerWidth<800){button.click();expanded=visible()&&button.getAttribute('aria-expanded')==='true';const input=panel.querySelector('input');const old=input.value;input.value='test';button.click();closed=!visible()&&button.getAttribute('aria-expanded')==='false';retained=input.value==='test';input.value=old;}return JSON.stringify({initial,expanded,closed,retained,buttonVisible:getComputedStyle(button).display!=='none',capsuleHeight:document.querySelector('.mobile-bottom-nav').getBoundingClientRect().height,labelsHidden:getComputedStyle(document.querySelector('.mobile-nav-btn span')).display==='none'});})()`,returnByValue:true});
     const f=JSON.parse(filters.result.value);if(f.initial!==(width>=800)||f.buttonVisible!==(width<800)||!f.expanded||!f.closed||!f.retained||(width<800&&(f.capsuleHeight>56||!f.labelsHidden)))throw Error('Filter/navigation check failed: '+view+' '+JSON.stringify(f));
    }
    const layout=await send('Runtime.evaluate',{expression:'JSON.stringify({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth})',returnByValue:true});
    const result=JSON.parse(layout.result.value);if(result.width!==width||result.overflow)throw Error(view+' overflow at '+width);
   }
   console.log('Additional views OK at '+width);
  }
  if(errors.length)throw Error(errors.join('; '));
  await send('Browser.close');
 }finally{ws?.close();browser.kill();fs.unlinkSync('.ui-preview.html')}
})().catch(e=>{console.error(e);process.exitCode=1});
