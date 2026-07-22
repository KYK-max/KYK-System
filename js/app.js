'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const STORE='kyk_records_v02', IDB='kyk_app_v02', IDB_STORE='files', DB_KEY='kykdb';
let master={sites:[],companies:[],companyAliases:{},possibilities:[],severities:[],health:[],qualifications:[],qualAbbr:{},checks:['□','☑'],mapping:{},templateBuffer:null,fileName:'',loadedAt:''};
let editingId=null,approvingId=null,currentWork=0,activeWorkCount=1,creatorSign='',principalSign='',workerSigns=Array(8).fill(''),workerPads=[];
const CANON=['現場名','作業日','会社名','作成者','元請確認',...[1,2,3,4].flatMap(i=>['作業内容'+i,'予定人員'+i,'実施人員'+i,'危険性'+i,'可能性'+i,'重大性'+i,'総合点'+i,'対策'+i,'作業責任者'+i]),...[1,2,3,4].map(i=>'職長から'+i),...[1,2,3,4].map(i=>'元請から'+i),...[1,2,3,4,5,6,7,8].flatMap(i=>['体調'+i,'資格'+i,'作業員'+i]),'足場点検','工具点検','服装点検','保護具点検'];
function canonical(s){s=String(s||'').replace(/\s/g,'');return CANON.find(x=>s.startsWith(x))||String(s||'').trim()}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function records(){try{return JSON.parse(localStorage.getItem(STORE)||'[]')}catch{return []}}
function saveRecords(v){localStorage.setItem(STORE,JSON.stringify(v))}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(IDB,1);r.onupgradeneeded=()=>r.result.createObjectStore(IDB_STORE);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function idbPut(v){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(IDB_STORE,'readwrite');tx.objectStore(IDB_STORE).put(v,DB_KEY);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
async function idbGet(){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction(IDB_STORE).objectStore(IDB_STORE).get(DB_KEY);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function go(name){$$('.screen').forEach(x=>x.classList.remove('active'));$('#screen-'+name).classList.add('active');scrollTo(0,0);if(name==='basic'&&!editingId)resetForm();if(name==='saved')renderSaved();if(name==='approval')renderApproval();if(name==='work')showWork(currentWork)}
function selectOptions(el,values,blank='選択してください'){const cur=el.value;el.innerHTML=`<option value="">${blank}</option>`+values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');if(values.includes(cur))el.value=cur}
function hydrateMasters(){['#site','#searchSite','#approvalSite'].forEach(x=>selectOptions($(x),master.sites,x==='#site'?'選択してください':'すべて'));['#company','#searchCompany'].forEach(x=>selectOptions($(x),master.companies,x==='#company'?'選択してください':'すべて'));$$('.health-select').forEach(x=>selectOptions(x,master.health));$$('.qual-select').forEach(x=>selectOptions(x,master.qualifications));$$('.poss-select').forEach(x=>selectOptions(x,master.possibilities,'選択'));$$('.sev-select').forEach(x=>selectOptions(x,master.severities,'選択'))}
function scoreOf(v){const m=String(v||'').match(/^\s*([０-９0-9]+)/);return m?Number(m[1].replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-65248))):0}
function buildRows(){
 $('#workRows').innerHTML=[1,2,3,4].map(i=>`<div class="work-card" id="workCard${i}"><h3>作業 ${i}</h3><label>作業内容（25文字）<input id="work${i}" maxlength="25"></label><div class="work-grid"><label class="num2">予定人員<input id="planned${i}" type="number" min="0" max="99" inputmode="numeric"></label><label class="num2">実施人員<input id="actual${i}" type="number" min="0" max="99" inputmode="numeric"></label><label>作業責任者（苗字）<input id="leader${i}" maxlength="12"></label></div><div class="risk-grid"><label>危険性（22文字）<input id="danger${i}" maxlength="22"></label><label class="num2">可能性<select class="poss-select" id="poss${i}"></select></label><label class="num2">重大性<select class="sev-select" id="sev${i}"></select></label><label class="num2">総合点<input class="score" id="score${i}" readonly></label><div class="wide-select-panel" id="riskHelp${i}"></div></div><label>対策（25文字）<input id="measure${i}" maxlength="25"></label></div>`).join('');
 $('#workerRows').innerHTML=[1,2,3,4,5,6,7,8].map(i=>`<div class="worker-card"><h3>作業員 ${i}</h3><div class="worker-grid"><div><div class="label-title">氏名（手書きサイン）</div><canvas class="sign-pad worker-sign-pad" id="workerPad${i}"></canvas><div class="sign-actions"><button type="button" id="clearWorker${i}">書き直す</button><span id="workerSignStatus${i}">未署名</span></div></div><label>体調<select class="health-select" id="health${i}"></select></label><label>資格<select class="qual-select" id="qual${i}"></select></label></div></div>`).join('');
 [1,2,3,4].forEach(i=>{const calc=()=>{const p=scoreOf($('#poss'+i).value),s=scoreOf($('#sev'+i).value);$('#score'+i).value=p&&s?p*s:'';$('#riskHelp'+i).textContent=`可能性：${$('#poss'+i).value||'未選択'}　重大性：${$('#sev'+i).value||'未選択'}`};$('#poss'+i).onchange=calc;$('#sev'+i).onchange=calc});
}
function showWork(idx){currentWork=Math.max(0,Math.min(idx,activeWorkCount-1));[1,2,3,4].forEach(i=>$('#workCard'+i).hidden=i!==currentWork+1);$('#workIndicator').textContent=`作業 ${currentWork+1}／${activeWorkCount}`;$('#prevWork').disabled=currentWork===0;$('#nextWork').disabled=currentWork===activeWorkCount-1;$('#addWork').disabled=activeWorkCount>=4;$('#removeWork').hidden=activeWorkCount===1}
function parseDB(wb){const ws=wb.Sheets.DB;if(!ws)throw new Error('DBシートがありません');const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:false});const mapping={};rows.slice(1).forEach(r=>{if(r[1]&&r[2])mapping[canonical(r[1])] = {cell:String(r[2]).trim(),condition:r[3],required:String(r[4]||'').startsWith('必須'),copy:String(r[5]||'').startsWith('○'),search:String(r[6]||'').startsWith('○')}});const unique=col=>[...new Set(rows.slice(1).map(r=>r[col]).filter(v=>v!==null&&String(v).trim()).map(v=>String(v).trim()))];const companies=unique(8),aliases=unique(9),companyAliases={};companies.forEach((c,i)=>companyAliases[c]=aliases[i]||c);const qualifications=unique(13),abbr=unique(14),qualAbbr={};qualifications.forEach((q,i)=>qualAbbr[q]=abbr[i]||q);return{sites:unique(7),companies,companyAliases,possibilities:unique(10),severities:unique(11),health:unique(12),qualifications,qualAbbr,checks:unique(15).length?unique(15):['□','☑'],mapping}}
async function loadBuffer(buf,name,save=true){if(!window.XLSX)throw new Error('Excel処理ライブラリを読み込めません。インターネット接続を確認してください');const wb=XLSX.read(buf,{type:'array',cellDates:true});if(!wb.SheetNames.includes('KYK'))throw new Error('KYKシートがありません');const parsed=parseDB(wb);Object.assign(master,parsed,{templateBuffer:buf.slice(0),fileName:name,loadedAt:new Date().toISOString()});if(save)await idbPut({buffer:buf.slice(0),name,loadedAt:master.loadedAt});updateDbStatus();hydrateMasters();toast(save?'KYKDBを保存して読み込みました':'保存済みKYKDBを復元しました')}
async function loadFile(file){if(!file)return;await loadBuffer(await file.arrayBuffer(),file.name,true)}
function updateDbStatus(){if(!master.templateBuffer)return;const d=new Date(master.loadedAt);$('#dbStatus').textContent=`${master.fileName} 読込済み（会社${master.companies.length}件・更新 ${d.toLocaleString('ja-JP')}）`;$('#btnDb').textContent='KYKDB更新';$('#dbGuide').textContent='KYKDBは端末に保存されています。Excel原本を変更した場合のみ、右上の「KYKDB更新」から読み直してください。'}
function setupPad(canvas,status,clearBtn,onChange){let drawing=false,has=false;const ctx=canvas.getContext('2d');function resize(){const r=canvas.getBoundingClientRect(),old=has?canvas.toDataURL():'';canvas.width=Math.round(r.width*devicePixelRatio);canvas.height=Math.round(r.height*devicePixelRatio);ctx.scale(devicePixelRatio,devicePixelRatio);ctx.lineWidth=2.2;ctx.lineCap='round';ctx.strokeStyle='#111';if(old){const im=new Image();im.onload=()=>ctx.drawImage(im,0,0,r.width,r.height);im.src=old}}function p(e){const r=canvas.getBoundingClientRect(),t=e.touches?.[0]||e;return{x:t.clientX-r.left,y:t.clientY-r.top}}function start(e){e.preventDefault();drawing=true;has=true;const q=p(e);ctx.beginPath();ctx.moveTo(q.x,q.y)}function move(e){if(!drawing)return;e.preventDefault();const q=p(e);ctx.lineTo(q.x,q.y);ctx.stroke()}function end(){if(!drawing)return;drawing=false;status.textContent='署名済み';onChange(canvas.toDataURL('image/png'))}['pointerdown'].forEach(x=>canvas.addEventListener(x,start));canvas.addEventListener('pointermove',move);window.addEventListener('pointerup',end);clearBtn.onclick=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);has=false;status.textContent='未署名';onChange('')};resize();return{load(data){ctx.clearRect(0,0,canvas.width,canvas.height);const valid=isSignatureDataUrl(data);has=valid;status.textContent=valid?'署名済み':'未署名';if(valid){const im=new Image();im.onload=()=>ctx.drawImage(im,0,0,canvas.clientWidth,canvas.clientHeight);im.onerror=()=>{has=false;status.textContent='未署名'};im.src=data}},resize}}
let creatorPad,principalPad;
function resetForm(){editingId=null;$('#btnDelete').hidden=true;$$('input:not([type=file]):not([type=checkbox]),textarea').forEach(x=>x.value='');$$('select').forEach(x=>x.value='');$$('input[type=checkbox]').forEach(x=>x.checked=false);$('#workDate').value=today();creatorSign='';creatorPad?.load('');workerSigns=Array(8).fill('');workerPads.forEach(p=>p?.load(''));activeWorkCount=1;currentWork=0;hydrateMasters();showWork(0);$('#foremanCount').textContent='0'}
function collect(){const work=[];for(let i=1;i<=4;i++)work.push({content:$('#work'+i).value.trim(),planned:$('#planned'+i).value,actual:$('#actual'+i).value,danger:$('#danger'+i).value.trim(),poss:$('#poss'+i).value,sev:$('#sev'+i).value,score:$('#score'+i).value,measure:$('#measure'+i).value.trim(),leader:$('#leader'+i).value.trim()});const workers=[];for(let i=1;i<=8;i++)workers.push({signImage:workerSigns[i-1]||'',health:$('#health'+i).value,qualification:$('#qual'+i).value});return{id:editingId||uid(),site:$('#site').value,date:$('#workDate').value,company:$('#company').value,companyAlias:master.companyAliases[$('#company').value]||$('#company').value,creatorSign,activeWorkCount,work,foremanComment:$('#foremanComment').value,checks:{scaffold:$('#checkScaffold').checked,tools:$('#checkTools').checked,clothes:$('#checkClothes').checked,ppe:$('#checkPpe').checked},workers,approval:null,deleted:false,updatedAt:new Date().toISOString(),history:[]}}
function validate(d){if(!d.date||!d.site||!d.company||!d.creatorSign){toast('作業日・現場名・会社名・作成者サインは必須です');return false}return true}
function saveCurrent(){const d=collect();if(!validate(d))return;const all=records(),idx=all.findIndex(x=>x.id===d.id);if(idx>=0){const old=all[idx];d.history=[...(old.history||[]),{at:d.updatedAt,type:'編集'}];if(old.approval)d.approval={...old.approval,status:'modified'};all[idx]=d}else{d.history=[{at:d.updatedAt,type:'新規保存'}];all.push(d)}saveRecords(all);toast('保存しました');editingId=null;go('basic');$('#site').value=d.site;$('#workDate').value=d.date;$('#company').value=''}
function fill(d){editingId=d.id;$('#btnDelete').hidden=false;$('#site').value=d.site;$('#workDate').value=d.date;$('#company').value=d.company;creatorSign=d.creatorSign||'';creatorPad.load(creatorSign);activeWorkCount=d.activeWorkCount||Math.max(1,d.work.findLastIndex?.(x=>x.content)+1||1);d.work.forEach((w,j)=>{const i=j+1;$('#work'+i).value=w.content||'';$('#planned'+i).value=w.planned||'';$('#actual'+i).value=w.actual||'';$('#danger'+i).value=w.danger||'';$('#poss'+i).value=w.poss||'';$('#sev'+i).value=w.sev||'';$('#score'+i).value=w.score||'';$('#measure'+i).value=w.measure||'';$('#leader'+i).value=w.leader||'';$('#riskHelp'+i).textContent=`可能性：${w.poss||'未選択'}　重大性：${w.sev||'未選択'}`});$('#foremanComment').value=d.foremanComment||'';$('#foremanCount').textContent=$('#foremanComment').value.length;$('#checkScaffold').checked=d.checks.scaffold;$('#checkTools').checked=d.checks.tools;$('#checkClothes').checked=d.checks.clothes;$('#checkPpe').checked=d.checks.ppe;workerSigns=Array(8).fill('');(d.workers||[]).forEach((w,j)=>{const i=j+1;workerSigns[j]=w.signImage||'';workerPads[j]?.load(workerSigns[j]);$('#health'+i).value=w.health||'';$('#qual'+i).value=w.qualification||''});currentWork=0;go('basic')}
function deleteCurrent(){if(!editingId||!confirm('このデータを削除済みにしますか？'))return;const all=records(),d=all.find(x=>x.id===editingId);if(d){d.deleted=true;d.updatedAt=new Date().toISOString();d.history.push({at:d.updatedAt,type:'削除'});saveRecords(all)}editingId=null;toast('削除しました');go('saved')}
function statusText(d){if(!d.approval)return['waiting','確認待ち'];if(d.approval.status==='modified')return['modified','⚠ 確認後変更'];return['approved','確認済み']}
function filteredSavedRecords(){const s=$('#searchSite').value,c=$('#searchCompany').value;return records().filter(x=>!x.deleted&&(!s||x.site===s)&&(!c||x.company===c))}
function renderSaved(){const list=filteredSavedRecords();$('#bulkExportInfo').textContent=list.length?`表示中 ${list.length}件`:'対象なし';$('#btnBulkExport').disabled=!list.length;$('#savedList').innerHTML=list.length?list.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(d=>{const st=statusText(d);return`<div class="record-card"><strong>${esc(d.company)}</strong><div>${esc(d.date)}／${esc(d.site)}</div><div class="meta">${esc(d.work.filter(x=>x.content).map(x=>x.content).join('、')||'作業内容未入力')}</div><span class="status ${st[0]}">${st[1]}</span><div class="row"><button onclick="editRecord('${d.id}')">編集</button><button onclick="exportRecord('${d.id}')">個別Excel出力</button></div></div>`}).join(''):'<div class="card">該当する保存データはありません。</div>'}
function renderApproval(){const site=$('#approvalSite').value,inc=$('#includeApproved').checked,list=records().filter(x=>!x.deleted&&(!site||x.site===site)&&(inc||!x.approval||x.approval.status==='modified'));$('#approvalList').innerHTML=list.length?list.map(d=>{const st=statusText(d);return`<div class="record-card"><strong>${esc(d.company)}</strong><div>${esc(d.date)}／${esc(d.site)}</div><span class="status ${st[0]}">${st[1]}</span><div class="row"><button onclick="openApproval('${d.id}')">確認する</button></div></div>`}).join(''):'<div class="card">対象データはありません。</div>'}
function openApproval(id){approvingId=id;const d=records().find(x=>x.id===id);if(!d)return;$('#approvalSummary').innerHTML=`<strong>${esc(d.company)}</strong><p>${esc(d.date)}／${esc(d.site)}</p><p>${esc(d.work.filter(x=>x.content).map(x=>x.content).join('、'))}</p><p>職長から：${esc(d.foremanComment||'')}</p>`;$('#principalComment').value=d.approval?.comment||'';principalSign=d.approval?.signImage||'';principalPad.load(principalSign);$('#principalCount').textContent=$('#principalComment').value.length;go('approve-detail')}
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
    const outH=600,outW=Math.max(1,Math.round(outH*targetAspect)),out=document.createElement('canvas'),octx=out.getContext('2d');
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
  {data:d.creatorSign,cell:master.mapping['作成者']?.cell,label:'creator',widthCm:.78,heightCm:1.5},
  {data:d.approval?.signImage,cell:master.mapping['元請確認']?.cell,label:'principal',widthCm:.78,heightCm:1.5},
  ...(d.workers||[]).map((w,j)=>({data:w.signImage,cell:master.mapping['作業員'+(j+1)]?.cell,label:'worker'+(j+1),widthCm:3.9,heightCm:.82}))
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
 const printNames=[...used].map((nm,i)=>`<definedName name="_xlnm.Print_Area" localSheetId="${i}">'${xmlEsc(nm.replace(/'/g,"''"))}'!$A$1:$AC$46</definedName>`).join('');
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

 const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'}),a=document.createElement('a');
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
async function exportRecord(id){try{const d=records().find(x=>x.id===id);if(d)await exportRecords([d],`${d.site}_${d.companyAlias||d.company}_${d.date}`)}catch(e){console.error(e);toast('Excel出力に失敗しました：'+e.message)}}
async function exportBulk(){try{const list=filteredSavedRecords();if(!list.length){toast('出力対象がありません');return}const sites=[...new Set(list.map(x=>x.site))];if(sites.length!==1){toast('現場名を1つ選択してから一括出力してください');return}await exportRecords(list,sites[0])}catch(e){console.error(e);toast('一括Excel出力に失敗しました：'+e.message)}}
window.editRecord=id=>{const d=records().find(x=>x.id===id);if(d)fill(d)};window.openApproval=openApproval;window.exportRecord=exportRecord;
document.addEventListener('DOMContentLoaded',async()=>{buildRows();creatorPad=setupPad($('#creatorPad'),$('#creatorSignStatus'),$('#clearCreator'),v=>creatorSign=v);workerPads=[1,2,3,4,5,6,7,8].map(i=>setupPad($('#workerPad'+i),$('#workerSignStatus'+i),$('#clearWorker'+i),v=>workerSigns[i-1]=v));principalPad=setupPad($('#principalPad'),$('#principalSignStatus'),$('#clearPrincipal'),v=>principalSign=v);hydrateMasters();resetForm();$$('[data-go]').forEach(b=>b.onclick=()=>{const t=b.dataset.go;if(!master.templateBuffer&&!['top','saved','approval'].includes(t)){toast('先にKYKDBを読み込んでください');return}go(t)});$('#btnDb').onclick=()=>$('#dbFile').click();$('#dbFile').onchange=async e=>{try{await loadFile(e.target.files[0]);e.target.value=''}catch(err){console.error(err);toast(err.message)}};$('#btnSave').onclick=saveCurrent;$('#btnDelete').onclick=deleteCurrent;$('#btnApprove').onclick=approve;$('#searchSite').onchange=renderSaved;$('#searchCompany').onchange=renderSaved;$('#btnBulkExport').onclick=exportBulk;$('#approvalSite').onchange=renderApproval;$('#includeApproved').onchange=renderApproval;$('#foremanComment').oninput=e=>$('#foremanCount').textContent=e.target.value.length;$('#principalComment').oninput=e=>$('#principalCount').textContent=e.target.value.length;$('#prevWork').onclick=()=>showWork(currentWork-1);$('#nextWork').onclick=()=>showWork(currentWork+1);$('#addWork').onclick=()=>{if(activeWorkCount<4){activeWorkCount++;showWork(activeWorkCount-1)}};$('#removeWork').onclick=()=>{if(activeWorkCount<=1)return;if(confirm(`作業${currentWork+1}を削除しますか？`)){for(let j=currentWork+1;j<activeWorkCount;j++){['work','planned','actual','danger','poss','sev','score','measure','leader'].forEach(k=>$('#'+k+j).value=$('#'+k+(j+1)).value)}activeWorkCount--;showWork(Math.min(currentWork,activeWorkCount-1))}};try{const saved=await idbGet();if(saved?.buffer)await loadBuffer(saved.buffer,saved.name,false)}catch(e){console.warn(e)}if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('service-worker.js').catch(console.warn)});
