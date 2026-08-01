'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
function bindEvent(selector,event,handler){const el=$(selector);if(!el){console.warn('画面部品が見つからないため処理を省略しました:',selector,event);return false}el.addEventListener(event,handler);return true}
function bindClick(selector,handler){return bindEvent(selector,'click',handler)}
const APP_VERSION='1.6.5';
const APP_BUILD='2026-08-01 19:10 JST';
const STORE='kyk_records_v02', JOURNAL_STORE='kyk_journals_v01', IDB='kyk_app_v02', IDB_STORE='files', DB_KEY='kykdb';
const DATA_VAULT_DB='kyk_data_v1', DATA_VAULT_STORE='safety', DATA_MIRROR_KEY='records_mirror', JOURNAL_MIRROR_KEY='journals_mirror', DATA_SNAPSHOT_KEY='pre_update_snapshot';
let master={sites:[],siteAliases:{},companies:[],companyAliases:{},possibilities:[],severities:[],health:[],qualifications:[],qualAbbr:{},checks:['□','☑'],mapping:{},templateBuffer:null,fileName:'',loadedAt:''};
let editingId=null,approvingId=null,editingJournalId=null,currentWork=0,activeWorkCount=1,creatorSign='',principalSign='',principalCommentDraft='',workerSigns=Array(8).fill(''),workerPads=[];
const CANON=['現場名','作業日','会社名','作成者','元請確認',...[1,2,3,4].flatMap(i=>['作業内容'+i,'予定人員'+i,'実施人員'+i,'危険性'+i,'可能性'+i,'重大性'+i,'総合点'+i,'対策'+i,'作業責任者'+i]),...[1,2,3,4].map(i=>'職長から'+i),...[1,2,3,4].map(i=>'元請から'+i),...[1,2,3,4,5,6,7,8].flatMap(i=>['体調'+i,'資格'+i,'作業員'+i]),'足場点検','工具点検','服装点検','保護具点検',...[1,2,3,4,5,6].map(i=>'元請連絡'+i),...[1,2,3,4,5,6].map(i=>'品質に関する事項'+i),'日誌予定人員計','日誌実施人員計'];
function canonical(s){s=String(s||'').replace(/\s/g,'');return CANON.find(x=>s.startsWith(x))||String(s||'').trim()}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function readLocalRecords(){
 const raw=localStorage.getItem(STORE);
 if(raw===null)return {ok:true,exists:false,value:[]};
 try{const value=JSON.parse(raw);return {ok:Array.isArray(value),exists:true,value:Array.isArray(value)?value:[]}}catch{return {ok:false,exists:true,value:[]}}
}
function records(){return readLocalRecords().value}
function openDataVault(){return new Promise((res,rej)=>{const r=indexedDB.open(DATA_VAULT_DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(DATA_VAULT_STORE))r.result.createObjectStore(DATA_VAULT_STORE)};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function vaultPut(key,value){const db=await openDataVault();return new Promise((res,rej)=>{const tx=db.transaction(DATA_VAULT_STORE,'readwrite');tx.objectStore(DATA_VAULT_STORE).put(value,key);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
async function vaultGet(key){const db=await openDataVault();return new Promise((res,rej)=>{const r=db.transaction(DATA_VAULT_STORE).objectStore(DATA_VAULT_STORE).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function mirrorRecords(v,reason='save'){vaultPut(DATA_MIRROR_KEY,{records:v,updatedAt:new Date().toISOString(),appVersion:APP_VERSION,reason}).catch(e=>console.warn('KYデータの安全バックアップに失敗しました',e))}
function saveRecords(v){localStorage.setItem(STORE,JSON.stringify(v));mirrorRecords(v)}
async function ensureRecordSafety(){
 const local=readLocalRecords();
 try{
  const mirror=await vaultGet(DATA_MIRROR_KEY);
  if((!local.ok||!local.exists)&&Array.isArray(mirror?.records)){
   localStorage.setItem(STORE,JSON.stringify(mirror.records));
   toast(`安全バックアップからKYデータ${mirror.records.length}件を復元しました`);
   return;
  }
  if(local.ok)await vaultPut(DATA_MIRROR_KEY,{records:local.value,updatedAt:new Date().toISOString(),appVersion:APP_VERSION,reason:'startup-sync'});
 }catch(e){console.warn('KYデータ安全確認に失敗しました',e)}
 try{const local=localStorage.getItem(JOURNAL_STORE),mirror=await vaultGet(JOURNAL_MIRROR_KEY);if(local===null&&Array.isArray(mirror?.journals))localStorage.setItem(JOURNAL_STORE,JSON.stringify(mirror.journals));else await vaultPut(JOURNAL_MIRROR_KEY,{journals:journals(),updatedAt:new Date().toISOString(),appVersion:APP_VERSION})}catch(e){console.warn('日誌データ安全確認に失敗しました',e)}
}
async function createPreUpdateSnapshot(){
 const local=readLocalRecords();
 if(!local.ok)throw new Error('保存済みKYデータを確認できません。更新を中止しました。');
 const snapshot={records:local.value,journals:journals(),createdAt:new Date().toISOString(),fromVersion:APP_VERSION,count:local.value.length};
 await vaultPut(DATA_SNAPSHOT_KEY,snapshot);
 await vaultPut(DATA_MIRROR_KEY,{records:local.value,updatedAt:snapshot.createdAt,appVersion:APP_VERSION,reason:'pre-update'});
 return snapshot;
}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function templatePrintArea(workbook,sheetName,fallback){
 const names=[...String(workbook||'').matchAll(/<definedName\b([^>]*)name="_xlnm\.Print_Area"([^>]*)>([\s\S]*?)<\/definedName>/g)];
 const target=names.map(m=>m[3].replace(/&apos;/g,"'").replace(/&amp;/g,'&')).find(v=>{const bang=v.lastIndexOf('!');if(bang<0)return false;let n=v.slice(0,bang).trim();if(n.startsWith("'")&&n.endsWith("'"))n=n.slice(1,-1).replace(/''/g,"'");return n===sheetName});
 if(!target)return fallback;const bang=target.lastIndexOf('!');return target.slice(bang+1).trim()||fallback
}
function printAreaDefinedNames(sheetNames,area){return sheetNames.map((nm,i)=>`<definedName name="_xlnm.Print_Area" localSheetId="${i}">'${xmlEsc(nm.replace(/'/g,"''"))}'!${xmlEsc(area)}</definedName>`).join('')}
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(IDB,1);r.onupgradeneeded=()=>r.result.createObjectStore(IDB_STORE);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function idbPut(v){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(IDB_STORE,'readwrite');tx.objectStore(IDB_STORE).put(v,DB_KEY);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
async function idbGet(){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction(IDB_STORE).objectStore(IDB_STORE).get(DB_KEY);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function go(name){$$('.screen').forEach(x=>x.classList.remove('active'));const screen=$('#screen-'+name);if(!screen)return;screen.classList.add('active');scrollTo(0,0);if(name==='saved')renderSaved();if(name==='approval')renderApproval();if(name==='work')showWork(currentWork);if(name==='journal-create')renderJournalCandidates();if(name==='journal-list')renderJournalList();if(name==='top'){renderDashboard();}}
function selectOptions(el,values,blank='選択してください'){const cur=el.value;el.innerHTML=`<option value="">${blank}</option>`+values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');if(values.includes(cur))el.value=cur}
function updateRequiredHighlights(){['#workDate','#site','#company'].forEach(sel=>{const el=$(sel);if(el)el.classList.toggle('required-empty',!String(el.value||'').trim())})}
function updateQualificationDisplay(i){const sel=$('#qual'+i),out=$('#qualDisplay'+i);if(out)out.textContent=sel?.value?(master.qualAbbr[sel.value]||sel.value):'未選択'}
function updateHealthDisplay(i){const sel=$('#health'+i),out=$('#healthDisplay'+i);if(out)out.textContent=sel?.value||'未選択'}
function hydrateMasters(){['#site','#searchSite','#approvalSite','#journalSearchSite'].forEach(x=>selectOptions($(x),master.sites,x==='#site'?'選択してください':'すべて'));['#company','#searchCompany'].forEach(x=>selectOptions($(x),master.companies,x==='#company'?'選択してください':'すべて'));$$('.health-select').forEach(x=>selectOptions(x,master.health,'未選択'));$$('.qual-select').forEach(x=>selectOptions(x,master.qualifications,'未選択'));$$('.poss-select').forEach(x=>selectOptions(x,master.possibilities,'選択'));$$('.sev-select').forEach(x=>selectOptions(x,master.severities,'選択'));for(let i=1;i<=8;i++){updateHealthDisplay(i);updateQualificationDisplay(i)}}
function scoreOf(v){const m=String(v||'').match(/^\s*([０-９0-9]+)/);return m?Number(m[1].replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-65248))):0}
function buildRows(){
 const peopleOptions=Array.from({length:10},(_,n)=>`<option value="${n}">${n}</option>`).join('');
 $('#workRows').innerHTML=[1,2,3,4].map(i=>`<div class="work-card" id="workCard${i}"><h3>作業 ${i}</h3><label>作業内容（25文字）<input id="work${i}" maxlength="25"></label><div class="work-grid"><label class="work-leader">作業責任者（苗字）<input id="leader${i}" maxlength="12"></label><label class="num2">予定人員<select id="planned${i}">${peopleOptions}</select></label><label class="num2">実施人員<select id="actual${i}">${peopleOptions}</select></label></div><div class="risk-grid"><label>危険性（22文字）<input id="danger${i}" maxlength="22"></label><label class="num2">可能性<select class="poss-select" id="poss${i}"></select></label><label class="num2">重大性<select class="sev-select" id="sev${i}"></select></label><label class="num2">総合点<input class="score" id="score${i}" readonly></label><div class="wide-select-panel" id="riskHelp${i}"></div></div><label>対策（25文字）<input id="measure${i}" maxlength="25"></label></div>`).join('');
 $('#workerRows').innerHTML=[1,2,3,4,5,6,7,8].map(i=>`<div class="worker-card" data-worker-index="${i}"><h3>作業員 ${i}</h3><div class="worker-grid"><div class="worker-sign-area"><div class="label-title">氏名（手書きサイン）</div><canvas class="sign-pad worker-sign-pad" id="workerPad${i}"></canvas><div class="sign-actions"><button type="button" id="clearWorker${i}">書き直す</button><span id="workerSignStatus${i}">未署名</span></div></div><div class="worker-side-fields"><label>体調<div class="health-control"><select class="health-select worker-compact-select" id="health${i}"></select><output class="health-display" id="healthDisplay${i}">未選択</output></div></label><label>資格<div class="qualification-control"><select class="qual-select worker-compact-select" id="qual${i}"></select><output class="qual-display" id="qualDisplay${i}">未選択</output></div></label></div></div></div>`).join('');
 [1,2,3,4].forEach(i=>{const calc=()=>{const p=scoreOf($('#poss'+i).value),s=scoreOf($('#sev'+i).value);$('#score'+i).value=p&&s?p*s:'';$('#riskHelp'+i).textContent=`可能性：${$('#poss'+i).value||'未選択'}　重大性：${$('#sev'+i).value||'未選択'}`};$('#poss'+i).onchange=calc;$('#sev'+i).onchange=calc});
 for(let i=1;i<=8;i++){
  $('#health'+i).onchange=e=>{updateHealthDisplay(i);e.target.blur()};
  $('#qual'+i).onchange=e=>{updateQualificationDisplay(i);e.target.blur()};
 }
}
function showWork(idx){currentWork=Math.max(0,Math.min(idx,activeWorkCount-1));[1,2,3,4].forEach(i=>$('#workCard'+i).hidden=i!==currentWork+1);$('#workIndicator').textContent=`作業 ${currentWork+1}／${activeWorkCount}`;$('#prevWork').disabled=currentWork===0;$('#nextWork').disabled=currentWork===activeWorkCount-1;$('#addWork').disabled=activeWorkCount>=4;$('#removeWork').hidden=activeWorkCount===1}

function actualWorkerCount(){let total=0;for(let i=1;i<=activeWorkCount;i++)total+=Math.max(0,Number($('#actual'+i)?.value)||0);return total}
function workerSlotHasData(i){return !!(workerSigns[i-1]||$('#health'+i)?.value||$('#qual'+i)?.value)}
function clearWorkerSlot(i){workerSigns[i-1]='';workerPads[i-1]?.load('');if($('#health'+i))$('#health'+i).value='';if($('#qual'+i))$('#qual'+i).value='';updateHealthDisplay(i);updateQualificationDisplay(i)}
function prepareWorkerScreen(){
 const total=actualWorkerCount();
 if(total<1){toast('実施人員を1名以上入力してください');return false}
 if(total>8){toast('実施人員の合計は8名以内にしてください');return false}
 const extras=[];for(let i=total+1;i<=8;i++)if(workerSlotHasData(i))extras.push(i);
 if(extras.length&&!confirm(`実施人員は${total}名です。作業員${extras[0]}以降の入力内容を消去して、${total}名分だけ表示しますか？`))return false;
 extras.forEach(clearWorkerSlot);
 updateWorkerVisibility(total);return true
}
function updateWorkerVisibility(total=actualWorkerCount()){
 total=Math.max(0,Math.min(8,total));
 $$('.worker-card[data-worker-index]').forEach(card=>card.hidden=Number(card.dataset.workerIndex)>total);
 const info=$('#workerCountInfo');if(info)info.innerHTML=`<strong>実施人員合計：${total}名</strong><div class="meta">作業員入力欄を${total}名分表示しています。</div>`
}
function parseDB(wb){const ws=wb.Sheets.DB;if(!ws)throw new Error('DBシートがありません');const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:false});const head=(rows[0]||[]).map(x=>String(x||'').replace(/\s/g,''));const col=(key,fallback)=>{const i=head.findIndex(x=>x.startsWith(key));return i>=0?i:fallback};const ci={item:col('項目名',1),kyk:col('KYK出力セル番号',2),journal:col('日誌出力セル番号',3),condition:col('入力条件',4),required:col('入力必須',5),copy:col('KYK翌日コピー',6),search:col('KYK検索対象',7),journalSearch:col('日誌検索対象',8),site:col('現場名マスター',9),siteAlias:col('現場名シート表示マスター',10),company:col('会社名マスター',11),companyAlias:col('会社名シート表示マスター',12),poss:col('可能性マスター',13),sev:col('重大性マスター',14),health:col('体調マスター',15),qual:col('資格選択マスター',16),abbr:col('資格表示マスター',17),check:col('点検マスター',18)};const mapping={};rows.slice(1).forEach(r=>{if(r[ci.item])mapping[canonical(r[ci.item])] = {cell:r[ci.kyk]?String(r[ci.kyk]).trim():'',journalCell:r[ci.journal]?String(r[ci.journal]).trim():'',condition:r[ci.condition],required:String(r[ci.required]||'').startsWith('必須'),copy:String(r[ci.copy]||'').startsWith('○'),search:String(r[ci.search]||'').startsWith('○'),journalSearch:String(r[ci.journalSearch]||'').startsWith('○')}});const unique=i=>[...new Set(rows.slice(1).map(r=>r[i]).filter(v=>v!==null&&String(v).trim()).map(v=>String(v).trim()))];const sites=unique(ci.site),siteAliasValues=unique(ci.siteAlias),siteAliases={};sites.forEach((s,i)=>siteAliases[s]=siteAliasValues[i]||s);const companies=unique(ci.company),aliases=unique(ci.companyAlias),companyAliases={};companies.forEach((c,i)=>companyAliases[c]=aliases[i]||c);const qualifications=unique(ci.qual),abbr=unique(ci.abbr),qualAbbr={};qualifications.forEach((q,i)=>qualAbbr[q]=abbr[i]||q);return{sites,siteAliases,companies,companyAliases,possibilities:unique(ci.poss),severities:unique(ci.sev),health:unique(ci.health),qualifications,qualAbbr,checks:unique(ci.check).length?unique(ci.check):['□','☑'],mapping}}
async function loadBuffer(buf,name,save=true,source='manual'){if(!window.XLSX)throw new Error('Excel処理ライブラリを読み込めません。システムファイルを確認してください');const wb=XLSX.read(buf,{type:'array',cellDates:true});if(!wb.SheetNames.includes('KYK'))throw new Error('KYKシートがありません');if(!wb.SheetNames.includes('日誌'))throw new Error('日誌シートがありません');const parsed=parseDB(wb);Object.assign(master,parsed,{templateBuffer:buf.slice(0),fileName:name,loadedAt:new Date().toISOString()});if(save)await idbPut({buffer:buf.slice(0),name,loadedAt:master.loadedAt,appVersion:APP_VERSION,source});updateDbStatus();hydrateMasters();toast(source==='manual'?'KYKDBを保存して読み込みました':source==='bundled'?'システム同梱のKYKDBを読み込みました':'保存済みKYKDBを復元しました')}
async function loadFile(file){if(!file)return;await loadBuffer(await file.arrayBuffer(),file.name,true,'manual')}
async function loadBundledDB(){
 if(location.protocol==='file:')throw new Error('公開URLから開いた場合のみ同梱KYKDBを取得できます');
 const url=new URL('KYKDB.xlsx',location.href);url.searchParams.set('app',APP_VERSION);url.searchParams.set('_',Date.now());
 const res=await fetch(url,{cache:'no-store'});if(!res.ok)throw new Error(`同梱KYKDB.xlsxを取得できません（${res.status}）`);
 await loadBuffer(await res.arrayBuffer(),'KYKDB.xlsx',true,'bundled');
}
function updateDbStatus(){if(!master.templateBuffer)return;const d=new Date(master.loadedAt);$('#dbStatus').textContent=`${master.fileName} 読込済み（現場${master.sites.length}件・会社${master.companies.length}件・更新 ${d.toLocaleString('ja-JP')}）`;$('#btnDb').textContent='KYKDB再読込';$('#dbGuide').textContent='KYKDBは右上の「KYKDB再読込」から手動で更新します。アプリ更新時も端末に保存済みのKYKDBをそのまま引き継ぎます。'}
function compareVersions(a,b){const pa=String(a).split('.').map(Number),pb=String(b).split('.').map(Number);for(let i=0;i<Math.max(pa.length,pb.length);i++){const x=pa[i]||0,y=pb[i]||0;if(x!==y)return x-y}return 0}
async function checkForAppUpdate(){
 if(location.protocol==='file:')return;
 try{
  const url=new URL('version.json',location.href);url.searchParams.set('_',Date.now());
  const res=await fetch(url,{cache:'no-store'});if(!res.ok)return;
  const info=await res.json();if(!info.version||compareVersions(info.version,APP_VERSION)<=0)return;
  $('#currentVersionText').textContent=`v${APP_VERSION}`;$('#latestVersionText').textContent=`v${info.version}`;
  const notes=Array.isArray(info.notes)?info.notes:['機能改善と不具合修正'];$('#releaseNotesList').innerHTML=notes.map(x=>`<li>${esc(x)}</li>`).join('');
  $('#updateModal').hidden=false;
 }catch(e){console.warn('更新確認に失敗しました',e)}
}
async function applyAppUpdate(){
 const btn=$('#btnUpdateNow');btn.disabled=true;btn.textContent='安全確認中…';
 try{
  const snapshot=await createPreUpdateSnapshot();
  btn.textContent=`KYデータ${snapshot.count}件を保護・更新中…`;
  if('serviceWorker'in navigator){const reg=await navigator.serviceWorker.getRegistration();if(reg){await reg.update();if(reg.waiting)reg.waiting.postMessage({type:'SKIP_WAITING'});else if(reg.installing)await new Promise(resolve=>{reg.installing.addEventListener('statechange',()=>{if(reg.installing?.state==='installed'){reg.waiting?.postMessage({type:'SKIP_WAITING'});resolve()}});setTimeout(resolve,5000)})}}
  // キャッシュ削除は新しいService Workerのactivate処理に限定する。KYデータ保存領域には触れない。
  const u=new URL(location.href);u.searchParams.set('updated',Date.now());location.replace(u.toString());
 }catch(e){console.error(e);btn.disabled=false;btn.textContent='更新する';toast('更新に失敗しました。通信状態を確認してください')}
}
function setupPad(canvas,status,clearBtn,onChange,lineWidth=2.2){
 let drawing=false,has=false,moved=false,last={x:0,y:0},savedImage='';
 const ctx=canvas.getContext('2d');
 function configure(){ctx.setTransform(1,0,0,1,0,0);ctx.scale(window.devicePixelRatio||1,window.devicePixelRatio||1);ctx.lineWidth=lineWidth;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#111'}
 function resize(){
  const r=canvas.getBoundingClientRect();if(r.width<2||r.height<2)return;
  const keep=has?(savedImage||canvas.toDataURL('image/png')):'';
  const dpr=window.devicePixelRatio||1,w=Math.round(r.width*dpr),h=Math.round(r.height*dpr);
  if(canvas.width===w&&canvas.height===h)return;
  canvas.width=w;canvas.height=h;configure();
  if(keep){const im=new Image();im.onload=()=>{ctx.drawImage(im,0,0,r.width,r.height);savedImage=keep};im.src=keep}
 }
 function point(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
 function start(e){
  if(e.pointerType==='mouse'&&e.button!==0)return;e.preventDefault();resize();
  drawing=true;moved=false;last=point(e);ctx.beginPath();ctx.moveTo(last.x,last.y);
  try{canvas.setPointerCapture(e.pointerId)}catch(_){ }
 }
 function move(e){
  if(!drawing)return;e.preventDefault();const q=point(e);
  if(Math.hypot(q.x-last.x,q.y-last.y)>=1){ctx.lineTo(q.x,q.y);ctx.stroke();last=q;moved=true}
 }
 function end(e){
  if(!drawing)return;e.preventDefault();drawing=false;
  try{canvas.releasePointerCapture(e.pointerId)}catch(_){ }
  if(!moved){status.textContent=has?'署名済み':'未署名';return}
  has=true;savedImage=canvas.toDataURL('image/png');status.textContent='署名済み';onChange(savedImage)
 }
 canvas.addEventListener('pointerdown',start,{passive:false});
 canvas.addEventListener('pointermove',move,{passive:false});
 canvas.addEventListener('pointerup',end,{passive:false});
 canvas.addEventListener('pointercancel',end,{passive:false});
 
// iPhone Safari touch support
const touchPos=(e)=>{const r=canvas.getBoundingClientRect();const tt=e.touches&&e.touches[0]?e.touches[0]:e.changedTouches[0];return {clientX:tt.clientX,clientY:tt.clientY,pointerId:1,preventDefault:()=>e.preventDefault()};};
canvas.style.touchAction='none';
canvas.addEventListener('touchstart',e=>start(touchPos(e)),{passive:false});
canvas.addEventListener('touchmove',e=>move(touchPos(e)),{passive:false});
canvas.addEventListener('touchend',e=>end(touchPos(e)),{passive:false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
 clearBtn.onclick=()=>{resize();ctx.clearRect(0,0,canvas.width,canvas.height);has=false;moved=false;savedImage='';status.textContent='未署名';onChange('')};
 const observer=new ResizeObserver(()=>resize());observer.observe(canvas);resize();
 return{load(data){resize();ctx.clearRect(0,0,canvas.width,canvas.height);const valid=isSignatureDataUrl(data);has=valid;savedImage=valid?data:'';status.textContent=valid?'署名済み':'未署名';if(valid){const im=new Image();im.onload=()=>ctx.drawImage(im,0,0,canvas.clientWidth,canvas.clientHeight);im.onerror=()=>{has=false;savedImage='';status.textContent='未署名'};im.src=data}},resize}
}
let creatorPad,principalPad;
function resetForm(){editingId=null;$('#btnDelete').hidden=true;$$('input:not([type=file]):not([type=checkbox]),textarea').forEach(x=>x.value='');$$('select').forEach(x=>x.value='');$$('input[type=checkbox]').forEach(x=>x.checked=false);$('#workDate').value=today();creatorSign='';creatorPad?.load('');principalCommentDraft='';workerSigns=Array(8).fill('');workerPads.forEach(p=>p?.load(''));activeWorkCount=1;currentWork=0;hydrateMasters();showWork(0);updateWorkerVisibility(0);$('#foremanCount').textContent='0';updateRequiredHighlights()}
function collect(){const work=[];for(let i=1;i<=4;i++)work.push({content:$('#work'+i).value.trim(),planned:$('#planned'+i).value,actual:$('#actual'+i).value,danger:$('#danger'+i).value.trim(),poss:$('#poss'+i).value,sev:$('#sev'+i).value,score:$('#score'+i).value,measure:$('#measure'+i).value.trim(),leader:$('#leader'+i).value.trim()});const workers=[];for(let i=1;i<=8;i++)workers.push({signImage:workerSigns[i-1]||'',health:$('#health'+i).value,qualification:$('#qual'+i).value});return{id:editingId||uid(),site:$('#site').value,date:$('#workDate').value,company:$('#company').value,companyAlias:master.companyAliases[$('#company').value]||$('#company').value,creatorSign,activeWorkCount,work,foremanComment:$('#foremanComment').value,checks:{scaffold:$('#checkScaffold').checked,tools:$('#checkTools').checked,clothes:$('#checkClothes').checked,ppe:$('#checkPpe').checked},workers,principalCommentDraft,approval:null,deleted:false,updatedAt:new Date().toISOString(),history:[]}}
function validate(d){if(!d.date||!d.site||!d.company||!d.creatorSign){toast('作業日・現場名・会社名・作成者サインは必須です');return false}const total=d.work.slice(0,d.activeWorkCount).reduce((sum,w)=>sum+(Number(w.actual)||0),0);if(total<1||total>8){toast('実施人員の合計は1名以上8名以内にしてください');return false}return true}
function saveCurrent(){const d=collect();if(!validate(d))return;const all=records(),idx=all.findIndex(x=>x.id===d.id);if(idx>=0){const old=all[idx];d.history=[...(old.history||[]),{at:d.updatedAt,type:'編集'}];if(old.approval)d.approval={...old.approval,status:'modified'};all[idx]=d}else{d.history=[{at:d.updatedAt,type:'新規保存'}];all.push(d)}saveRecords(all);toast('保存しました');const keepSite=d.site,keepDate=d.date;resetForm();$('#site').value=keepSite;$('#workDate').value=keepDate;$('#company').value='';go('basic');updatePreviousCopyInfo();updateRequiredHighlights()}
function fill(d){editingId=d.id;$('#btnDelete').hidden=false;$('#site').value=d.site;$('#workDate').value=d.date;$('#company').value=d.company;creatorSign=d.creatorSign||'';creatorPad.load(creatorSign);activeWorkCount=d.activeWorkCount||Math.max(1,d.work.findLastIndex?.(x=>x.content)+1||1);d.work.forEach((w,j)=>{const i=j+1;$('#work'+i).value=w.content||'';$('#planned'+i).value=w.planned||'';$('#actual'+i).value=w.actual||'';$('#danger'+i).value=w.danger||'';$('#poss'+i).value=w.poss||'';$('#sev'+i).value=w.sev||'';$('#score'+i).value=w.score||'';$('#measure'+i).value=w.measure||'';$('#leader'+i).value=w.leader||'';$('#riskHelp'+i).textContent=`可能性：${w.poss||'未選択'}　重大性：${w.sev||'未選択'}`});principalCommentDraft=d.principalCommentDraft||d.approval?.comment||'';$('#foremanComment').value=d.foremanComment||'';$('#foremanCount').textContent=$('#foremanComment').value.length;$('#checkScaffold').checked=d.checks.scaffold;$('#checkTools').checked=d.checks.tools;$('#checkClothes').checked=d.checks.clothes;$('#checkPpe').checked=d.checks.ppe;workerSigns=Array(8).fill('');(d.workers||[]).forEach((w,j)=>{const i=j+1;workerSigns[j]=w.signImage||'';workerPads[j]?.load(workerSigns[j]);$('#health'+i).value=w.health||'';$('#qual'+i).value=w.qualification||'';updateHealthDisplay(i);updateQualificationDisplay(i)});currentWork=0;go('basic');updateRequiredHighlights()}
function previousRecordForCurrent(){
 const site=$('#site').value,company=$('#company').value,date=$('#workDate').value;
 if(!site||!company)return null;
 return records().filter(x=>!x.deleted&&x.site===site&&x.company===company&&x.id!==editingId&&(!date||x.date<date)).sort((a,b)=>b.date.localeCompare(a.date)||b.updatedAt.localeCompare(a.updatedAt))[0]||null
}
function copyMarkedFieldsFromPrevious(){
 const src=previousRecordForCurrent();
 if(!$('#site').value||!$('#company').value){toast('現場名と会社名を選択してください');return}
 if(!src){toast('同一現場・同一会社の過去データがありません');$('#copyPreviousInfo').textContent='コピーできる過去データはありません。';return}
 const marked=Object.entries(master.mapping).filter(([,m])=>m.copy).map(([name])=>name);
 let copied=0,maxWork=1;
 const commentLines={foreman:Array(4).fill(''),principal:Array(4).fill('')};
 for(const name of marked){
  let m;
  if((m=name.match(/^作業内容([1-4])$/))){$('#work'+m[1]).value=src.work?.[m[1]-1]?.content||'';maxWork=Math.max(maxWork,Number(m[1]));copied++;continue}
  if((m=name.match(/^予定人員([1-4])$/))){$('#planned'+m[1]).value=src.work?.[m[1]-1]?.planned||'';maxWork=Math.max(maxWork,Number(m[1]));copied++;continue}
  if((m=name.match(/^実施人員([1-4])$/))){$('#actual'+m[1]).value=src.work?.[m[1]-1]?.actual||'';maxWork=Math.max(maxWork,Number(m[1]));copied++;continue}
  if((m=name.match(/^危険性([1-4])$/))){$('#danger'+m[1]).value=src.work?.[m[1]-1]?.danger||'';maxWork=Math.max(maxWork,Number(m[1]));copied++;continue}
  if((m=name.match(/^可能性([1-4])$/))){$('#poss'+m[1]).value=src.work?.[m[1]-1]?.poss||'';maxWork=Math.max(maxWork,Number(m[1]));copied++;continue}
  if((m=name.match(/^重大性([1-4])$/))){$('#sev'+m[1]).value=src.work?.[m[1]-1]?.sev||'';maxWork=Math.max(maxWork,Number(m[1]));copied++;continue}
  if((m=name.match(/^総合点([1-4])$/))){$('#score'+m[1]).value=src.work?.[m[1]-1]?.score||'';maxWork=Math.max(maxWork,Number(m[1]));copied++;continue}
  if((m=name.match(/^対策([1-4])$/))){$('#measure'+m[1]).value=src.work?.[m[1]-1]?.measure||'';maxWork=Math.max(maxWork,Number(m[1]));copied++;continue}
  if((m=name.match(/^作業責任者([1-4])$/))){$('#leader'+m[1]).value=src.work?.[m[1]-1]?.leader||'';maxWork=Math.max(maxWork,Number(m[1]));copied++;continue}
  if((m=name.match(/^職長から([1-4])$/))){commentLines.foreman[m[1]-1]=splitText(src.foremanComment,18,4)[m[1]-1]||'';copied++;continue}
  if((m=name.match(/^元請から([1-4])$/))){commentLines.principal[m[1]-1]=splitText(src.approval?.comment||src.principalCommentDraft,18,4)[m[1]-1]||'';copied++;continue}
 }
 if(commentLines.foreman.some(Boolean)){$('#foremanComment').value=commentLines.foreman.join('').slice(0,72);$('#foremanCount').textContent=$('#foremanComment').value.length}
 if(commentLines.principal.some(Boolean))principalCommentDraft=commentLines.principal.join('').slice(0,72);
 activeWorkCount=Math.max(1,Math.min(4,Math.max(maxWork,src.activeWorkCount||1)));currentWork=0;showWork(0);
 [1,2,3,4].forEach(i=>{$('#riskHelp'+i).textContent=`可能性：${$('#poss'+i).value||'未選択'}　重大性：${$('#sev'+i).value||'未選択'}`});
 $('#copyPreviousInfo').textContent=`${src.date} の保存内容から、DBで○の付いた項目をコピーしました。`;
 toast(`${copied}項目を前回データからコピーしました`)
}
function updatePreviousCopyInfo(){
 const el=$('#copyPreviousInfo');if(!el)return;
 if(!$('#site').value||!$('#company').value){el.textContent='現場名と会社名を選択して実行してください。';return}
 const src=previousRecordForCurrent();el.textContent=src?`${src.date} の保存データがあります。`:'コピーできる過去データはありません。'
}
function deleteCurrent(){if(!editingId||!confirm('このデータを削除済みにしますか？'))return;const all=records(),d=all.find(x=>x.id===editingId);if(d){d.deleted=true;d.updatedAt=new Date().toISOString();d.history.push({at:d.updatedAt,type:'削除'});saveRecords(all)}editingId=null;toast('削除しました');go('saved')}
function statusText(d){if(!d.approval)return['waiting','確認待ち'];if(d.approval.status==='modified')return['modified','⚠ 確認後変更'];return['approved','確認済み']}
function filteredSavedRecords(){const s=$('#searchSite').value,c=$('#searchCompany').value,from=$('#searchDateFrom')?.value||'',to=$('#searchDateTo')?.value||'';return records().filter(x=>!x.deleted&&(!s||x.site===s)&&(!c||x.company===c)&&(!from||x.date>=from)&&(!to||x.date<=to))}
function clearSavedDateRange(){if($('#searchDateFrom'))$('#searchDateFrom').value='';if($('#searchDateTo'))$('#searchDateTo').value='';renderSaved()}
function renderSaved(){const list=filteredSavedRecords();const site=$('#searchSite').value,company=$('#searchCompany').value,hasFilter=!!(site||company);$('#bulkExportInfo').textContent=!site?'現場名を選択してください。':list.length?`選択現場の表示中 ${list.length}件`:'対象なし';$('#btnBulkExport').disabled=!site||!list.length;$('#bulkDeleteInfo').textContent=!hasFilter?'現場名または会社名を選択してください。':list.length?`現在表示中の ${list.length}件だけを削除します。`:'削除対象はありません。';$('#btnBulkDelete').disabled=!hasFilter||!list.length;$('#savedList').innerHTML=list.length?list.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(d=>{const st=statusText(d);return`<div class="record-card"><strong>${esc(d.company)}</strong><div>${esc(d.date)}／${esc(d.site)}</div><div class="meta">${esc(d.work.filter(x=>x.content).map(x=>x.content).join('、')||'作業内容未入力')}</div><span class="status ${st[0]}">${st[1]}</span><div class="row"><button onclick="editRecord('${d.id}')">編集</button><button onclick="exportRecord('${d.id}')">個別Excel出力</button></div></div>`}).join(''):'<div class="card">該当する保存データはありません。</div>'}
function bulkDeleteSaved(){const site=$('#searchSite').value,company=$('#searchCompany').value;if(!site&&!company){toast('現場名または会社名を選択してください');return}const targets=filteredSavedRecords();if(!targets.length){toast('削除対象がありません');return}const filterText=[site&&`現場名「${site}」`,company&&`会社名「${company}」`].filter(Boolean).join('・');if(!confirm(`${filterText}で現在表示されているKY ${targets.length}件を削除します。
本当に削除しますか？`))return;const ids=new Set(targets.map(x=>x.id)),now=new Date().toISOString(),all=records();all.forEach(d=>{if(ids.has(d.id)){d.deleted=true;d.updatedAt=now;d.history=[...(d.history||[]),{at:now,type:'一括削除'}]}});saveRecords(all);toast(`${targets.length}件を削除しました`);renderSaved()}
function renderApproval(){const site=$('#approvalSite').value,inc=$('#includeApproved').checked,list=records().filter(x=>!x.deleted&&(!site||x.site===site)&&(inc||!x.approval||x.approval.status==='modified'));$('#approvalList').innerHTML=list.length?list.map(d=>{const st=statusText(d);return`<div class="record-card"><strong>${esc(d.company)}</strong><div>${esc(d.date)}／${esc(d.site)}</div><span class="status ${st[0]}">${st[1]}</span><div class="row"><button onclick="openApproval('${d.id}')">確認する</button></div></div>`}).join(''):'<div class="card">対象データはありません。</div>'}
function openApproval(id){approvingId=id;const d=records().find(x=>x.id===id);if(!d)return;$('#approvalSummary').innerHTML=`<strong>${esc(d.company)}</strong><p>${esc(d.date)}／${esc(d.site)}</p><p>${esc(d.work.filter(x=>x.content).map(x=>x.content).join('、'))}</p><p>職長から：${esc(d.foremanComment||'')}</p>`;$('#principalComment').value=d.approval?.comment||d.principalCommentDraft||'';principalSign=d.approval?.signImage||'';principalPad.load(principalSign);$('#principalCount').textContent=$('#principalComment').value.length;updatePrincipalCopyInfo(d);go('approve-detail')}

function principalCopyCandidates(d){return records().filter(x=>!x.deleted&&x.id!==d.id&&x.site===d.site&&x.company===d.company&&x.date<d.date&&String(x.approval?.comment||x.principalCommentDraft||'').trim()).sort((a,b)=>b.date.localeCompare(a.date)||String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).slice(0,5)}
function updatePrincipalCopyInfo(d){const list=principalCopyCandidates(d),info=$('#principalCopyInfo'),btn=$('#btnPrincipalCopy');if(!info||!btn)return;if(!list.length){info.textContent='コピーできる過去の元請連絡はありません。';btn.disabled=true;return}info.textContent=`直近は ${list[0].date} の元請連絡です。`;btn.disabled=false}
function applyPrincipalCommentCopy(src){const v=String(src.approval?.comment||src.principalCommentDraft||'').slice(0,72);$('#principalComment').value=v;$('#principalCount').textContent=v.length;toast(`${src.date}の元請連絡をコピーしました`)}
function closePrincipalCopyModal(){const m=$('#principalCopyModal');if(m)m.hidden=true}
function openPrincipalCopyModal(){const d=records().find(x=>x.id===approvingId);if(!d)return;const list=principalCopyCandidates(d);if(!list.length){toast('コピーできる過去データはありません');return}const latest=list[0],m=$('#principalCopyModal');$('#principalCopyPrompt').textContent=`直近（${latest.date}）の元請連絡をコピーしますか？`;$('#principalCopyCandidates').hidden=true;$('#principalCopyCandidates').innerHTML='';$('#principalCopyActions').hidden=false;m.hidden=false;$('#btnPrincipalCopyYes').onclick=()=>{applyPrincipalCommentCopy(latest);closePrincipalCopyModal()};$('#btnPrincipalCopyNo').onclick=closePrincipalCopyModal;$('#btnPrincipalCopyChoose').onclick=()=>{const box=$('#principalCopyCandidates');box.innerHTML=`<p class="meta">同一現場・同一会社の直近5件から選択してください。</p>${list.map(x=>`<button class="journal-copy-candidate" data-id="${x.id}"><strong>${x.date}</strong><span>${esc(String(x.approval?.comment||x.principalCommentDraft||'').slice(0,55))}</span></button>`).join('')}<button id="btnPrincipalCopyBack">戻る</button>`;box.hidden=false;$('#principalCopyActions').hidden=true;box.querySelectorAll('.journal-copy-candidate').forEach(b=>b.onclick=()=>{const src=list.find(x=>x.id===b.dataset.id);if(src)applyPrincipalCommentCopy(src);closePrincipalCopyModal()});$('#btnPrincipalCopyBack').onclick=()=>{box.hidden=true;$('#principalCopyActions').hidden=false}}}
function approve(){const comment=$('#principalComment').value;if(!principalSign){toast('元請確認の手書きサインを入力してください');return}const all=records(),d=all.find(x=>x.id===approvingId);if(!d)return;d.approval={comment,signImage:principalSign,status:'approved',approvedAt:new Date().toISOString()};d.updatedAt=d.approval.approvedAt;d.history.push({at:d.updatedAt,type:'元請確認'});saveRecords(all);toast('元請確認を保存しました');go('approval')}
function splitText(s,n,count){return Array.from({length:count},(_,i)=>String(s||'').slice(i*n,(i+1)*n))}
function xmlEsc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function xmlAttr(s){return xmlEsc(s).replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
function setXmlCell(xml,addr,val,type='s'){
 const a=addr.replace(/[$]/g,'');
 const body=type==='n'?`<v>${Number(val)||0}</v>`:`<is><t xml:space="preserve">${xmlEsc(val)}</t></is>`;
 const t=type==='n'?'':` t="inlineStr"`;
 const cleanAttrs=attrs=>attrs.replace(/\s+t="[^"]*"/g,'').replace(/\s*\/\s*$/,'');
 const escaped=a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 // 自己完結セルを先に処理し、後続セルや行の巻き込み削除を防ぐ。
 const self=new RegExp(`<c([^>]*\\br="${escaped}"[^>]*)\\s*\\/>`);
 if(self.test(xml))return xml.replace(self,(m,attrs)=>`<c${cleanAttrs(attrs)}${t}>${body}</c>`);
 const re=new RegExp(`<c([^>]*\\br="${escaped}"[^>]*)>([\\s\\S]*?)<\\/c>`);
 if(re.test(xml))return xml.replace(re,(m,attrs)=>`<c${cleanAttrs(attrs)}${t}>${body}</c>`);
 return xml;
}
function excelSerial(s){const [y,m,d]=s.split('-').map(Number);return (Date.UTC(y,m-1,d)-Date.UTC(1899,11,30))/86400000}
function isSignatureDataUrl(s){return typeof s==='string'&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(s)}
function dataUrlBytes(s){return Uint8Array.from(atob(s.split(',')[1]),c=>c.charCodeAt(0))}
function normalizeSignatureDataUrl(dataUrl,targetWidthCm,targetHeightCm){
 return new Promise((resolve)=>{
  if(!isSignatureDataUrl(dataUrl)){resolve('');return}
  const img=new Image();
  img.onload=()=>{
   try{
    const src=document.createElement('canvas'),ctx=src.getContext('2d',{willReadFrequently:true});
    src.width=img.naturalWidth||img.width;src.height=img.naturalHeight||img.height;ctx.drawImage(img,0,0);
    const pixels=ctx.getImageData(0,0,src.width,src.height).data;
    let left=src.width,top=src.height,right=-1,bottom=-1;
    for(let y=0;y<src.height;y++)for(let x=0;x<src.width;x++){
     const i=(y*src.width+x)*4,a=pixels[i+3],dark=pixels[i]<245||pixels[i+1]<245||pixels[i+2]<245;
     if(a>18&&dark){if(x<left)left=x;if(x>right)right=x;if(y<top)top=y;if(y>bottom)bottom=y}
    }
    if(right<left||bottom<top){resolve('');return}
    const inkW=right-left+1,inkH=bottom-top+1,targetAspect=targetWidthCm/targetHeightCm;
    const outW=Math.max(1,Math.round(targetWidthCm*100)),outH=Math.max(1,Math.round(targetHeightCm*100)),out=document.createElement('canvas'),octx=out.getContext('2d');
    out.width=outW;out.height=outH;
    const padX=outW*.06,padY=outH*.08,scale=Math.min((outW-padX*2)/inkW,(outH-padY*2)/inkH);
    const dw=inkW*scale,dh=inkH*scale,dx=(outW-dw)/2,dy=(outH-dh)/2;
    octx.drawImage(src,left,top,inkW,inkH,dx,dy,dw,dh);
    resolve(out.toDataURL('image/png'));
   }catch(e){console.warn('署名画像の処理をスキップしました',e);resolve('')}
  };
  img.onerror=()=>{console.warn('無効な署名画像をスキップしました');resolve('')};img.src=dataUrl;
 })
}
function safeSheetName(s){return String(s||'KYK').replace(/[\\/:*?\[\]]/g,'_').slice(0,31)||'KYK'}
function uniqueSheetName(base,used){let n=safeSheetName(base),candidate=n,i=2;while(used.has(candidate)){const suffix=`_${i++}`;candidate=safeSheetName(n.slice(0,31-suffix.length)+suffix)}used.add(candidate);return candidate}
function recordSheetXml(template,d){let sheet=template;const put=(name,val,type='s')=>{const c=master.mapping[name]?.cell;if(c)sheet=setXmlCell(sheet,c,val,type)};put('現場名',d.site);put('作業日',excelSerial(d.date),'n');put('会社名',d.company);put('作成者','');put('元請確認','');d.work.forEach((w,j)=>{const i=j+1;put('作業内容'+i,w.content);put('予定人員'+i,w.planned||'',w.planned?'n':'s');put('実施人員'+i,w.actual||'',w.actual?'n':'s');put('危険性'+i,w.danger);put('可能性'+i,scoreOf(w.poss)||'',w.poss?'n':'s');put('重大性'+i,scoreOf(w.sev)||'',w.sev?'n':'s');put('総合点'+i,w.score||'',w.score?'n':'s');put('対策'+i,w.measure);put('作業責任者'+i,w.leader)});splitText(d.foremanComment,18,4).forEach((v,j)=>put('職長から'+(j+1),v));splitText(d.approval?.comment,18,4).forEach((v,j)=>put('元請から'+(j+1),v));d.workers.forEach((w,j)=>{const i=j+1;put('体調'+i,w.health);put('資格'+i,master.qualAbbr[w.qualification]||w.qualification);put('作業員'+i,'')});const yes=master.checks.find(x=>x.includes('☑'))||'☑',no=master.checks.find(x=>x.includes('□'))||'□';put('足場点検',d.checks.scaffold?yes:no);put('工具点検',d.checks.tools?yes:no);put('服装点検',d.checks.clothes?yes:no);put('保護具点検',d.checks.ppe?yes:no);return sheet}
function templateInfo(workbookXml,relsXml){const sheetTags=[...workbookXml.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g)];const kyk=sheetTags.find(m=>m[1]==='KYK');if(!kyk)throw new Error('KYKシートが見つかりません');const rid=kyk[2];const rel=[...relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Type="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)].find(m=>m[1]===rid);if(!rel)throw new Error('KYKシートの関連情報が見つかりません');return{rid,target:'xl/'+rel[3].replace(/^\//,''),relTarget:rel[3]}}
function cellToAnchor(addr){
 const m=String(addr||'').replace(/\$/g,'').match(/^([A-Z]+)(\d+)$/);if(!m)return null;
 let col=0;for(const ch of m[1])col=col*26+(ch.charCodeAt(0)-64);
 return{col:col-1,row:Number(m[2])-1}
}
async function addSignatureAnchors(drawingXml,relsXml,zip,d,sheetNo){
 let next=Math.max(100,...[...relsXml.matchAll(/Id="rId(\d+)"/g)].map(m=>Number(m[1])+1));
 const cm=360000;
 const signs=[
  {data:d.creatorSign,cell:master.mapping['作成者']?.cell,label:'creator',widthCm:2.43,heightCm:2.17},
  {data:d.approval?.signImage,cell:master.mapping['元請確認']?.cell,label:'principal',widthCm:2.43,heightCm:2.17},
  ...(d.workers||[]).map((w,j)=>({data:w.signImage,cell:master.mapping['作業員'+(j+1)]?.cell,label:'worker'+(j+1),widthCm:6.09,heightCm:1.16}))
 ];
 for(const sg of signs){
  if(!sg.data)continue;const pos=cellToAnchor(sg.cell);if(!pos)continue;
  const normalized=await normalizeSignatureDataUrl(sg.data,sg.widthCm,sg.heightCm);if(!normalized)continue;
  const rid='rId'+next++,media=`signature_${sheetNo}_${sg.label}.png`,cx=Math.round(sg.widthCm*cm),cy=Math.round(sg.heightCm*cm);
  zip.file('xl/media/'+media,dataUrlBytes(normalized));
  relsXml=relsXml.replace('</Relationships>',`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${media}"/></Relationships>`);
  const anchor=`<xdr:oneCellAnchor><xdr:from><xdr:col>${pos.col}</xdr:col><xdr:colOff>30000</xdr:colOff><xdr:row>${pos.row}</xdr:row><xdr:rowOff>30000</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${next+1000}" name="Signature ${sheetNo} ${sg.label}"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
  drawingXml=drawingXml.replace('</xdr:wsDr>',anchor+'</xdr:wsDr>')
 }
 return{drawingXml,relsXml}
}
async function exportRecords(list,fileBase){
 if(!list.length){toast('出力対象がありません');return}
 if(!master.templateBuffer){toast('KYKDBを読み込んでください');return}
 const zip=await JSZip.loadAsync(master.templateBuffer.slice(0));
 let workbook=await zip.file('xl/workbook.xml').async('string');
 let rels=await zip.file('xl/_rels/workbook.xml.rels').async('string');
 let ct=await zip.file('[Content_Types].xml').async('string');
 const info=templateInfo(workbook,rels);
 const templateSheetPath=info.target;
 const templateSheet=await zip.file(templateSheetPath).async('string');
 const templateSheetRelPath=templateSheetPath.replace(/\/([^/]+)$/,'/_rels/$1.rels');
 const templateSheetRels=await zip.file(templateSheetRelPath)?.async('string')||'';
 const templateSheetNo=Number((templateSheetPath.match(/sheet(\d+)\.xml$/)||[])[1]);
 if(!templateSheetNo)throw new Error('KYKシート番号を確認できません');

 let baseDrawingPath='',baseDrawing='',baseDrawingRelPath='',baseDrawingRels='';
 if(templateSheetRels){
  const dm=templateSheetRels.match(/<Relationship\b[^>]*Type="[^"]+\/drawing"[^>]*Target="([^"]+)"[^>]*\/>/);
  if(dm){
   baseDrawingPath=resolvePartPath(templateSheetPath,dm[1]);
   baseDrawing=await zip.file(baseDrawingPath)?.async('string')||'';
   baseDrawingRelPath=baseDrawingPath.replace(/\/([^/]+)$/,'/_rels/$1.rels');
   baseDrawingRels=await zip.file(baseDrawingRelPath)?.async('string')||'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  }
 }

 const originalSheetRels=[...rels.matchAll(/<Relationship\b[^>]*Type="[^"]+\/worksheet"[^>]*\/>/g)].map(m=>m[0]);
 const nonSheetRels=[...rels.matchAll(/<Relationship\b[^>]*\/>/g)].map(m=>m[0]).filter(x=>!x.includes('/worksheet')&&!x.includes('/calcChain'));
 const used=new Set(),sheetDefs=[],sheetRels=[];
 const sorted=[...list].sort((a,b)=>a.date.localeCompare(b.date)||a.company.localeCompare(b.company));

 // KYK以外の既存ワークシートだけを削除し、原本KYKシートは維持する。
 for(const relTag of originalSheetRels){
  const rid=(relTag.match(/Id="([^"]+)"/)||[])[1];
  const target=(relTag.match(/Target="([^"]+)"/)||[])[1];
  if(!rid||!target||rid===info.rid)continue;
  const path='xl/'+target.replace(/^\//,'');
  zip.remove(path);
  zip.remove(path.replace(/\/([^/]+)$/,'/_rels/$1.rels'));
 }
 zip.remove('xl/calcChain.xml');

 for(let idx=0;idx<sorted.length;idx++){
  const d=sorted[idx],n=idx+1;
  const isFirst=idx===0;
  const sheetPath=isFirst?templateSheetPath:`xl/worksheets/kyk_sheet_${n}.xml`;
  const sheetRelPath=sheetPath.replace(/\/([^/]+)$/,'/_rels/$1.rels');
  const rid=isFirst?info.rid:`rIdKYK${n}`;
  const name=uniqueSheetName(`${d.companyAlias||master.companyAliases[d.company]||d.company}_${d.date.slice(5).replace('-','')}`,used);
  zip.file(sheetPath,recordSheetXml(templateSheet,d));

  if(templateSheetRels){
   let sr=templateSheetRels;
   if(baseDrawing){
    const drawPath=isFirst?baseDrawingPath:`xl/drawings/kyk_drawing_${n}.xml`;
    const drawRelPath=drawPath.replace(/\/([^/]+)$/,'/_rels/$1.rels');
    const relativeDraw=relativePartTarget(sheetPath,drawPath);
    sr=sr.replace(/(<Relationship\b[^>]*Type="[^"]+\/drawing"[^>]*Target=")[^"]+("[^>]*\/>)/,`$1${relativeDraw}$2`);
    const out=await addSignatureAnchors(baseDrawing,baseDrawingRels,zip,d,n);
    zip.file(drawPath,out.drawingXml);
    zip.file(drawRelPath,out.relsXml);
   }
   zip.file(sheetRelPath,sr);
  }
  sheetDefs.push(`<sheet name="${xmlAttr(name)}" sheetId="${n}" r:id="${rid}"/>`);
  const relTarget=sheetPath.replace(/^xl\//,'');
  sheetRels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="${relTarget}"/>`);
 }

 workbook=workbook.replace(/<sheets>[\s\S]*?<\/sheets>/,`<sheets>${sheetDefs.join('')}</sheets>`)
  .replace(/activeTab="\d+"/g,'activeTab="0"').replace(/firstSheet="\d+"/g,'firstSheet="0"');
 const kykPrintArea=templatePrintArea(workbook,'KYK','$A$1:$AC$46');
 const printNames=printAreaDefinedNames([...used],kykPrintArea);
 if(/<definedNames>[\s\S]*?<\/definedNames>/.test(workbook))workbook=workbook.replace(/<definedNames>[\s\S]*?<\/definedNames>/,`<definedNames>${printNames}</definedNames>`);
 else workbook=workbook.replace('</workbook>',`<definedNames>${printNames}</definedNames></workbook>`);
 zip.file('xl/workbook.xml',workbook);
 rels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${nonSheetRels.join('')}${sheetRels.join('')}</Relationships>`;
 zip.file('xl/_rels/workbook.xml.rels',rels);

 // Content Typesは原本KYKの定義を残し、複製分だけ追加する。
 ct=ct.replace(/<Override PartName="\/xl\/worksheets\/[^"]+" ContentType="application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.worksheet\+xml"\/>/g,m=>m.includes(`/xl/worksheets/sheet${templateSheetNo}.xml`)?m:'')
      .replace(/<Override PartName="\/xl\/calcChain\.xml"[^>]*\/>/g,'');
 const extraSheetOverrides=sorted.slice(1).map((_,i)=>`<Override PartName="/xl/worksheets/kyk_sheet_${i+2}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
 const extraDrawingOverrides=baseDrawing?sorted.slice(1).map((_,i)=>`<Override PartName="/xl/drawings/kyk_drawing_${i+2}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`).join(''):'';
 ct=ct.replace('</Types>',extraSheetOverrides+extraDrawingOverrides+(ct.includes('Extension="png"')?'':'<Default Extension="png" ContentType="image/png"/>')+'</Types>');
 zip.file('[Content_Types].xml',ct);

 const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),a=document.createElement('a');
 a.href=URL.createObjectURL(blob);a.download=`${safeSheetName(fileBase)}_KYK.xlsx`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
 toast(`${list.length}件を1つのExcelに出力しました`)
}
function resolvePartPath(basePath,target){
 const parts=basePath.split('/');parts.pop();
 for(const p of target.split('/')){if(!p||p==='.')continue;if(p==='..')parts.pop();else parts.push(p)}
 return parts.join('/')
}
function relativePartTarget(fromPath,toPath){
 const from=fromPath.split('/');from.pop();const to=toPath.split('/');
 let i=0;while(i<from.length&&i<to.length&&from[i]===to[i])i++;
 return '../'.repeat(from.length-i)+to.slice(i).join('/')
}

function readLocalJournals(){try{const v=JSON.parse(localStorage.getItem(JOURNAL_STORE)||'[]');return Array.isArray(v)?v:[]}catch{return []}}
function validJournal(j){return j&&typeof j.site==='string'&&j.site.trim()&&/^\d{4}-\d{2}-\d{2}$/.test(String(j.date||''))}
function journals(){return readLocalJournals().filter(validJournal)}
function removeBrokenJournals(){const raw=readLocalJournals(),valid=raw.filter(validJournal);if(valid.length!==raw.length){saveJournals(valid);return raw.length-valid.length}return 0}
function saveJournals(v){localStorage.setItem(JOURNAL_STORE,JSON.stringify(v));vaultPut(JOURNAL_MIRROR_KEY,{journals:v,updatedAt:new Date().toISOString(),appVersion:APP_VERSION}).catch(e=>console.warn('日誌バックアップ失敗',e))}
function journalKey(site,date){return `${site}\u0000${date}`}
function activeKyFor(site,date){return records().filter(x=>!x.deleted&&x.site===site&&x.date===date).sort((a,b)=>(a.history?.[0]?.at||a.updatedAt).localeCompare(b.history?.[0]?.at||b.updatedAt))}
function journalCandidates(){const made=new Set(journals().filter(x=>!x.deleted).map(x=>journalKey(x.site,x.date))),map=new Map();records().filter(x=>!x.deleted).forEach(x=>{const k=journalKey(x.site,x.date);if(!made.has(k)){if(!map.has(k))map.set(k,{site:x.site,date:x.date,count:0});map.get(k).count++}});return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.site.localeCompare(b.site,'ja'))}
function renderJournalCandidates(){const list=journalCandidates();$('#journalCandidateList').innerHTML=list.length?list.map((x,i)=>`<label class="card journal-candidate"><input class="journal-candidate-check" type="checkbox" data-site="${esc(x.site)}" data-date="${esc(x.date)}"><div><strong>${esc(x.site)}</strong><div>${esc(x.date)}／KY ${x.count}社</div></div></label>`).join(''):'<div class="card">自動作成待ちの日誌はありません。</div>'}
function createSelectedJournals(){const selected=$$('.journal-candidate-check:checked');if(!selected.length){toast('作成する日誌を選択してください');return}const all=journals(),made=new Set(all.filter(x=>!x.deleted).map(x=>journalKey(x.site,x.date))),now=new Date().toISOString();let count=0;selected.forEach(el=>{const site=el.dataset.site||'',date=el.dataset.date||'';if(!site||!/^\d{4}-\d{2}-\d{2}$/.test(date)||made.has(journalKey(site,date)))return;all.push({id:uid(),site,date,siteAlias:master.siteAliases[site]||site,contact:Array(6).fill(''),quality:Array(6).fill(''),deleted:false,createdAt:now,updatedAt:now});made.add(journalKey(site,date));count++});saveJournals(all);toast(`${count}件の日誌を作成しました`);renderJournalCandidates()}
function filteredJournals(){const site=$('#journalSearchSite')?.value||'',from=$('#journalSearchDateFrom')?.value||'',to=$('#journalSearchDateTo')?.value||'',missing=$('#journalMissingOnly')?.checked;return journals().filter(x=>!x.deleted&&(!site||x.site===site)&&(!from||x.date>=from)&&(!to||x.date<=to)&&(!missing||!(x.contact||[]).some(v=>String(v).trim()))).sort((a,b)=>a.date.localeCompare(b.date)||a.site.localeCompare(b.site,'ja'))}
function clearJournalDateRange(){if($('#journalSearchDateFrom'))$('#journalSearchDateFrom').value='';if($('#journalSearchDateTo'))$('#journalSearchDateTo').value='';renderJournalList()}
function renderJournalList(){const list=filteredJournals(),site=$('#journalSearchSite').value;$('#journalExportInfo').textContent=!site?'現場名を選択してください。':list.length?`選択現場の表示中 ${list.length}件`:'対象なし';$('#btnJournalBulkExport').disabled=!site||!list.length;$('#journalBulkDeleteInfo').textContent=!site?'現場名を選択してください。':list.length?`選択現場の表示中 ${list.length}件だけを削除します。`:'削除対象はありません。';$('#btnJournalBulkDelete').disabled=!site||!list.length;$('#journalList').innerHTML=list.length?list.map(j=>{const done=(j.contact||[]).some(v=>String(v).trim());const ky=activeKyFor(j.site,j.date);return`<div class="record-card"><strong>${esc(j.site)}</strong><div>${esc(j.date)}／業者数 ${ky.length}社</div><div class="meta">品質に関する事項：${(j.quality||[]).some(v=>String(v).trim())?'記入済み':'空欄'}</div><span class="${done?'done-contact':'missing-contact'}">元請連絡：${done?'記入済み':'未記入'}</span><div class="row"><button onclick="openJournal('${j.id}')">入力・修正</button><button onclick="exportJournal('${j.id}')">個別Excel出力</button></div></div>`}).join(''):'<div class="card">該当する日誌はありません。</div>'}

function visibleJournalLineCount(id){return Array.from({length:6},(_,i)=>$('#'+id+(i+1))).filter(x=>x&&!x.hidden).length}
function setJournalLineVisibility(id,count){count=Math.max(1,Math.min(6,count));for(let i=1;i<=6;i++){const row=$('#'+id+i)?.closest('.journal-line');if(row)row.hidden=i>count}const btn=$(id==='journalContact'?'#btnAddJournalContact':'#btnAddJournalQuality');if(btn){btn.hidden=count>=6;btn.disabled=count>=6}}
function addJournalLine(id){setJournalLineVisibility(id,visibleJournalLineCount(id)+1);const n=visibleJournalLineCount(id);$('#'+id+n)?.focus()}
function buildJournalInputs(){const make=(id,max)=>Array.from({length:6},(_,i)=>`<label class="journal-line compact" ${i?'hidden':''}><span class="journal-line-number">${i+1}</span><textarea id="${id}${i+1}" maxlength="${max}" rows="1"></textarea><div class="counter"><span id="${id}Count${i+1}">0</span>/${max}</div></label>`).join('');$('#journalContactInputs').innerHTML=make('journalContact',55);$('#journalQualityInputs').innerHTML=make('journalQuality',40);for(const [id,max] of [['journalContact',55],['journalQuality',40]])for(let i=1;i<=6;i++)$('#'+id+i).oninput=e=>{const v=e.target.value;$('#'+id+'Count'+i).textContent=v.length;if(v.trim()&&i<6){const next=$('#'+id+(i+1))?.closest('.journal-line');if(next?.hidden){next.hidden=false}}};setJournalLineVisibility('journalContact',1);setJournalLineVisibility('journalQuality',1)}
function journalWorkSummaryHtml(j,latest=false){const kys=activeKyFor(j.site,j.date);const rows=kys.map((d,i)=>{const actual=(d.work||[]).reduce((sum,w)=>sum+(Number(w.actual)||0),0);const content=d.work?.[0]?.content||'';return `<tr><td class="journal-row-no">${i+1}</td><td>${esc(d.company)}</td><td class="journal-worker-total">${actual}名</td><td>${esc(content)}</td></tr>`}).join('');return `<div class="journal-summary-head"><div><span>現場名</span><strong>${esc(j.site)}</strong></div><div><span>作業日</span><strong>${esc(j.date)}</strong></div></div><h3 class="journal-work-title">当日の作業内容一覧（KYKより）${latest?' <small>最新情報</small>':''}</h3><div class="journal-work-table-wrap"><table class="journal-work-table"><thead><tr><th></th><th>会社名</th><th>実施人員合計<br><small>（作業1～4）</small></th><th>作業内容1</th></tr></thead><tbody>${rows||'<tr><td colspan="4" class="meta">該当するKYKがありません。</td></tr>'}</tbody></table></div><p class="meta journal-worker-note">※実施人員は、作業1～4の実施人員の合計です。</p>`}
function renderJournalEditSummary(j,latest=false){$('#journalSummary').innerHTML=journalWorkSummaryHtml(j,latest)}
function openJournal(id){const j=journals().find(x=>x.id===id);if(!j)return;editingJournalId=id;renderJournalEditSummary(j);for(let i=1;i<=6;i++){const c=(j.contact||[])[i-1]||'',q=(j.quality||[])[i-1]||'';$('#journalContact'+i).value=c;$('#journalContactCount'+i).textContent=c.length;$('#journalQuality'+i).value=q;$('#journalQualityCount'+i).textContent=q.length}const visibleCount=a=>{const last=Math.max(0,...a.map((v,i)=>String(v||'').trim()?i+1:0));return Math.min(6,Math.max(1,last+(last<6?1:0)))};setJournalLineVisibility('journalContact',visibleCount(j.contact||[]));setJournalLineVisibility('journalQuality',visibleCount(j.quality||[]));go('journal-edit');setTimeout(()=>offerJournalCopy(j),100)}
function saveJournalEdit(){const all=journals(),j=all.find(x=>x.id===editingJournalId);if(!j)return;j.contact=Array.from({length:6},(_,i)=>$('#journalContact'+(i+1)).value.trim());j.quality=Array.from({length:6},(_,i)=>$('#journalQuality'+(i+1)).value.trim());j.updatedAt=new Date().toISOString();saveJournals(all);toast('日誌を保存しました');go('journal-list')}
function bulkDeleteJournals(){const site=$('#journalSearchSite')?.value||'';if(!site){toast('現場名を選択してから一括削除してください');return}const targets=filteredJournals();if(!targets.length){toast('削除対象がありません');return}if(!confirm(`現在表示中の日誌 ${targets.length}件を削除します。
本当に削除しますか？`))return;const ids=new Set(targets.map(x=>x.id)),now=new Date().toISOString(),all=journals();all.forEach(j=>{if(ids.has(j.id)){j.deleted=true;j.updatedAt=now}});saveJournals(all);toast(`${targets.length}件の日誌を削除しました`);renderJournalList()}

function rangeCellForIndex(spec,idx){const m=String(spec||'').replace(/〜/g,'～').match(/^([A-Z]+)(\d+)～([A-Z]+)(\d+)$/);if(!m)return spec;return `${m[1]}${Number(m[2])+idx}`}
function journalSheetXml(template,j){let sheet=template;const put=(name,val,type='s',idx=null)=>{const spec=master.mapping[name]?.journalCell;if(!spec)return;const c=idx===null?spec:rangeCellForIndex(spec,idx);if(c&&!c.includes('～'))sheet=setXmlCell(sheet,c,val,type)};put('現場名',j.site);put('作業日',excelSerial(j.date),'n');const kys=activeKyFor(j.site,j.date).slice(0,10);let plannedGrandTotal=0,actualGrandTotal=0;kys.forEach((d,i)=>{const planned=(d.work||[]).reduce((s,w)=>s+(Number(w.planned)||0),0),actual=(d.work||[]).reduce((s,w)=>s+(Number(w.actual)||0),0);plannedGrandTotal+=planned;actualGrandTotal+=actual;put('会社名',d.company,'s',i);put('作業内容1',d.work?.[0]?.content||'','s',i);put('予定人員計',planned,'n',i);put('実施人員計',actual,'n',i);put('作業責任者1',d.work?.[0]?.leader||'','s',i);put('対策1',d.work?.[0]?.measure||'','s',i)});put('日誌予定人員計',plannedGrandTotal,'n');put('日誌実施人員計',actualGrandTotal,'n');(j.contact||[]).forEach((v,i)=>put('元請連絡'+(i+1),v));(j.quality||[]).forEach((v,i)=>put('品質に関する事項'+(i+1),v));return sheet}
function templateInfoNamed(workbookXml,relsXml,name){const tags=[...workbookXml.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g)];const sh=tags.find(m=>m[1]===name);if(!sh)throw new Error(`${name}シートが見つかりません`);const rel=[...relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Type="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)].find(m=>m[1]===sh[2]);if(!rel)throw new Error(`${name}シートの関連情報が見つかりません`);return{rid:sh[2],target:'xl/'+rel[3].replace(/^\//,'')}}
async function exportJournals(listOverride=null){try{const isBulk=!Array.isArray(listOverride),selectedSite=isBulk?$('#journalSearchSite').value:'';if(isBulk&&!selectedSite){toast('現場名を選択してから一括出力してください');return}const list=Array.isArray(listOverride)?listOverride:filteredJournals();if(!list.length)throw new Error('出力対象がありません');if(isBulk&&list.some(j=>j.site!==selectedSite))throw new Error('日誌一括出力は同一現場だけが対象です');if(!master.templateBuffer)throw new Error('KYKDBを読み込んでください');const zip=await JSZip.loadAsync(master.templateBuffer.slice(0));let workbook=await zip.file('xl/workbook.xml').async('string'),rels=await zip.file('xl/_rels/workbook.xml.rels').async('string'),ct=await zip.file('[Content_Types].xml').async('string');const info=templateInfoNamed(workbook,rels,'日誌'),journalPrintArea=templatePrintArea(workbook,'日誌','$A$1:$BX$27'),template=await zip.file(info.target).async('string'),templateNo=Number((info.target.match(/sheet(\d+)\.xml$/)||[])[1]);const original=[...rels.matchAll(/<Relationship\b[^>]*Type="[^"]+\/worksheet"[^>]*\/>/g)].map(m=>m[0]),non=[...rels.matchAll(/<Relationship\b[^>]*\/>/g)].map(m=>m[0]).filter(x=>!x.includes('/worksheet')&&!x.includes('/calcChain'));for(const tag of original){const rid=(tag.match(/Id="([^"]+)"/)||[])[1],target=(tag.match(/Target="([^"]+)"/)||[])[1];if(!rid||!target||rid===info.rid)continue;const p='xl/'+target.replace(/^\//,'');zip.remove(p);zip.remove(p.replace(/\/([^/]+)$/,'/_rels/$1.rels'))}zip.remove('xl/calcChain.xml');const used=new Set(),defs=[],srels=[];list.forEach((j,idx)=>{const n=idx+1,first=idx===0,path=first?info.target:`xl/worksheets/journal_sheet_${n}.xml`,rid=first?info.rid:`rIdJournal${n}`,nm=uniqueSheetName(`${j.siteAlias||master.siteAliases[j.site]||j.site}_${j.date.slice(5).replace('-','')}`,used);zip.file(path,journalSheetXml(template,j));defs.push(`<sheet name="${xmlAttr(nm)}" sheetId="${n}" r:id="${rid}"/>`);srels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="${path.replace(/^xl\//,'')}"/>`)});workbook=workbook.replace(/<sheets>[\s\S]*?<\/sheets>/,`<sheets>${defs.join('')}</sheets>`).replace(/activeTab="\d+"/g,'activeTab="0"').replace(/firstSheet="\d+"/g,'firstSheet="0"');const print=printAreaDefinedNames([...used],journalPrintArea);if(/<definedNames>[\s\S]*?<\/definedNames>/.test(workbook))workbook=workbook.replace(/<definedNames>[\s\S]*?<\/definedNames>/,`<definedNames>${print}</definedNames>`);else workbook=workbook.replace('</workbook>',`<definedNames>${print}</definedNames></workbook>`);zip.file('xl/workbook.xml',workbook);zip.file('xl/_rels/workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${non.join('')}${srels.join('')}</Relationships>`);ct=ct.replace(/<Override PartName="\/xl\/worksheets\/[^"]+" ContentType="application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.worksheet\+xml"\/>/g,m=>m.includes(`/xl/worksheets/sheet${templateNo}.xml`)?m:'').replace(/<Override PartName="\/xl\/calcChain\.xml"[^>]*\/>/g,'');ct=ct.replace('</Types>',list.slice(1).map((_,i)=>`<Override PartName="/xl/worksheets/journal_sheet_${i+2}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')+'</Types>');zip.file('[Content_Types].xml',ct);const dates=list.map(x=>x.date).sort(),sites=[...new Set(list.map(x=>x.siteAlias||master.siteAliases[x.site]||x.site))],range=`${dates[0].slice(5).replace('-','')}-${dates.at(-1).slice(5).replace('-','')}`,base=list.length===1?`日誌_${sites[0]}_${dates[0].replace(/-/g,'')}`:sites.length===1?`${sites[0]}_${range}`:`日誌一括_${range}`,blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${safeSheetName(base)}.xlsx`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);toast(`${list.length}件の日誌を一括出力しました`)}catch(e){console.error(e);toast('日誌Excel出力に失敗しました：'+e.message)}}
async function exportJournal(id){const j=journals().find(x=>x.id===id&&!x.deleted);if(!j){toast('日誌が見つかりません');return}await exportJournals([j])}

function journalCopyCandidates(j){return journals().filter(x=>!x.deleted&&x.site===j.site&&x.date<j.date&&((x.contact||[]).some(v=>String(v).trim())||(x.quality||[]).some(v=>String(v).trim()))).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5)}
function currentJournalFieldsEmpty(){const c=Array.from({length:6},(_,i)=>$('#journalContact'+(i+1)).value.trim()),q=Array.from({length:6},(_,i)=>$('#journalQuality'+(i+1)).value.trim());return{contactEmpty:!c.some(Boolean),qualityEmpty:!q.some(Boolean)}}
function copyJournalFieldsFrom(src){const state=currentJournalFieldsEmpty();for(let i=1;i<=6;i++){if(state.contactEmpty){const v=(src.contact||[])[i-1]||'';$('#journalContact'+i).value=v;$('#journalContactCount'+i).textContent=v.length}if(state.qualityEmpty){const v=(src.quality||[])[i-1]||'';$('#journalQuality'+i).value=v;$('#journalQualityCount'+i).textContent=v.length}}setJournalLineVisibility('journalContact',Math.max(1,...Array.from({length:6},(_,i)=>$('#journalContact'+(i+1)).value.trim()?i+1:0)));setJournalLineVisibility('journalQuality',Math.max(1,...Array.from({length:6},(_,i)=>$('#journalQuality'+(i+1)).value.trim()?i+1:0)));toast(`${src.date}の日誌からコピーしました`)}
function closeJournalCopyModal(){const m=$('#journalCopyModal');if(m)m.hidden=true}
function offerJournalCopy(j){const st=currentJournalFieldsEmpty();if(!st.contactEmpty&&!st.qualityEmpty)return;const list=journalCopyCandidates(j);if(!list.length)return;const latest=list[0],m=$('#journalCopyModal');$('#journalCopyPrompt').textContent=`前回（${latest.date}）の日誌から「元請連絡」と「品質に関する事項」をコピーしますか？`;$('#journalCopyCandidates').hidden=true;$('#journalCopyCandidates').innerHTML='';$('#journalCopyActions').hidden=false;m.hidden=false;$('#btnJournalCopyYes').onclick=()=>{copyJournalFieldsFrom(latest);closeJournalCopyModal()};$('#btnJournalCopyNo').onclick=closeJournalCopyModal;$('#btnJournalCopyChoose').onclick=()=>{const box=$('#journalCopyCandidates');box.innerHTML=`<p class="meta">同一現場の直近5件から選択してください。</p>${list.map(x=>`<button class="journal-copy-candidate" data-id="${x.id}"><strong>${x.date}</strong><span>元請連絡：${esc(((x.contact||[]).filter(Boolean)[0]||'空欄').slice(0,28))}</span><span>品質：${esc(((x.quality||[]).filter(Boolean)[0]||'空欄').slice(0,28))}</span></button>`).join('')}<button id="btnJournalCopyBack">戻る</button>`;box.hidden=false;$('#journalCopyActions').hidden=true;box.querySelectorAll('.journal-copy-candidate').forEach(b=>b.onclick=()=>{const src=list.find(x=>x.id===b.dataset.id);if(src)copyJournalFieldsFrom(src);closeJournalCopyModal()});$('#btnJournalCopyBack').onclick=()=>{box.hidden=true;$('#journalCopyActions').hidden=false}}}
function backupPayload(){return{format:'KYK_BACKUP_V1',appVersion:APP_VERSION,createdAt:new Date().toISOString(),records:records(),journals:journals(),masterData:{sites:master.sites,siteAliases:master.siteAliases,companies:master.companies,companyAliases:master.companyAliases,possibilities:master.possibilities,severities:master.severities,health:master.health,qualifications:master.qualifications,qualAbbr:master.qualAbbr,checks:master.checks,mapping:master.mapping,fileName:master.fileName,loadedAt:master.loadedAt}}}
async function createManualBackup(){try{const payload=backupPayload(),text=JSON.stringify(payload);const zip=new JSZip();zip.file('backup.json',text);zip.file('README.txt','KYK管理システム バックアップ\nKYKDB.xlsx本体は含まれません。');const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'}),a=document.createElement('a'),d=payload.createdAt.replace(/[-:T]/g,'').slice(0,12);a.href=URL.createObjectURL(blob);a.download=`KYK管理バックアップ_${d}.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);toast('バックアップを作成しました')}catch(e){console.error(e);toast('バックアップ作成に失敗しました：'+e.message)}}
async function restoreBackupFile(file){try{const zip=await JSZip.loadAsync(file),f=zip.file('backup.json');if(!f)throw new Error('backup.jsonがありません');const data=JSON.parse(await f.async('string'));if(data.format!=='KYK_BACKUP_V1'||!Array.isArray(data.records)||!Array.isArray(data.journals))throw new Error('対応していないバックアップです');if(!confirm(`KYK ${data.records.length}件、日誌 ${data.journals.length}件で現在のデータを置き換えます。よろしいですか？`))return;saveRecords(data.records);saveJournals(data.journals);toast('復元しました');renderDashboard()}catch(e){console.error(e);toast('復元に失敗しました：'+e.message)}}
function renderDashboard(){const el=$('#dashboard');if(!el)return;const r=records().filter(x=>!x.deleted),j=journals().filter(x=>!x.deleted),waiting=r.filter(x=>!x.approval||x.approval.status==='modified').length,missing=j.filter(x=>!(x.contact||[]).some(v=>String(v).trim())).length;el.innerHTML=`<div class="dashboard-card"><span>保存済みKY</span><strong>${r.length}</strong></div><div class="dashboard-card"><span>元請確認待ち</span><strong>${waiting}</strong></div><div class="dashboard-card"><span>作成済み日誌</span><strong>${j.length}</strong></div><div class="dashboard-card"><span>元請連絡未記入</span><strong>${missing}</strong></div>`}
window.openJournal=openJournal;window.exportJournal=exportJournal;

async function exportRecord(id){try{const d=records().find(x=>x.id===id);if(d)await exportRecords([d],`${d.site}_${d.companyAlias||d.company}_${d.date}`)}catch(e){console.error(e);toast('Excel出力に失敗しました：'+e.message)}}
async function exportBulk(){try{const selectedSite=$('#searchSite').value;if(!selectedSite){toast('現場名を選択してから一括出力してください');return}const list=filteredSavedRecords();if(!list.length){toast('出力対象がありません');return}const sites=[...new Set(list.map(x=>x.site))];if(sites.length!==1||sites[0]!==selectedSite){toast('KYK一括出力は同一現場だけが対象です');return}const alias=master.siteAliases[selectedSite]||selectedSite,dates=[...new Set(list.map(x=>x.date))].sort(),datePart=dates.length===1?dates[0].replace(/-/g,''):`${dates[0].slice(5).replace('-','')}-${dates.at(-1).slice(5).replace('-','')}`;await exportRecords(list,`${alias}_${datePart}`)}catch(e){console.error(e);toast('一括Excel出力に失敗しました：'+e.message)}}
window.editRecord=id=>{const d=records().find(x=>x.id===id);if(d)fill(d)};window.openApproval=openApproval;window.exportRecord=exportRecord;
document.addEventListener('DOMContentLoaded',async()=>{const bi=document.getElementById('buildInfo');if(bi)bi.textContent=`Build ${APP_BUILD}`;await ensureRecordSafety();const removedBrokenJournals=removeBrokenJournals();buildRows();buildJournalInputs();creatorPad=setupPad($('#creatorPad'),$('#creatorSignStatus'),$('#clearCreator'),v=>creatorSign=v,2.2);workerPads=[1,2,3,4,5,6,7,8].map(i=>setupPad($('#workerPad'+i),$('#workerSignStatus'+i),$('#clearWorker'+i),v=>workerSigns[i-1]=v,2.2));principalPad=setupPad($('#principalPad'),$('#principalSignStatus'),$('#clearPrincipal'),v=>principalSign=v,2.2);hydrateMasters();resetForm();if(removedBrokenJournals)toast(`不完全な日誌データ${removedBrokenJournals}件を整理しました。自動作成から作り直せます`);['#workDate','#site','#company'].forEach(sel=>{$(sel).addEventListener('input',()=>{updateRequiredHighlights();updatePreviousCopyInfo()});$(sel).addEventListener('change',()=>{updateRequiredHighlights();updatePreviousCopyInfo()})});$$('[data-go]').forEach(b=>b.onclick=()=>{const t=b.dataset.go;if(!master.templateBuffer&&!['top','saved','approval','journal-list'].includes(t)){toast('先にKYKDBを読み込んでください');return}if(b.id==='btnNewRecord')resetForm();if(t==='workers'&&!prepareWorkerScreen())return;go(t)});bindClick('#btnDb',()=>$('#dbFile').click());$('#dbFile').onchange=async e=>{try{await loadFile(e.target.files[0]);e.target.value=''}catch(err){console.error(err);toast(err.message)}};bindClick('#btnSave',saveCurrent);bindClick('#btnCopyPrevious',copyMarkedFieldsFromPrevious);bindClick('#btnDelete',deleteCurrent);bindClick('#btnApprove',approve);bindClick('#btnPrincipalCopy',openPrincipalCopyModal);bindEvent('#searchSite','change',renderSaved);bindEvent('#searchCompany','change',renderSaved);bindEvent('#searchDateFrom','input',renderSaved);bindEvent('#searchDateTo','input',renderSaved);bindClick('#btnSavedAllDates',clearSavedDateRange);bindClick('#btnBulkExport',exportBulk);bindClick('#btnBulkDelete',bulkDeleteSaved);bindEvent('#approvalSite','change',renderApproval);bindEvent('#includeApproved','change',renderApproval);bindEvent('#journalSearchSite','change',renderJournalList);bindEvent('#journalSearchDateFrom','input',renderJournalList);bindEvent('#journalSearchDateTo','input',renderJournalList);bindClick('#btnJournalAllDates',clearJournalDateRange);bindEvent('#journalMissingOnly','change',renderJournalList);bindClick('#btnJournalSelectAll',()=>$$('.journal-candidate-check').forEach(x=>x.checked=true));bindClick('#btnJournalCreateSelected',createSelectedJournals);bindClick('#btnJournalSave',saveJournalEdit);bindClick('#btnJournalBulkExport',exportJournals);bindClick('#btnBackupCreate',createManualBackup);bindClick('#btnBackupRestore',()=>$('#backupFile').click());$('#backupFile').onchange=e=>{const f=e.target.files[0];if(f)restoreBackupFile(f);e.target.value=''};bindClick('#btnJournalBulkDelete',bulkDeleteJournals);$('#foremanComment').oninput=e=>$('#foremanCount').textContent=e.target.value.length;$('#principalComment').oninput=e=>$('#principalCount').textContent=e.target.value.length;bindClick('#prevWork',()=>showWork(currentWork-1));bindClick('#nextWork',()=>showWork(currentWork+1));bindClick('#addWork',()=>{if(activeWorkCount<4){activeWorkCount++;showWork(activeWorkCount-1)}});$('#removeWork').onclick=()=>{if(activeWorkCount<=1)return;if(confirm(`作業${currentWork+1}を削除しますか？`)){for(let j=currentWork+1;j<activeWorkCount;j++){['work','planned','actual','danger','poss','sev','score','measure','leader'].forEach(k=>$('#'+k+j).value=$('#'+k+(j+1)).value)}activeWorkCount--;showWork(Math.min(currentWork,activeWorkCount-1))}};try{const saved=await idbGet();if(saved?.buffer)await loadBuffer(saved.buffer,saved.name,false,saved.source||'saved');else toast('KYKDBを読み込んでください。右上の「KYKDB再読込」から選択します')}catch(e){console.warn(e)}if('serviceWorker'in navigator&&location.protocol!=='file:'){try{await navigator.serviceWorker.register('service-worker.js?v=1.6.4');navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload())}catch(e){console.warn(e)}}bindClick('#btnUpdateLater',()=>{$('#updateModal').hidden=true});bindClick('#btnUpdateNow',applyAppUpdate);renderDashboard();await checkForAppUpdate()});
