(function(){
'use strict';
const M=CollectorModel,BUCKET='collection-photos';
const docs=new Map();let docsReady=false,featureError=null,importBackup=null,importPlan=null;
const key=(kind,id)=>`${kind}:${id}`;
const doc=(kind,id)=>docs.get(key(kind,String(id)))?.value||{};
const esc=value=>escapeHtml(value==null?'':String(value));
const message=(el,text,error=false)=>{el.textContent=text;el.className=`collector-status ${error?'error-text':'success-text'}`;};

async function loadDocuments(force=false){
  if(docsReady&&!force)return true;
  const {data,error}=await sb.from('collector_documents').select('*').order('updated_at',{ascending:false});
  if(error){featureError=error;docsReady=false;return false;}
  docs.clear();for(const row of data||[])docs.set(key(row.kind,row.entry_id),row);
  docsReady=true;featureError=null;return true;
}
async function saveDocument(kind,entryId,value){
  if(!currentUser)throw Error('Connexion requise.');
  const clean=({set:M.details,wishlist:M.wish,purchase:M.purchase,preferences:M.preferences})[kind](value);
  const row={user_id:currentUser.id,kind,entry_id:String(entryId),value:clean,updated_at:new Date().toISOString()};
  const {data,error}=await sb.from('collector_documents').upsert(row,{onConflict:'user_id,kind,entry_id'}).select().single();
  if(error)throw error;docs.set(key(kind,entryId),data);docsReady=true;return clean;
}
async function removeDocument(kind,entryId){
  const {error}=await sb.from('collector_documents').delete().eq('kind',kind).eq('entry_id',String(entryId));
  if(error)throw error;docs.delete(key(kind,entryId));
}
function migrationHint(error=featureError){
  return error?.message?.includes('collector_documents')||error?.code==='42P01'
    ? 'Les nouvelles fonctions attendent la migration Supabase collector_features.'
    : (error?.message||'Fonction indisponible pour le moment.');
}
function uuid(){if(crypto.randomUUID)return crypto.randomUUID();const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const h=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
function blobToDataURL(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});}
async function resizePhoto(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choisis une image JPEG, PNG ou WebP.');
  if(file.size>12*1024*1024)throw Error('La photo source dépasse 12 Mo.');
  let source,width,height,cleanup=()=>{};
  if('createImageBitmap'in window){source=await createImageBitmap(file);width=source.width;height=source.height;cleanup=()=>source.close();}
  else{const url=URL.createObjectURL(file);source=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Lecture de la photo impossible.'));img.src=url;});width=source.naturalWidth;height=source.naturalHeight;cleanup=()=>URL.revokeObjectURL(url);}
  const max=1800,scale=Math.min(1,max/Math.max(width,height)),canvas=document.createElement('canvas');canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
  canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);cleanup();
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Compression impossible.')),'image/jpeg',.86));
}
async function photoURL(photo,seconds=3600){
  if(photo.data)return photo.data;
  const {data,error}=await sb.storage.from(BUCKET).createSignedUrl(photo.path,seconds);
  if(error)throw error;return data.signedUrl;
}

function detailPanel(item){
  const d=M.details(doc('set',item.id));
  const tri=(name,label,value)=>`<label class="field">${label}<select name="${name}"><option value="">Non renseigné</option><option value="yes" ${value===true?'selected':''}>Oui</option><option value="no" ${value===false?'selected':''}>Non</option></select></label>`;
  return `<section class="panel collector-panel" id="collector-set-details" data-set-id="${esc(item.id)}">
    <h3>État détaillé et photos</h3>
    <form class="collector-form" id="collector-detail-form" data-write>
      ${tri('box_present','Boîte présente',d.box_present)}${tri('manual_present','Notice présente',d.manual_present)}
      <label class="field wide">Pièces manquantes<textarea name="missing_parts" rows="2" placeholder="Ex. 2 pièces grises 1×2">${esc(d.missing_parts)}</textarea></label>
      <label class="field wide">Figurines manquantes<textarea name="missing_minifigs" rows="2" placeholder="Indique les figurines absentes">${esc(d.missing_minifigs)}</textarea></label>
      <div class="collector-actions wide"><button class="btn btn-secondary" type="submit">Enregistrer l’état</button><span class="collector-status"></span></div>
    </form>
    <div class="collector-photos" id="collector-photo-list"><p class="muted">Chargement des photos…</p></div>
    <form class="collector-form" id="collector-photo-form" data-write>
      <label class="field wide">Ajouter une photo personnelle<input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required></label>
      <label class="field wide">Légende<input name="caption" maxlength="200" placeholder="Ex. Montage exposé dans le salon"></label>
      <div class="collector-actions wide"><button class="btn btn-secondary" type="submit">Importer la photo</button><span class="collector-status"></span></div>
    </form>
    <h3>Enregistrer un achat</h3>
    <form class="collector-form" id="collector-purchase-form" data-write>
      <label class="field">Magasin<input name="store" maxlength="200" placeholder="LEGO Store, Amazon…"></label>
      <label class="field">Date<input type="date" name="date" value="${esc(item.purchase_date||new Date().toISOString().slice(0,10))}"></label>
      <label class="field">Quantité<input type="number" name="quantity" min="1" value="1" required></label>
      <label class="field">Prix unitaire (€)<input type="number" name="unit_price" min="0" step="0.01" value="${item.price_paid??''}"></label>
      <label class="field">Livraison (€)<input type="number" name="shipping" min="0" step="0.01" value="0"></label>
      <label class="field wide">Notes<textarea name="notes" rows="2"></textarea></label>
      <div class="collector-actions wide"><button class="btn btn-secondary" type="submit">Ajouter à l’historique</button><span class="collector-status"></span></div>
    </form>
  </section>`;
}
async function renderPhotos(item){
  const el=document.getElementById('collector-photo-list');if(!el)return;
  const d=M.details(doc('set',item.id));
  if(!d.photos.length){el.innerHTML='<p class="muted">Aucune photo personnelle.</p>';return;}
  const rendered=[];
  for(const photo of d.photos){
    try{rendered.push(`<figure data-photo="${esc(photo.id)}"><img src="${esc(await photoURL(photo))}" alt="${esc(photo.caption||item.name)}"><figcaption>${esc(photo.caption||'Photo personnelle')}</figcaption><button type="button" class="btn btn-danger-outline collector-photo-delete" data-write>Supprimer</button></figure>`);}catch{rendered.push('<figure><div class="showcase-empty">Photo indisponible</div></figure>');}
  }
  el.innerHTML=rendered.join('');
  el.querySelectorAll('.collector-photo-delete').forEach(button=>button.addEventListener('click',async()=>{
    button.disabled=true;const id=button.closest('figure').dataset.photo,current=M.details(doc('set',item.id)),photo=current.photos.find(p=>p.id===id);
    try{if(photo?.path){const {error}=await sb.storage.from(BUCKET).remove([photo.path]);if(error)throw error;}current.photos=current.photos.filter(p=>p.id!==id);await saveDocument('set',item.id,current);await renderPhotos(item);}catch(error){button.disabled=false;showToast(error.message||String(error));}
  }));
}
function bindDetailPanel(item){
  const form=document.getElementById('collector-detail-form'),photoForm=document.getElementById('collector-photo-form'),purchaseForm=document.getElementById('collector-purchase-form');
  if(!form)return;
  form.addEventListener('submit',async event=>{event.preventDefault();const status=form.querySelector('.collector-status'),fd=new FormData(form);
    try{await saveDocument('set',item.id,{...doc('set',item.id),box_present:fd.get('box_present')==='yes'?true:fd.get('box_present')==='no'?false:null,manual_present:fd.get('manual_present')==='yes'?true:fd.get('manual_present')==='no'?false:null,missing_parts:fd.get('missing_parts'),missing_minifigs:fd.get('missing_minifigs')});message(status,'État enregistré.');}catch(error){message(status,migrationHint(error),true);}
  });
  photoForm.addEventListener('submit',async event=>{event.preventDefault();const status=photoForm.querySelector('.collector-status'),button=photoForm.querySelector('button'),fd=new FormData(photoForm),file=fd.get('photo');button.disabled=true;
    try{const blob=await resizePhoto(file),id=uuid(),path=`${currentUser.id}/${item.id}/${id}.jpg`;const {error}=await sb.storage.from(BUCKET).upload(path,blob,{contentType:'image/jpeg',upsert:false});if(error)throw error;const current=M.details(doc('set',item.id));current.photos.push({id,path,caption:String(fd.get('caption')||'')});try{await saveDocument('set',item.id,current);}catch(error){await sb.storage.from(BUCKET).remove([path]);throw error;}photoForm.reset();message(status,'Photo ajoutée.');await renderPhotos(item);}catch(error){message(status,migrationHint(error),true);}finally{button.disabled=false;}
  });
  purchaseForm.addEventListener('submit',async event=>{event.preventDefault();const status=purchaseForm.querySelector('.collector-status'),fd=new FormData(purchaseForm);
    try{const value=M.purchase({set_id:String(item.id),set_num:item.set_num,name:item.name,store:fd.get('store'),date:fd.get('date'),quantity:fd.get('quantity'),unit_price:fd.get('unit_price'),shipping:fd.get('shipping'),notes:fd.get('notes')});await saveDocument('purchase',uuid(),value);message(status,`Achat ajouté : ${eur(M.purchaseTotal(value))}.`);purchaseForm.reset();renderPurchaseHistory();}catch(error){message(status,migrationHint(error),true);}
  });
  renderPhotos(item);
}

function renderPurchaseHistory(){
  const el=document.getElementById('collector-purchase-history');if(!el)return;
  const rows=[...docs.values()].filter(x=>x.kind==='purchase').sort((a,b)=>(b.value.date||'').localeCompare(a.value.date||''));
  if(!docsReady){el.innerHTML=`<p class="error-text">${esc(migrationHint())}</p>`;return;}
  if(!rows.length){el.innerHTML='<p class="muted">Aucun achat enregistré.</p>';return;}
  el.innerHTML=rows.map(row=>`<article class="purchase-row"><div><h4>${esc(row.value.name||row.value.set_num)}</h4><p>${esc(row.value.store||'Magasin non renseigné')} · ${esc(row.value.date||'Date non renseignée')} · ×${row.value.quantity}</p><p class="muted">${esc(row.value.notes||'')}</p></div><div><strong>${eur(M.purchaseTotal(row.value))}</strong><br><button type="button" class="btn btn-danger-outline purchase-delete" data-id="${esc(row.entry_id)}" data-write>Supprimer</button></div></article>`).join('');
  el.querySelectorAll('.purchase-delete').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try{await removeDocument('purchase',button.dataset.id);renderPurchaseHistory();}catch(error){button.disabled=false;showToast(error.message||String(error));}}));
}

