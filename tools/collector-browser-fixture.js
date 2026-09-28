const fixtureSets=[{id:'11111111-1111-4111-8111-111111111111',user_id:'preview',set_num:'10316-1',name:'Fondcombe',year:2023,theme_name:'Icons',num_parts:6167,img_url:'favicon-square.svg',quantity:1,condition:'neuf',build_status:'expose',price_paid:499.99,current_value:540,purchase_date:'2026-01-03',notes:'Exposé'}];
const fixtureFigs=[{id:'22222222-2222-4222-8222-222222222222',user_id:'preview',fig_num:'fig-1',name:'Frodon',img_url:'favicon-square.svg',quantity:1,condition:'neuf',owned_set_id:fixtureSets[0].id}];
const fixtureWishes=[{id:'33333333-3333-4333-8333-333333333333',user_id:'preview',set_num:'21348-1',name:'Donjons & Dragons',year:2024,img_url:'favicon-square.svg',estimated_price:360,priority:1}];
const fixtureDocs=[{user_id:'preview',kind:'set',entry_id:fixtureSets[0].id,value:{box_present:true,manual_present:true,missing_parts:'',missing_minifigs:'',photos:[]},updated_at:new Date().toISOString()},{user_id:'preview',kind:'wishlist',entry_id:fixtureWishes[0].id,value:{target_price:320,planned:true},updated_at:new Date().toISOString()},{user_id:'preview',kind:'preferences',entry_id:'main',value:{budget:400,dashboard:{}},updated_at:new Date().toISOString()}];
const tables={owned_sets:fixtureSets,minifigs:fixtureFigs,wishlist:fixtureWishes,collector_documents:fixtureDocs,app_settings:[]};
function query(table){let rows=tables[table]||[],single=false,head=false,count=false;const api={
 select(_fields,opts={}){head=!!opts.head;count=opts.count==='exact';return api},order(){return api},limit(){return api},or(){return api},in(){return api},
 eq(field,value){rows=rows.filter(x=>String(x[field])===String(value));return api},
 insert(value){const add=Array.isArray(value)?value:[value];rows.push(...add);tables[table]=rows;return api},
 update(value){rows.forEach(x=>Object.assign(x,value));return api},delete(){return api},
 upsert(value){const found=rows.find(x=>x.kind===value.kind&&x.entry_id===value.entry_id);if(found)Object.assign(found,value);else rows.push(value);return api},
 single(){single=true;return api},
 then(resolve){resolve({data:head?null:single?(rows[0]||null):rows,error:null,count:count?rows.length:null})}
};return api;}
window.supabase={createClient:()=>({from:query,auth:{getSession:async()=>({data:{session:{user:{id:'preview',email:'preview@example.com'}}}}),onAuthStateChange:()=>{},signOut:async()=>{},updateUser:async()=>({data:{user:{id:'preview'}},error:null})},storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'favicon-square.svg'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null}),download:async()=>({data:new Blob(),error:null})})},rpc:async()=>({data:1,error:null})})};
window.fetch=async url=>String(url).includes('rebrickable.com')?new Response(JSON.stringify({results:[]}),{status:200,headers:{'Content-Type':'application/json'}}):new Response('',{status:404});
