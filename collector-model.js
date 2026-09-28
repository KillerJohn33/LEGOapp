/* Pure validation/calculation helpers shared by browser and Node tests. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.CollectorModel=api;})(globalThis,()=>{
  'use strict';
  const fields={
    sets:['set_num','name','year','theme_name','num_parts','img_url','quantity','condition','build_status','price_paid','current_value','purchase_date','notes','created_at'],
    minifigs:['fig_num','name','img_url','quantity','condition','price_paid','owned_set_id','created_at'],
    wishlist:['set_num','name','year','theme_name','num_parts','img_url','estimated_price','priority','created_at'],
  };
  const tables={sets:'owned_sets',minifigs:'minifigs',wishlist:'wishlist'};
  const moneyKeys=new Set(['price_paid','current_value','estimated_price']);
  function money(v){if(v==null||v==='')return null;const n=Number(v);if(!Number.isFinite(n)||n<0||n>1e9)throw Error('Montant invalide.');return Math.round(n*100)/100;}
  function text(v,max=4000){if(v==null)return '';if(typeof v!=='string'||v.length>max)throw Error('Texte invalide ou trop long.');return v;}
  function imageURL(v){if(!v)return '';try{const u=new URL(v);if(u.protocol==='https:')return u.href;}catch{}throw Error('Adresse d’image invalide.');}
  function date(v){if(!v)return null;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)throw Error('Date invalide.');return v;}
  function preferences(v={}){
    return {budget:money(v.budget),dashboard:Object.fromEntries(['sets','pieces','value','minifigs','summary','latest','shortcuts','news'].map(k=>[k,v.dashboard?.[k]!==false]))};
  }
  function details(v={}){
    const tri=x=>x===true?true:x===false?false:null;
    const photos=Array.isArray(v.photos)?v.photos:[];
    if(photos.length>8)throw Error('Maximum : 8 photos par set.');
    return {box_present:tri(v.box_present),manual_present:tri(v.manual_present),missing_parts:text(v.missing_parts),missing_minifigs:text(v.missing_minifigs),photos:photos.map(p=>{
      const out={id:text(p.id,100),path:text(p.path,400),caption:text(p.caption,200)};
      if(p.data){if(typeof p.data!=='string'||p.data.length>7e6||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p.data))throw Error('Photo de sauvegarde invalide.');out.data=p.data;}
      return out;
    })};
  }
  function wish(v={}){return {target_price:money(v.target_price),planned:v.planned===true};}
  function purchase(v={}){
    const quantity=Number(v.quantity);if(!Number.isInteger(quantity)||quantity<1||quantity>100000)throw Error('Quantité d’achat invalide.');
    return {set_id:text(v.set_id,200),set_num:text(v.set_num,100),name:text(v.name,500),store:text(v.store,200),date:date(v.date),quantity,unit_price:money(v.unit_price),shipping:money(v.shipping)??0,notes:text(v.notes)};
  }
  function purchaseTotal(p){return Math.round(((p.unit_price??0)*p.quantity+(p.shipping??0))*100)/100;}
  function budget(items,docs,budget){let total=0,selected=0,unknown=0;for(const item of items){const d=docs[item.id]||{};const p=d.target_price??item.estimated_price;if(p!=null)total+=Math.round(Number(p)*100);if(d.planned){if(p==null)unknown++;else selected+=Math.round(Number(p)*100);}}return {total:total/100,selected:selected/100,unknown,remaining:budget==null?null:Math.round(budget*100-selected)/100};}
  function normalize(input){
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Sauvegarde JSON invalide.');
    if(input.version!=null&&![1,2].includes(input.version))throw Error('Version de sauvegarde non prise en charge.');
    const out={version:2,sets:[],minifigs:[],wishlist:[],documents:[]};let count=0;
    for(const kind of Object.keys(fields)){
      if(!Array.isArray(input[kind]))throw Error(`La liste ${kind} est manquante.`);
      const ids=new Set();
      out[kind]=input[kind].map((raw,i)=>{
        if(!raw||typeof raw!=='object')throw Error('Fiche invalide.');
        const id=raw.id==null?`${kind}-${i}`:String(raw.id);if(id.length>200||ids.has(id))throw Error('Identifiant de sauvegarde dupliqué.');ids.add(id);
        const row={id};
        for(const k of fields[kind])if(Object.hasOwn(raw,k)){
          const v=raw[k];if(v==null){row[k]=null;continue;}
          if(moneyKeys.has(k))row[k]=money(v);
          else if(['quantity','year','num_parts','priority'].includes(k)){const n=Number(v);if(!Number.isInteger(n)||n<0||n>1e7)throw Error('Nombre invalide.');row[k]=n;}
          else if(k==='img_url')row[k]=imageURL(v);
          else if(k==='purchase_date')row[k]=date(v);
          else row[k]=text(String(v),k==='notes'?10000:500);
        }
        if(!row.name||!(kind==='minifigs'?row.fig_num:row.set_num))throw Error('Nom ou référence manquant.');
        if(kind!=='wishlist'){row.quantity??=1;if(row.quantity<1)throw Error('Quantité invalide.');row.condition??='neuf';if(!['neuf','occasion'].includes(row.condition))throw Error('État invalide.');}
        if(kind==='sets'){row.build_status??='expose';if(!['boite','expose'].includes(row.build_status))throw Error('Statut invalide.');}
        if(kind==='wishlist'){row.priority??=2;if(![1,2,3].includes(row.priority))throw Error('Priorité invalide.');}
        if(row.created_at&&!Number.isFinite(Date.parse(row.created_at)))throw Error('Date d’enregistrement invalide.');
        count++;return row;
      });
    }
    const ids=new Set();
    for(const d of input.documents||[]){
      if(!['set','wishlist','purchase','preferences'].includes(d.kind))throw Error('Détail de sauvegarde inconnu.');
      const entry_id=text(String(d.entry_id),200),key=d.kind+':'+entry_id;if(ids.has(key))throw Error('Détail dupliqué.');ids.add(key);
      const value=({set:details,wishlist:wish,purchase,preferences})[d.kind](d.value);
      out.documents.push({kind:d.kind,entry_id,value});count++;
    }
    if(count>10000)throw Error('Maximum : 10 000 fiches par restauration.');
    return out;
  }
  function plan(backup,current,mode='skip',uuid=()=>crypto.randomUUID()){
    if(!['skip','replace','copy'].includes(mode))throw Error('Mode de restauration invalide.');
    const operations=[],preview=[],maps={sets:{},wishlist:{},minifigs:{}},skipped=new Set();
    for(const kind of ['sets','wishlist','minifigs']){
      const used=new Set();
      for(const source of backup[kind]){
        const ref=kind==='minifigs'?'fig_num':'set_num';
        const candidates=(current[kind]||[]).filter(x=>x[ref]===source[ref]&&!used.has(String(x.id)));
        const exact=candidates.find(x=>String(x.id)===source.id);
        if(!exact&&candidates.length>1&&mode==='replace')throw Error(`Plusieurs fiches pour ${source[ref]} : choisissez « Conserver » ou « Copier ».`);
        const match=exact||candidates[0];
        const action=match&&mode==='skip'?'skip':match&&mode==='replace'?'update':'insert';
        const id=action==='insert'?uuid():String(match.id);maps[kind][source.id]=id;if(match&&mode!=='copy')used.add(String(match.id));
        preview.push({kind,reference:source[ref],name:source.name,action});
        if(action==='skip'){skipped.add(kind+':'+source.id);continue;}
        const row={...source,id};
        if(kind==='minifigs'&&source.owned_set_id){row.owned_set_id=maps.sets[String(source.owned_set_id)]||null;if(!row.owned_set_id)throw Error('Une figurine référence un set absent de la sauvegarde.');}
        operations.push({table:tables[kind],action,row,...(match&&action==='update'?{expected:match}:{})});
      }
    }
    for(const d of backup.documents){
      const group=d.kind==='set'?'sets':d.kind==='wishlist'?'wishlist':null;
      if(group&&skipped.has(group+':'+d.entry_id))continue;
      const value=structuredClone(d.value);
      const entry_id=group?maps[group][d.entry_id]:d.kind==='preferences'?'main':mode==='copy'?uuid():d.entry_id;
      if(!entry_id)throw Error('Un détail référence une fiche absente.');
      if(d.kind==='purchase'&&value.set_id)value.set_id=maps.sets[value.set_id]||'';
      const match=(current.documents||[]).find(x=>x.kind===d.kind&&x.entry_id===entry_id);
      if(match&&mode==='skip')continue;
      operations.push({table:'collector_documents',action:match?'update':'insert',row:{kind:d.kind,entry_id,value},...(match?{expected:match}:{})});
    }
    return {operations,preview,counts:{insert:operations.filter(x=>x.action==='insert').length,update:operations.filter(x=>x.action==='update').length,skip:preview.filter(x=>x.action==='skip').length}};
  }
  return {money,date,details,wish,purchase,purchaseTotal,budget,preferences,normalize,plan};
});