function renderWishlistEnhancements(){
  const content=document.getElementById('wishlist-content');if(!content)return;
  let summary=document.getElementById('wishlist-budget-summary');if(!summary){summary=document.createElement('section');summary.id='wishlist-budget-summary';summary.className='panel collector-panel';content.before(summary);}
  const pref=M.preferences(doc('preferences','main')),byId={};for(const row of docs.values())if(row.kind==='wishlist')byId[row.entry_id]=row.value;
  const calc=M.budget(allWishlist,byId,pref.budget);
  summary.innerHTML=`<h3>Budget des prochains achats</h3><div class="budget-summary"><div><span class="muted">Tous les souhaits</span><br><strong>${eur(calc.total)}</strong></div><div><span class="muted">Sélection</span><br><strong>${eur(calc.selected)}</strong></div><div><span class="muted">Reste du budget</span><br><strong>${calc.remaining==null?'—':eur(calc.remaining)}</strong></div></div>${calc.unknown?`<p class="muted">${calc.unknown} prix cible manquant(s) dans la sélection.</p>`:''}`;
  content.querySelectorAll('.wishlist-row').forEach(row=>{const item=allWishlist.find(x=>String(x.id)===row.dataset.id);if(!item)return;const d=M.wish(byId[item.id]);const controls=document.createElement('div');controls.className='wishlist-plan';controls.dataset.write='';controls.innerHTML=`<label class="field">Prix cible (€)<input type="number" min="0" step="0.01" value="${d.target_price??item.estimated_price??''}"></label><label class="collector-check"><input type="checkbox" ${d.planned?'checked':''}> Prochain achat</label><button type="button" class="btn btn-outline">Enregistrer</button><span class="collector-status"></span>`;row.append(controls);controls.querySelector('button').addEventListener('click',async event=>{event.stopPropagation();const status=controls.querySelector('.collector-status');try{await saveDocument('wishlist',item.id,{target_price:controls.querySelector('input[type=number]').value,planned:controls.querySelector('input[type=checkbox]').checked});message(status,'Enregistré.');renderWishlistEnhancements();}catch(error){message(status,migrationHint(error),true);}});controls.addEventListener('click',e=>e.stopPropagation());});
}

const dashboardLabels={sets:'Sets possédés',pieces:'Pièces au total',value:'Valeur estimée',minifigs:'Minifigs',summary:'Résumé dépenses/souhaits',latest:'Dernier set ajouté',shortcuts:'Raccourcis',news:'Nouveautés LEGO'};
function populatePreferences(){
  const el=document.getElementById('collector-dashboard-fields');if(!el)return;const p=M.preferences(doc('preferences','main'));document.getElementById('collector-budget').value=p.budget??'';
  el.innerHTML=Object.entries(dashboardLabels).map(([name,label])=>`<label class="collector-check"><input type="checkbox" name="${name}" ${p.dashboard[name]?'checked':''}> ${label}</label>`).join('');
}
function applyDashboardPreferences(){
  const root=document.getElementById('dashboard-content');if(!root)return;const p=M.preferences(doc('preferences','main')),tiles=root.querySelectorAll('.stats-grid .brick-stat');
  ['sets','pieces','value','minifigs'].forEach((name,i)=>{if(tiles[i])tiles[i].hidden=!p.dashboard[name];});
  [['.mini-stat-row','summary'],['.highlight-banner','latest'],['.quick-actions','shortcuts'],['.section-highlight','news'],['.news-scroll','news']].forEach(([selector,name])=>root.querySelectorAll(selector).forEach(el=>el.hidden=!p.dashboard[name]));
}
async function renderShowcase(){
  const el=document.getElementById('showcase-content');el.innerHTML='<p class="muted">Chargement…</p>';
  if(!allSets.length&&navigator.onLine){const result=await sb.from('owned_sets').select('*').order('created_at',{ascending:false});if(!result.error)allSets=result.data||[];}
  await loadDocuments();document.getElementById('showcase-count').textContent=`${allSets.length} fiche(s)`;
  const cards=[];for(const item of allSets){const d=M.details(doc('set',item.id)),photo=d.photos[0];let src=item.img_url||'',personal=false;if(photo)try{src=await photoURL(photo);personal=true;}catch{}
    cards.push(`<figure class="showcase-card ${personal?'personal':''}">${src?`<img src="${esc(src)}" alt="${esc(item.name)}">`:'<div class="showcase-empty">Aucune image</div>'}<figcaption><h3>${esc(item.name)}</h3><p>${esc(item.set_num)} · ${item.year||'Année inconnue'}${item.theme_name?' · '+esc(item.theme_name):''}</p></figcaption></figure>`);}
  el.innerHTML=cards.join('')||'<div class="showcase-empty">Ta vitrine est vide.</div>';
}

function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open('briquotheque-offline',1);req.onupgradeneeded=()=>req.result.createObjectStore('data');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function localSet(value){const db=await openDB();await new Promise((resolve,reject)=>{const tx=db.transaction('data','readwrite');tx.objectStore('data').put(value,'snapshot');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}
async function localGet(){const db=await openDB();const value=await new Promise((resolve,reject)=>{const req=db.transaction('data').objectStore('data').get('snapshot');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});db.close();return value;}
async function localDelete(){const db=await openDB();await new Promise((resolve,reject)=>{const tx=db.transaction('data','readwrite');tx.objectStore('data').delete('snapshot');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}
function offlineBanner(date){return `<div class="offline-banner">Mode hors connexion · copie du ${new Date(date).toLocaleString('fr-FR')}. Les modifications sont désactivées.</div>`;}
async function showOffline(name){
  const snap=await localGet();if(!snap)return false;document.documentElement.classList.add('offline-readonly');
  allSets=snap.sets||[];allMinifigs=snap.minifigs||[];allWishlist=snap.wishlist||[];docs.clear();for(const d of snap.documents||[])docs.set(key(d.kind,d.entry_id),d);docsReady=true;
  if(name==='collection'){renderCollection();document.getElementById('collection-content').insertAdjacentHTML('afterbegin',offlineBanner(snap.saved_at));}
  else if(name==='minifigs'){renderMinifigs();document.getElementById('minifigs-content').insertAdjacentHTML('afterbegin',offlineBanner(snap.saved_at));}
  else if(name==='wishlist'){renderWishlist();document.getElementById('wishlist-content').insertAdjacentHTML('afterbegin',offlineBanner(snap.saved_at));}
  else if(name==='showcase')await renderShowcase();
  else {const target=document.getElementById(name==='dashboard'?'dashboard-content':'stats-content');const pieces=allSets.reduce((n,s)=>n+(s.num_parts||0)*(s.quantity||1),0),value=allSets.reduce((n,s)=>n+(Number(s.current_value??s.price_paid)||0)*(s.quantity||1),0);target.innerHTML=offlineBanner(snap.saved_at)+`<div class="stats-grid"><div class="brick-stat brick-yellow"><span class="label">Sets</span><span class="value">${allSets.length}</span></div><div class="brick-stat brick-red"><span class="label">Pièces</span><span class="value">${pieces.toLocaleString('fr-FR')}</span></div><div class="brick-stat brick-blue"><span class="label">Valeur</span><span class="value">${eur(value)}</span></div><div class="brick-stat brick-green"><span class="label">Minifigs</span><span class="value">${allMinifigs.length}</span></div></div>`;}
  return true;
}

async function fullBackup(includePhotoData=false){
  const base=await fetchAllDataForExport(),ok=await loadDocuments(true);if(!ok)throw featureError;
  const documents=[...docs.values()].map(({kind,entry_id,value})=>({kind,entry_id,value:structuredClone(value)}));
  if(includePhotoData)for(const d of documents.filter(x=>x.kind==='set'))for(const photo of d.value.photos||[]){if(photo.path){const {data,error}=await sb.storage.from(BUCKET).download(photo.path);if(error)throw error;photo.data=await blobToDataURL(data);}}
  return {version:2,exported_at:new Date().toISOString(),sets:base.sets,minifigs:base.minifigs,wishlist:base.wishlist,documents};
}
async function currentState(){const [sets,minifigs,wishlist]=await Promise.all(['owned_sets','minifigs','wishlist'].map(table=>sb.from(table).select('*')));for(const x of [sets,minifigs,wishlist])if(x.error)throw x.error;await loadDocuments(true);return {sets:sets.data||[],minifigs:minifigs.data||[],wishlist:wishlist.data||[],documents:[...docs.values()]};}
async function prepareImport(){
  const status=document.getElementById('collector-import-status'),preview=document.getElementById('collector-import-preview'),confirm=document.getElementById('collector-import-confirm');if(!importBackup)return;
  try{importPlan=M.plan(importBackup,await currentState(),document.getElementById('collector-import-mode').value,uuid);preview.hidden=false;confirm.hidden=importPlan.operations.length===0;preview.innerHTML=`<p style="padding:10px;margin:0"><strong>${importPlan.counts.insert}</strong> ajout(s), <strong>${importPlan.counts.update}</strong> remplacement(s), <strong>${importPlan.counts.skip}</strong> conservé(s).</p><ul>${importPlan.preview.slice(0,200).map(x=>`<li>${x.action==='insert'?'Ajouter':x.action==='update'?'Remplacer':'Conserver'} · ${esc(x.reference)} · ${esc(x.name)}</li>`).join('')}</ul>${importPlan.preview.length>200?'<p style="padding:10px">Aperçu limité aux 200 premières fiches.</p>':''}`;message(status,'Aperçu prêt. Vérifie-le avant de restaurer.');}catch(error){importPlan=null;preview.hidden=true;confirm.hidden=true;message(status,error.message||String(error),true);}
}
async function restorePhotoData(backup,plan){
  const setMap={},uploaded=[];for(const p of plan.preview.filter(x=>x.kind==='sets')){const source=backup.sets.find(s=>s.set_num===p.reference);if(source){const op=plan.operations.find(o=>o.table==='owned_sets'&&o.row.set_num===p.reference);if(op)setMap[source.id]=op.row.id;}}
  for(const d of backup.documents.filter(x=>x.kind==='set')){const target=setMap[d.entry_id],op=plan.operations.find(x=>x.table==='collector_documents'&&x.row.kind==='set'&&x.row.entry_id===target);if(!target||!op)continue;for(const photo of op.row.value.photos||[]){if(!photo.data)continue;const response=await fetch(photo.data),blob=await response.blob(),id=photo.id||uuid(),path=`${currentUser.id}/${target}/${id}.jpg`;const upload=await sb.storage.from(BUCKET).upload(path,blob,{contentType:blob.type||'image/jpeg'});if(upload.error)throw upload.error;uploaded.push(path);photo.path=path;delete photo.data;}}
  return uploaded;
}

function bindOptions(){
  const exportPanel=document.getElementById('collector-backup-panel'),button=document.createElement('button');button.type='button';button.className='btn btn-secondary';button.textContent='Exporter la sauvegarde complète';exportPanel.querySelector('.collector-actions').prepend(button);
  button.addEventListener('click',async()=>{button.disabled=true;try{const backup=await fullBackup(true);downloadBlob(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),`briqueotheque-sauvegarde-${todayStamp()}.json`);}catch(error){message(document.getElementById('collector-import-status'),migrationHint(error),true);}finally{button.disabled=false;}});
  const file=document.getElementById('collector-import-file');file.addEventListener('change',async()=>{const status=document.getElementById('collector-import-status');try{const chosen=file.files[0];if(!chosen) return;if(chosen.size>50*1024*1024)throw Error('La sauvegarde dépasse 50 Mo.');importBackup=M.normalize(JSON.parse(await chosen.text()));await prepareImport();}catch(error){message(status,error.message||String(error),true);}});
  document.getElementById('collector-import-mode').addEventListener('change',prepareImport);
  document.getElementById('collector-import-confirm').addEventListener('click',async event=>{if(!importPlan)return;const status=document.getElementById('collector-import-status');event.currentTarget.disabled=true;let uploaded=[];try{uploaded=await restorePhotoData(importBackup,importPlan);const {data,error}=await sb.rpc('restore_collector_backup',{operations:importPlan.operations});if(error)throw error;message(status,`${data} changement(s) restauré(s). Recharge la page pour les afficher.`);event.currentTarget.hidden=true;}catch(error){if(uploaded.length)await sb.storage.from(BUCKET).remove(uploaded);message(status,migrationHint(error),true);}finally{event.currentTarget.disabled=false;}});
  document.getElementById('collector-preferences-save').addEventListener('click',async()=>{const status=document.getElementById('collector-preferences-status');try{const dashboard={};document.querySelectorAll('#collector-dashboard-fields input').forEach(input=>dashboard[input.name]=input.checked);await saveDocument('preferences','main',{budget:document.getElementById('collector-budget').value,dashboard});message(status,'Accueil et budget enregistrés.');applyDashboardPreferences();}catch(error){message(status,migrationHint(error),true);}});
  document.getElementById('collector-offline-save').addEventListener('click',async()=>{const status=document.getElementById('collector-offline-status');try{const backup=await fullBackup(false);await localSet({...backup,saved_at:new Date().toISOString()});message(status,`Copie enregistrée le ${new Date().toLocaleString('fr-FR')}.`);}catch(error){message(status,error.message||String(error),true);}});
  document.getElementById('collector-offline-remove').addEventListener('click',async()=>{await localDelete();document.documentElement.classList.remove('offline-readonly');message(document.getElementById('collector-offline-status'),'Copie locale effacée.');});
}

function installWrappers(){
  const originalDetail=openSetDetail;openSetDetail=async item=>{await originalDetail(item);await loadDocuments();const panel=document.getElementById('set-modal-panel');panel.insertAdjacentHTML('beforeend',detailPanel(item));bindDetailPanel(item);};
  const originalWishlist=renderWishlist;renderWishlist=()=>{originalWishlist();renderWishlistEnhancements();};
  const originalDashboard=loadDashboard;loadDashboard=async()=>{if(!navigator.onLine&&await showOffline('dashboard'))return;await originalDashboard();await loadDocuments();applyDashboardPreferences();};
  for(const name of ['collection','minifigs','wishlist','stats']){const fnName='load'+name[0].toUpperCase()+name.slice(1),original=globalThis[fnName];if(typeof original==='function')globalThis[fnName]=async()=>{if(!navigator.onLine&&await showOffline(name))return;document.documentElement.classList.remove('offline-readonly');await original();if(name==='wishlist'){await loadDocuments();renderWishlistEnhancements();}};}
  const originalShow=showView;showView=name=>{originalShow(name);if(name==='showcase')renderShowcase();if(name==='options')loadDocuments().then(()=>{populatePreferences();renderPurchaseHistory();});};
}
function addEntrances(){
  views.push('showcase');const nav=document.querySelector('.nav');const button=document.createElement('button');button.className='nav-btn';button.dataset.view='showcase';button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V8h14v13M8 8V4h8v4"/><path d="M9 12h6v5H9z"/></svg><span>Mode vitrine</span>';button.addEventListener('click',()=>showView('showcase'));nav.insertBefore(button,nav.querySelector('.nav-add'));
  const header=document.querySelector('#view-collection .page-header>div:nth-child(2)');const entry=document.createElement('button');entry.type='button';entry.className='btn btn-outline';entry.textContent='Mode vitrine';entry.addEventListener('click',()=>showView('showcase'));header.append(entry);
  document.querySelectorAll('#view-showcase [data-goto]').forEach(btn=>btn.addEventListener('click',()=>showView(btn.dataset.goto)));
}
async function bootstrap(){
  if(bootstrap.done)return;bootstrap.done=true;installWrappers();addEntrances();bindOptions();
  if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('/sw.js').catch(()=>{});
  window.addEventListener('online',()=>document.documentElement.classList.remove('offline-readonly'));
  await loadDocuments();populatePreferences();renderPurchaseHistory();
}
bootstrap();
})();
