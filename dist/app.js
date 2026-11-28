/* 旅行行程網站 — 行程資料存在 Supabase，可直接在網站上新增／編輯／刪除 */
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain=s=>{const d=document.createElement('div');d.innerHTML=String(s??'');return d.textContent.replace(/\s+/g,' ').trim()};
const pad=n=>String(n).padStart(2,'0');
const byPos=(a,b)=>(a.position-b.position)||String(a.id).localeCompare(String(b.id));
const ICON={l:'<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"></path></svg>',r:'<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"></path></svg>',pin:'<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"></path><circle cx="12" cy="9.5" r="2.5"></circle></svg>'};

/* ---------- 資料：Supabase ＋ 本機快取 ---------- */
const CFG=window.BALI_CONFIG||{};
// 直接打開本機檔案（file://）時，伺服器功能改用正式網站
const ORIGIN=location.protocol==='file:'?(CFG.site||''):location.origin;
const API=location.protocol==='file:'?ORIGIN:'';
const sb=window.supabase&&CFG.url?window.supabase.createClient(CFG.url,CFG.key,{auth:{persistSession:false,autoRefreshToken:false}}):null;
const CACHE_KEY='bali-trip-v2';
const TABLES=['days','items','checks','notes','trip'];
let raw=null,data={days:[],extras:[],checks:[],trip:null},synced=null,online=navigator.onLine;
// 沒有資料庫設定時的封面預設值（資料庫 trip 表為準）
const DEFAULT_TRIP={id:'main',title:'峇里島跨年',subtitle:'8 天 7 夜 · 烏布森林、火山日出、佩尼達島與海邊跨年',travelers:'Ben & Irene',destination:'Bali, Indonesia',start_date:'2026-12-26',end_date:'2027-01-02',intro:'',cover_image:'img/87c7e2e1df829e99.webp',cover_caption:'Mount Batur 火山日出',cover_focus:'center 45%',prep_title:'行前資料與預訂清單',notes_enabled:true,notes_title:'入境與須知',prep_intro:'勾選和內容都會同步給所有看這個網站的人；店家是否接受預約，以實際確認信為準。',theme:{preset:'bali'}};
const lsGet=k=>{try{return localStorage.getItem(k)}catch(e){return null}},lsSet=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};

function splitTime(rawT){const t=plain(rawT).replace(/左 右/g,'左右').replace(/（\s+/g,'（').replace(/\s+（/g,'（');const m=t.match(/\d{1,2}:\d{2}/);if(!m)return{start:'',end:'',approx:false,ttext:t,range:t};let before=t.slice(0,m.index).trim(),after=t.slice(m.index+m[0].length).trim();const approx=/^約/.test(before);before=before.replace(/^約/,'').trim();after=after.replace(/^[-–→~]\s*/,'').trim();return{start:m[0],end:[before,after].filter(Boolean).join(' '),approx,ttext:'',range:t}}
// 與伺服器 api/_lib/route.js 一致；開車不加標記
const sigOf=pts=>pts.map(p=>p[0].toFixed(5)+','+p[1].toFixed(5)+(p[2]&&p[2]!=='car'?'@'+p[2]:'')).join(';');
const pinSig=d=>sigOf(d.pins.map(x=>[...x.pt.latlng,x.pt.mode]));
const mapsQ=ll=>'https://www.google.com/maps/search/?api=1&query='+ll.join(',');

function build(r){
 const days=[...r.days].sort(byPos).map((d,i)=>({id:d.id,idx:i+1,row:d,date:d.date,title:d.title,area:d.area,note:d.note,breakfast:d.breakfast,mapNote:d.map_note,items:[]}));
 const byId=new Map(days.map(d=>[d.id,d]));
 [...r.items].sort(byPos).forEach(row=>{const d=byId.get(row.day_id);if(!d)return;
  const ll=row.lat!=null&&row.lng!=null?[+row.lat,+row.lng]:null;
  const x={id:row.id,row,day:d,time:row.time,title:row.title,type:row.type,note:row.note,reserve:row.reserve,bookUrl:row.book_url,food:row.food||[],booking:row.booking||[],extra:row.extra||[],rain:row.rain||[],photos:row.photos||[],latlng:ll,map:row.map_url||(ll?mapsQ(ll):'')};
  Object.assign(x,splitTime(x.time));x.ttl=plain(x.title);x.nt=plain(x.note);x.hasRain=x.rain.length>0;
  x.pt=ll?{name:row.point_name||x.ttl,time:plain(row.time),latlng:ll,key:row.coord_key,mode:row.travel_mode||'car'}:null;
  x.dir=ll?'https://www.google.com/maps/dir/?api=1&destination='+ll.join(',')+'&travelmode=driving':'';
  x.expandable=true;d.items.push(x)});
 days.forEach(d=>{let n=0;d.items.forEach(x=>{x.n=x.pt?++n:0});d.pins=d.items.filter(x=>x.n);
  const g=d.row.route_geometry;d.routeGeometry=g&&d.row.route_sig&&d.row.route_sig===pinSig(d)?g:null});
 const trip={...DEFAULT_TRIP,...((r.trip&&r.trip[0])||{})};
 const stamps=[...r.days,...r.items,...r.checks,...r.notes,...(r.trip||[])].map(x=>x.updated_at).filter(Boolean).sort();
 data={days,extras:[...r.notes].sort(byPos),checks:[...r.checks].sort(byPos),trip,updated:stamps[stamps.length-1]||null};applyTheme(trip.theme)}

/* ---------- 主題：配色、字體、地圖風格（themes.js；存在 trip.theme） ---------- */
const cv=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
let themeKey='',curTheme=null;
function applyTheme(th,redraw){const T=window.TRIP_THEMES;if(!T)return;const t=T.resolve(th),k=JSON.stringify(t);if(k===themeKey)return;themeKey=k;curTheme=t;
 const css='html:root{'+Object.entries(T.CSS_VAR).map(([c,v])=>v+':'+t.colors[c]).join(';')+';--serif:'+T.stack(t.fonts.display,t.fonts.display_kind)+';--sans:'+T.stack(t.fonts.body,t.fonts.body_kind)+';--map-filter:'+T.mapFilter(t.map)+'}';
 let st=document.getElementById('themeVars');if(!st){st=document.createElement('style');st.id='themeVars';document.head.appendChild(st)}st.textContent=css;
 const u=T.fontsUrl(t);let ln=document.getElementById('themeFonts');
 if(u){if(!ln){ln=document.createElement('link');ln.id='themeFonts';ln.rel='stylesheet';document.head.appendChild(ln)}if(ln.getAttribute('href')!==u)ln.setAttribute('href',u)}else if(ln)ln.remove();
 document.documentElement.dataset.map=t.map_style;const m=document.querySelector('meta[name=theme-color]');if(m)m.content=t.colors.map;
 if(!redraw)lsSet('trip-theme',JSON.stringify({css,u,map:t.map_style,tc:t.colors.map}));
 setMapLayers();
 if(redraw&&map&&S._init)drawMap()}

async function fetchRemote(){
 if(!sb)throw new Error('no-client');
 const res=await Promise.all(TABLES.map(t=>sb.from(t).select('*')));
 const bad=res.find(r=>r.error);if(bad)throw bad.error;
 const r={};TABLES.forEach((t,i)=>r[t]=res[i].data);return r}
function cacheRaw(){lsSet(CACHE_KEY,JSON.stringify(raw))}
let refT=null,refBusy=false;
function refresh(delay=250){clearTimeout(refT);refT=setTimeout(async()=>{if(refBusy){refresh(400);return}refBusy=true;try{raw=await fetchRemote();cacheRaw();synced=new Date();online=true;rebuild()}catch(e){if(!navigator.onLine)online=false;updateStatus()}finally{refBusy=false}},delay)}
// 有天的地點變了、路線還沒重算 → 請伺服器重算（結果會透過即時同步回來）
let routeT=null,routeAt=0;
function needRoutes(){if(!sb||!online||!raw)return;const oldFmt=g=>!!g&&!(g.type==='FeatureCollection'&&g.features.length&&g.features.every(f=>f.properties&&Number.isInteger(f.properties.leg)));const bad=data.days.some(d=>(d.row.route_sig||'')!==pinSig(d)||oldFmt(d.row.route_geometry));if(!bad)return;clearTimeout(routeT);routeT=setTimeout(()=>{if(Date.now()-routeAt<15000)return;routeAt=Date.now();fetch(API+'/api/route',{method:'POST'}).catch(()=>{})},1200)}
function rebuild(){build(raw);if(S.day>data.days.length)S.day=data.days.length||0;const d=day();if(d&&S.sel&&!d.items.some(x=>x.id===S.sel))S.sel=null;renderChrome();renderPanel();drawMap();updateStatus();needRoutes()}

/* ---------- 狀態 ---------- */
const S={ptab:lsGet('bali-ptab')==='notes'?'notes':'prep',aiTab:'claude',day:1,sel:null,open:new Set(),all:false,rain:false,panel:true,snap:null,search:false,edit:lsGet('bali-edit')==='1',picking:null};
let map,overlay,markers={},drag=null;
const mqDesk=matchMedia('(min-width:1100px)'),mqPhone=matchMedia('(max-width:699px)');
const L_=()=>mqDesk.matches?'desk':mqPhone.matches?'phone':'tab';
let layout=L_();
const day=()=>S.day?data.days[S.day-1]:null;
const pd=v=>{if(!v)return null;const[y,m,d]=String(v).split('-').map(Number);return y?new Date(y,m-1,d):null};
const fmtD=d=>`${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())}`;
// 出發前／旅程中／結束後；旅程中預設打開當天
function tripPhase(){const t=data.trip||{},s=pd(t.start_date),e=pd(t.end_date)||s;if(!s)return null;const now=new Date();now.setHours(0,0,0,0);const diff=Math.round((s-now)/864e5);if(diff>0)return{k:'before',n:diff};if(now<=e)return{k:'during',n:1-diff};return{k:'after'}}
function landingDay(){const p=tripPhase();return p&&p.k==='during'&&p.n>=1&&p.n<=N()?p.n:0}
const allItems=()=>data.days.flatMap(d=>d.items);
const findItem=id=>allItems().find(x=>x.id===id);
function safeBottom(){const el=document.getElementById('sab')||document.body.appendChild(Object.assign(document.createElement('div'),{id:'sab'}));el.style.cssText='position:fixed;visibility:hidden;pointer-events:none;padding-bottom:calc(var(--sab) + var(--tb,0px))';return parseFloat(getComputedStyle(el).paddingBottom)||0}
function sheetLimit(){const stage=document.querySelector('.stage')||document.documentElement,stageBottom=stage.getBoundingClientRect().bottom,bar=document.querySelector('.mtop'),br=bar&&bar.getBoundingClientRect(),fallback=layout==='tab'?96:78,topEdge=(br&&br.height>0)?Math.max(fallback,br.bottom+12):fallback;return Math.max(200,Math.round(stageBottom-topEdge))}
const snapH=k=>{const h=window.visualViewport?window.visualViewport.height:innerHeight,full=sheetLimit(),half=Math.min(Math.round(h*(layout==='phone'?.57:.525)),full),peek=Math.min((layout==='phone'?236:212)+safeBottom(),half,full);return{peek,half,full}[k]};
const clampSheet=h=>Math.max(snapH('peek')-48,Math.min(snapH('full'),h));
function settleSheet(h,from,dy){const order=['peek','half','full'];let to=order.reduce((a,k)=>Math.abs(snapH(k)-h)<Math.abs(snapH(a)-h)?k:a,'peek');const i=Math.max(0,order.indexOf(from));if(to===from&&dy>40)to=order[Math.min(2,i+1)];if(to===from&&dy<-40)to=order[Math.max(0,i-1)];goSnap(to)}
const defSnap=()=>S.day===0?'full':layout==='phone'?'peek':'half';
const canEdit=()=>!!sb&&online;

/* ---------- markup ---------- */
function tagsHtml(x){const t=[];if(x.reserve)t.push(`<span class="tag ${/^需|^建議|^提前|^先/.test(x.reserve)?'warn':''}">${esc(x.reserve)}</span>`);if(x.food.length)t.push('<span class="tag">餐點</span>');if(x.hasRain)t.push('<span class="tag">雨備</span>');return t.length?`<span class="tags">${t.join('')}</span>`:''}
const block=(title,ps,k='')=>ps.length?`<section class="info ${k}"><h3>${title}</h3>${ps.map(p=>`<p>${p}</p>`).join('')}</section>`:'';
const ext=(u,t)=>`<a class="chip" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${t} ↗</a>`;
function bodyHtml(x){const ph=x.photos;return `<div class="body">${ph.length?`<div class="ph ${ph.length>1?'multi':''}">${ph.map((p,i)=>`<button class="phb" data-photo="${x.id}|${i}" aria-label="放大照片：${esc(p.title)}"><img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy" decoding="async"></button>`).join('')}</div>`:''}<div class="chips">${x.pt?`<button class="chip pri only-touch" data-showmap="${x.id}">在地圖上看</button>`:''}${x.map?ext(x.map,'Google 地圖'):''}${x.dir?ext(x.dir,'導航'):''}${x.bookUrl?ext(x.bookUrl,'預訂方式'):''}</div>${block('吃什麼／必點',x.food)}${block('預訂方式'+(x.reserve?' · '+esc(x.reserve):''),x.booking)}${block('當天注意事項',x.extra)}${block('雨天／延誤怎麼換',x.rain,'rain')}${!x.food.length&&!x.booking.length&&!x.extra.length&&!x.rain.length&&x.note?`<p class="simple">${x.note}</p>`:''}</div>`}
function editBar(x,d){const i=d.items.indexOf(x);return `<div class="ebar"><button type="button" class="ebtn" data-edit="${x.id}">✎ 編輯</button><button type="button" class="ebtn ic" data-move="${x.id}|-1" aria-label="上移「${esc(x.ttl)}」" ${i===0?'disabled':''}>↑</button><button type="button" class="ebtn ic" data-move="${x.id}|1" aria-label="下移「${esc(x.ttl)}」" ${i===d.items.length-1?'disabled':''}>↓</button><button type="button" class="ebtn del" data-del="${x.id}">刪除</button></div>`}
function rowHtml(x,_,arr,extra=''){const d=x.day,sel=S.sel===x.id,exp=x.expandable&&(S.all||S.open.has(x.id)),dim=S.rain&&!x.hasRain,stop=!!x.n;
 // 平板兩欄：連續的景點兩兩並排；一列裡只剩一張（單獨一站，或奇數串的最後一張）就佔滿整列
 let solo=false;if(stop&&arr){const i=_;let a=i,b=i;while(a>0&&arr[a-1].n)a--;while(b<arr.length-1&&arr[b+1].n)b++;solo=(i-a)%2===0&&i===b}
 const tcol=`<div class="tcol">${x.approx?'<i>約</i>':''}${x.start?`<b>${x.start}</b>${x.end&&stop?`<small>${esc(x.end)}</small>`:''}`:`<small class="tt">${esc(x.ttext)}</small>`}</div>`;
 const kl=stop?`<span class="kl"><b class="idot">${x.n}</b><span class="kr">${esc(x.range)} · </span>${esc(x.type)}</span>`:`<span class="kl"><span>${esc(x.range)}</span><span class="kk"> · ${esc(x.type)}</span></span><span class="tdash"></span>`;
 const ttl=stop?`<span class="ttl">${esc(x.ttl)}</span>`:`<span class="ttl"><span class="tk">${esc(x.type)} · </span>${esc(x.ttl)}</span>`;
 return `<div class="row ${stop?'stop':'tr'}${solo?' solo':''}${dim?' dim':''}${sel?' sel':''}" id="r-${esc(x.id)}">${tcol}<div class="rail"><i></i>${stop?`<b class="dot">${x.n}</b>`:''}</div><article class="card"><button class="head" data-pick="${esc(x.id)}" aria-expanded="${exp}"><span class="hmain">${kl}${ttl}<span class="nt">${esc(x.nt)}</span>${stop?tagsHtml(x):''}</span><span class="sign" aria-hidden="true">${exp?'−':'+'}</span></button>${exp?bodyHtml(x):''}${extra}${S.edit?editBar(x,d):''}</article></div>`}
// 平板（非編輯模式）：交通等沒有地點的項目收進前一站卡片底部，景點卡片才能兩兩並排、清單不會拉很長
function legHtml(t){const sel=S.sel===t.id,exp=t.expandable&&(S.all||S.open.has(t.id)),dim=S.rain&&!t.hasRain;
 return `<div class="tleg${sel?' sel':''}${dim?' dim':''}" id="r-${esc(t.id)}"><button class="tlh" data-pick="${esc(t.id)}" aria-expanded="${exp}"><span class="tlk">${esc(t.start?t.range:t.ttext)}</span><span class="tlt"><b>${esc(t.type)}</b> · ${esc(t.ttl)}</span>${t.nt?`<span class="tln">${esc(t.nt)}</span>`:''}${t.expandable?`<span class="sign" aria-hidden="true">${exp?'−':'+'}</span>`:''}</button>${exp?bodyHtml(t):''}</div>`}
function tabRows(items){const lead=[],groups=[];items.forEach(x=>{if(x.n)groups.push({x,after:[]});else if(groups.length)groups[groups.length-1].after.push(x);else lead.push(x)});
 const stops=groups.map(g=>g.x);return lead.map((x,i,a)=>rowHtml(x,i,a)).join('')+groups.map((g,i)=>rowHtml(g.x,i,stops,g.after.map(legHtml).join(''))).join('')}
function curIdx(d){const i=d.pins.findIndex(x=>x.id===S.sel);return i<0?0:i}
function curNone(d){return `<span class="cnt">全天 ${d.pins.length} 站 · 點一站看路段</span>`}
function curFloat(d){if(!d||!d.pins.length)return'';if(!S.sel)return `<div class="cur-top"><span class="thumb" aria-hidden="true">${ICON.pin}</span><span class="cur-txt"><span class="eb">DAY ${pad(d.idx)} · 全天路線</span><span class="ct">${esc(d.title)}</span><span class="cn">${esc(d.area)}</span></span></div><div class="cur-nav"><button class="mbtn" data-step="-1" aria-label="最後一站">${ICON.l}</button>${curNone(d)}<button class="mbtn" data-step="1" aria-label="第一站">${ICON.r}</button></div>`;const i=curIdx(d),x=d.pins[i],p=x.photos[0];return `<div class="cur-top">${p?`<button class="thumb" data-photo="${x.id}|0" aria-label="放大照片：${esc(p.title)}"><img src="${esc(p.image)}" alt=""></button>`:`<span class="thumb" aria-hidden="true">${ICON.pin}</span>`}<span class="cur-txt"><span class="eb">${x.n} · ${esc(x.range)} · ${esc(x.type)}</span><span class="ct">${esc(x.ttl)}</span><span class="cn">${esc(x.nt)}</span></span></div><div class="cur-nav"><button class="mbtn" data-step="-1" aria-label="上一站">${ICON.l}</button><span class="cnt">第 ${i+1} / ${d.pins.length} 站</span><button class="mbtn" data-step="1" aria-label="下一站">${ICON.r}</button><a class="go" href="${x.dir}" target="_blank" rel="noopener noreferrer">導航 ↗</a></div>`}
function curSheet(d){if(!d||!d.pins.length)return'';if(!S.sel)return `<div class="sc"><span class="badge" aria-hidden="true">${ICON.pin}</span><span class="sct"><span class="eb">全天路線</span><span class="ct">${esc(d.title)}</span></span><div class="scnav"><button class="mbtn" data-step="-1" aria-label="最後一站">${ICON.l}</button>${curNone(d)}<button class="mbtn" data-step="1" aria-label="第一站">${ICON.r}</button></div></div>`;const i=curIdx(d),x=d.pins[i];return `<div class="sc"><span class="badge">${x.n}</span><span class="sct"><span class="eb">${esc(x.range)} · ${esc(x.type)}</span><span class="ct">${esc(x.ttl)}</span></span><div class="scnav"><button class="mbtn" data-step="-1" aria-label="上一站">${ICON.l}</button><span class="cnt">第 ${i+1} / ${d.pins.length} 站</span><button class="mbtn" data-step="1" aria-label="下一站">${ICON.r}</button><a class="go" href="${x.dir}" target="_blank" rel="noopener noreferrer">導航 ↗</a></div></div>`}
const grab=(title,meta)=>`<div class="grab" id="grab"><button class="handle" id="handle" aria-label="${S.snap==='full'?'收合行程清單':'展開行程清單'}"><span></span></button><div class="sheethead"><h1>${esc(title)}</h1>${meta?`<span class="meta">${esc(meta)}</span>`:''}</div></div>`;
const fmtTime=s=>{if(!s)return'';const d=new Date(s);return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`};
const foot=d=>`<p class="foot">時段為預排，尚未代訂 · ${d?'<a href="#prep">行前預訂清單 ↗</a>':'<a href="#d1">回到 DAY 01 ↗</a>'}<br>${d&&d.mapNote?esc(d.mapNote)+' · ':''}最後更新：${fmtTime(data.updated)||'—'} · 照片依各圖來源標註<br><span class="sync" id="sync"></span> · <button type="button" class="linkbtn" data-copyai>複製「用 AI 編輯」指令</button> · <button type="button" class="linkbtn" data-dup>做一份自己的網站</button></p>`;
const N=()=>data.days.length;
const SHORT=()=>plain((data.trip||{}).title)||'旅行行程';
const LABEL=()=>[plain((data.trip||{}).travelers),SHORT()].filter(Boolean).join(' 的');
// 一句話：AI 讀完 /ai 會把行程的 MCP 接到自己身上，再打開網站。分享給旅伴也是這一句
const AI_PROMPT=()=>`閱讀 ${ORIGIN}/ai ，幫我連上「${LABEL()}」並打開網站`;
const DUP_PROMPT=()=>`閱讀 ${ORIGIN}/duplicate ，幫我複製一份自己的行程網站`;
const MCP_URL=ORIGIN+'/mcp';
// AI 圖示：Lobe Icons（MIT），內嵌 SVG；Grok Bot 依官方圖示重畫
const AI_IC={"claude": "<svg class=\"aiic\" aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z\" fill=\"#D97757\" fill-rule=\"nonzero\"></path></svg>", "openai": "<svg class=\"aiic\" aria-hidden=\"true\" focusable=\"false\" fill=\"currentColor\" fill-rule=\"evenodd\" viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z\"></path></svg>", "grok": "<svg class=\"aiic\" aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><defs><mask id=\"gbEyes\"><rect width=\"24\" height=\"24\" fill=\"#fff\"/><rect x=\"13.61\" y=\"5.32\" width=\"1.86\" height=\"4.23\" rx=\".93\" transform=\"rotate(-25 14.54 7.43)\" fill=\"#000\"/><rect x=\"18\" y=\"4.47\" width=\"1.7\" height=\"4.06\" rx=\".85\" transform=\"rotate(-25 18.85 6.5)\" fill=\"#000\"/></mask></defs><circle cx=\"12\" cy=\"12\" r=\"11\" fill=\"currentColor\" mask=\"url(#gbEyes)\"/></svg>", "codex": "<svg class=\"aiic\" aria-hidden=\"true\" focusable=\"false\" fill=\"currentColor\" fill-rule=\"evenodd\" viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><path clip-rule=\"evenodd\" d=\"M8.086.457a6.105 6.105 0 013.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 00.107.029c1.408-.346 2.762-.224 4.061.366l.063.03.154.076c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 01-.18 1.631.167.167 0 00.04.155 5.982 5.982 0 011.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 01-2.934 1.851.162.162 0 00-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 00-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 01-2.595-.622 6.058 6.058 0 01-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 01-.495-1.283 6.11 6.11 0 01-.017-3.064.166.166 0 00.008-.074.115.115 0 00-.037-.064 5.958 5.958 0 01-1.38-2.202 5.196 5.196 0 01-.333-1.589 6.915 6.915 0 01.188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 00.087-.087A6.016 6.016 0 015.635 2.31C6.315 1.464 7.132.846 8.086.457zm-.804 7.85a.848.848 0 00-1.473.842l1.694 2.965-1.688 2.848a.849.849 0 001.46.864l1.94-3.272a.849.849 0 00.007-.854l-1.94-3.393zm5.446 6.24a.849.849 0 000 1.695h4.848a.849.849 0 000-1.696h-4.848z\"></path></svg>"};
const aiIc=(...k)=>`<span class="aiics">${k.map(x=>AI_IC[x]).join('')}</span>`;
const aiBox=()=>`<section class="aibox"><h2>用 AI 編輯行程</h2><p>接上之後，直接用聊天告訴 AI 想改什麼，或問它「我能改什麼」。改完網站立刻更新，所有修改都能在修改紀錄還原。</p>
<div class="aitabs" role="tablist"><button type="button" role="tab" class="aitab" aria-selected="${S.aiTab==='claude'}" data-aitab="claude">${aiIc('claude')}Claude 聊天</button><button type="button" role="tab" class="aitab" aria-selected="${S.aiTab==='chatgpt'}" data-aitab="chatgpt">${aiIc('openai')}ChatGPT</button><button type="button" role="tab" class="aitab" aria-selected="${S.aiTab==='code'}" data-aitab="code">${aiIc('grok','claude','codex')}Grok Bot・Claude Code・Codex 等</button></div>
${S.aiTab==='claude'?`<ol class="aisteps"><li>在 <a href="https://claude.ai/settings/connectors" target="_blank" rel="noopener">claude.ai → 設定 → 連接器</a> 按「新增自訂連接器」</li><li>名稱填「${esc(SHORT())}」，網址貼上下面這行，不用填 OAuth</li><li>回到對話，在輸入框的「＋」→ 連接器打開「${esc(SHORT())}」，就可以開始聊（手機 App 也能用）</li></ol><pre>${MCP_URL}</pre><button type="button" class="chip pri" data-copy="${MCP_URL}">複製網址</button><p class="aisub">免費方案可加 1 個自訂連接器；Team／Enterprise 需由管理員先加入。</p>`
:S.aiTab==='chatgpt'?`<ol class="aisteps"><li>ChatGPT 網頁版 → 設定 → 應用程式（Apps）→ 進階設定，開啟「開發者模式」</li><li>按「建立應用程式」：名稱「${esc(SHORT())}」，MCP 伺服器網址貼上下面這行，驗證選「無」，勾選信任後建立</li><li>新對話的「＋」→ 更多 → 選「${esc(SHORT())}」，就可以開始聊</li></ol><pre>${MCP_URL}</pre><button type="button" class="chip pri" data-copy="${MCP_URL}">複製網址</button><p class="aisub">開發者模式需要付費方案。免費帳號：建立一個自訂 GPT，在「動作」用「從網址匯入」貼上 ${ORIGIN}/openapi.json ，驗證選「無」，隱私權政策填 ${ORIGIN}/privacy.html 。</p>`
:`<p>把這句貼給 Grok Bot、Claude Code、Codex、Cursor、Gemini CLI 等能執行指令的 AI，它會自己完成連線：</p><pre id="aiPrompt">${esc(AI_PROMPT())}</pre><button type="button" class="chip pri" data-copyai>複製這句</button>`}</section>`;
// 做一份自己的網站：獨立區塊，不管選哪個 AI 分頁都看得到
const dupBox=()=>`<section class="aibox dupbox" id="dupBox"><h2>做一份自己的行程網站</h2><p>自己的網址與資料庫，部署到你的 Vercel 帳號，不會改到這個網站。複製下面這句，依你用的 AI 結果不同：</p><pre>${esc(DUP_PROMPT())}</pre><button type="button" class="chip pri" data-copy="${esc(DUP_PROMPT())}" data-copymsg="已複製，貼給你的 AI 即可">複製這句</button>
<ul class="duprows"><li>${aiIc('grok','claude','codex')}<span><b>Grok Bot、Claude Code、Codex 等能執行指令的 AI</b>全自動完成：會先問你幾個問題，你只需要登入 Vercel（第一次用要在瀏覽器按一次同意）。</span></li>
<li>${aiIc('claude','openai')}<span><b>Claude 聊天、ChatGPT 等只能聊天的 AI</b>不會自動部署：它會給你一個 Vercel 一鍵部署連結，你自己點開按 Deploy，完成後把新網址貼回給它，再請它幫你改內容。</span></li></ul></section>`;
function goDup(){const show=()=>scrollInList($('#dupBox'),'start');if($('#dupBox'))return show();location.hash='#prep';setTimeout(show,450)}
async function copyText(v,msg){try{await navigator.clipboard.writeText(v)}catch(e){const t=document.createElement('textarea');t.value=v;document.body.appendChild(t);t.select();try{document.execCommand('copy')}catch(_){}t.remove()}toast(msg)}
// 分享：手機用系統分享，其他複製到剪貼簿。朋友把這句貼給自己的 AI，就會接好 MCP 並打開網站
async function shareSite(){const text=AI_PROMPT();
 if(navigator.share&&matchMedia('(pointer:coarse)').matches){try{await navigator.share({title:LABEL(),text});return}catch(e){if(e&&e.name==='AbortError')return}}
 copyText(text,'已複製：傳給旅伴，請他貼給自己的 AI（Claude、ChatGPT、Codex…）')}
async function copyAI(){try{await navigator.clipboard.writeText(AI_PROMPT())}catch(e){const t=document.createElement('textarea');t.value=AI_PROMPT();document.body.appendChild(t);t.select();try{document.execCommand('copy')}catch(_){}t.remove()}toast('已複製，貼給 AI 即可')}


function panelDay(d){const n=pad(d.idx),cnt=d.pins.length;
 const eday=S.edit?`<div class="ebar day"><button type="button" class="ebtn" data-editday="${d.id}">✎ 編輯這天</button></div>`:'';
 const add=S.edit?`<button type="button" class="addbtn" data-add="${d.id}">＋ 新增景點</button>`:'';
 const addTop=S.edit?`<button type="button" class="pill addpill" data-add="${d.id}">＋ 新增景點</button>`:'';
 return grab(d.title,`${d.area} · ${cnt} 個地標`)+`<div class="sc-wrap">${curSheet(d)}</div><div class="scroll" id="scroll"><header class="dh only-desk"><span class="eyebrow">DAY ${n} · ${esc(d.date)}</span><h1>${esc(d.title)}</h1><span class="meta">${esc(d.area)} · 2 人同行 · ${cnt} 個地標</span><p>${esc(d.note)}</p></header><p class="sum only-touch">${layout==='phone'?esc(d.area)+' · ':''}${esc(d.note)}</p>${addTop?`<div class="tools touchtools only-touch">${addTop}</div>`:''}${eday}<div class="tools only-desk">${addTop}<button class="pill rainbtn" data-rain aria-pressed="${S.rain}">雨天安排 ☂</button><button class="pill allbtn" data-all aria-pressed="${S.all}">${S.all?'全部收合':'全部展開'}</button></div><div class="tl">${d.items.length?(layout==='tab'&&!S.edit?tabRows(d.items):d.items.map(rowHtml).join('')):`<p class="simple">這天還沒有項目。${S.edit?'點「新增景點」貼上 Google 地圖連結就能加入。':'按「編輯」即可新增，或請 AI 幫忙加入。'}</p>`}</div>${add}<div class="daybtns only-desk"><a href="${d.idx===1?'#prep':'#d'+(d.idx-1)}">${d.idx===1?'← 封面・行前':'← 前一天'}</a>${d.idx===N()?'':`<a class="next" href="#d${d.idx+1}">後一天 →</a>`}</div>${foot(d)}</div>`}
// 純文字裡的 [文字](網址) 與裸網址，改成句子裡的小按鈕（網站名稱＋↗），不顯示一長串網址
const SITE_NAMES=[[/airbnb\./,'Airbnb'],[/(maps\.app\.goo\.gl|google\.[a-z.]+\/maps|goo\.gl\/maps)/,'Google 地圖'],[/klook\./,'Klook'],[/booking\.com/,'Booking.com'],[/agoda\./,'Agoda'],[/kkday\./,'KKday'],[/instagram\./,'Instagram'],[/facebook\.|fb\.com/,'Facebook'],[/wa\.me|whatsapp\./,'WhatsApp'],[/tripadvisor\./,'Tripadvisor'],[/momence\./,'Momence'],[/telkomsel\./,'Telkomsel'],[/evisa\.imigrasi|imigrasi\.go\.id/,'印尼 e-Visa'],[/lovebali\./,'Love Bali'],[/youtube\.|youtu\.be/,'YouTube']];
function siteName(u){const v=String(u).toLowerCase();for(const[re,n]of SITE_NAMES)if(re.test(v))return n;try{const h=new URL(u).hostname.replace(/^www\./,'');const p=h.split('.');return p.length>2&&p[p.length-2].length<=3?p[p.length-3]:p[p.length-2]||h}catch(e){return '連結'}}
const lkBtn=(u,label)=>`<a class="lk" href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(u)}">${esc(label)}<span aria-hidden="true">↗</span></a>`;
function linkify(t){const parts=[];let s=String(t??'').replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,(_,a,u)=>{parts.push(lkBtn(u,a));return `\u0000${parts.length-1}\u0000`});
 s=s.replace(/https?:\/\/[^\s<>"'（）)｜|，,。]+/g,u=>{u=u.replace(/[.;:；：]+$/,'');parts.push(lkBtn(u,siteName(u)));return `\u0000${parts.length-1}\u0000`});
 // 網址拿掉後留下的「（房源： ）」「： 」這類空殼收乾淨
 return esc(s).replace(/\s+(?=\u0000)/g,' ').replace(/(\u0000\d+\u0000)\s+(?=[）)；。，])/g,'$1').replace(/\u0000(\d+)\u0000/g,(_,i)=>parts[+i])}
// 須知：「時間：標題」這種短行當成步驟，下一段拆成條列；整段只有連結的收成按鈕；第一段若是說明就當前言
const lkify=h=>String(h).replace(/<a ([^>]*)>(.*?)<\/a>/g,(_,attr,t)=>`<a class="lk" ${attr}>${t}<span aria-hidden="true">↗</span></a>`);
function noteHtml(n){const ps=(n.paragraphs||[]).map(p=>String(p).trim()).filter(Boolean);
 const isHead=h=>{const t=plain(h);return t.length<=28&&!/[。.]$/.test(t)&&!/<a /.test(h)};
 const onlyLinks=h=>/<a /.test(h)&&!plain(h.replace(/<a [^>]*>.*?<\/a>/g,'')).replace(/[｜|、,，\s]/g,'');
 const bullets=h=>h.split(/(?<=。)/).map(x=>x.trim()).filter(x=>plain(x)).map(x=>`<li>${lkify(x)}</li>`).join('');
 let intro='',steps=[],refs=[],cur=null,rest=[];
 ps.forEach((p,i)=>{if(onlyLinks(p)){refs.push(p);return}if(isHead(p)){const t=plain(p),m=t.match(/^(.+?)[：:]\s*(.+)$/),d=!m&&t.match(/^(\d{1,2}\/\d{1,2}(?:[-–]\d{1,2})?)\s*(.+)$/);cur={when:m?m[1]:d?d[1]:'',title:m?m[2]:d?d[2]:t,body:[]};steps.push(cur);return}
  if(cur)cur.body.push(p);else if(!steps.length&&i===0)intro=p;else rest.push(p)});
 if(!steps.length)return `<div class="nbody">${intro?`<ul class="nul">${bullets(intro)}</ul>`:''}${rest.length?`<ul class="nul">${rest.map(bullets).join('')}</ul>`:''}${refs.length?`<div class="nrefs"><span class="pgk">參考連結</span><span>${refs.map(lkify).join(' ')}</span></div>`:''}</div>`;
 return `<div class="nbody">${intro?`<p class="nintro">${lkify(intro)}</p>`:''}<ol class="nsteps">${steps.map(st=>`<li><div class="nsh">${st.when?`<span class="nwhen">${esc(st.when)}</span>`:''}<b>${esc(st.title)}</b></div>${st.body.length?`<ul class="nul">${st.body.map(bullets).join('')}</ul>`:''}</li>`).join('')}</ol>${rest.length?`<ul class="nul">${rest.map(bullets).join('')}</ul>`:''}${refs.length?`<div class="nrefs"><span class="pgk">參考連結</span><span class="nrl">${refs.map(lkify).join('')}</span></div>`:''}</div>`}
// 待辦依標題裡的日期排序（1 月排在 12 月之後），沒日期的照原順序放後面，已完成的沉到最下面
const ckDate=c=>{const m=plain(c.title).match(/(\d{1,2})\/(\d{1,2})/);if(!m)return 9999;const mo=+m[1];return (mo<7?mo+12:mo)*40+ +m[2]};
const ckSort=C=>[...C].sort((a,b)=>(a.done-b.done)||(ckDate(a)-ckDate(b))||(a.position-b.position));
// 每天挑一張代表照片：優先景點、餐廳（略過交通、航班）
const photoScore=x=>{const t=plain(x.type);return /景點|市集|海灘/.test(t)?3:/跨年|晚餐|音療/.test(t)?2.5:/早餐|住宿|休息|交通|退房|機場|入住|航|行程|按摩/.test(t)?0:2};
function dayPhotos(){const used=new Set();return data.days.map(d=>{const c=d.items.filter(x=>x.photos&&x.photos[0]&&x.photos[0].image).sort((a,b)=>photoScore(b)-photoScore(a));const x=c.find(x=>!used.has(x.photos[0].image))||c[0];if(!x)return null;used.add(x.photos[0].image);return x.photos[0]})}
function panelCover(){const t=data.trip||DEFAULT_TRIP,C=data.checks,done=C.filter(c=>c.done).length,pct=C.length?Math.round(done/C.length*100):0,ph=tripPhase(),s=pd(t.start_date),e=pd(t.end_date);
 const nights=s&&e?Math.round((e-s)/864e5):null,len=nights!=null?`${nights+1} 天 ${nights} 夜`:`${N()} 天`;
 const range=s?`${fmtD(s)}${e?' — '+fmtD(e):''}`:'';
 const cd=!ph?'':ph.k==='before'?`<div class="cd"><b>${ph.n}</b><small>天後出發</small></div>`:ph.k==='during'?`<a class="cd now" href="#d${Math.min(ph.n,N())}"><small>旅程進行中</small><b>DAY ${pad(ph.n)}</b></a>`:`<div class="cd"><small>旅程已結束</small><b>回憶</b></div>`;
 const pins=data.days.reduce((a,d)=>a+d.pins.length,0);
 const eats=data.days.reduce((a,d)=>a+d.items.filter(x=>/餐|咖啡|甜點/.test(plain(x.type))&&!/早餐|機上/.test(plain(x.type))).length,0);
 const img=t.cover_image?`<img class="hero-img" src="${esc(t.cover_image)}" alt="${esc(t.cover_caption||t.title)}" style="object-position:${esc(t.cover_focus||'center')}" fetchpriority="high">`:'';
 const ebar=S.edit?`<div class="cvedit"><button type="button" class="ebtn" data-edittrip>✎ 編輯封面</button></div>`:'';
 const dps=dayPhotos(),cards=data.days.map((d,i)=>{const p=dps[i];return `<a class="dcard" href="#d${d.idx}"><span class="dimg">${p?`<img src="${esc(p.image)}" alt="" loading="lazy">`:''}<span class="dno">${pad(d.idx)}</span></span><span class="dtx"><small>DAY ${pad(d.idx)} · ${esc(d.date)}</small><b>${esc(d.title)}</b><span class="dar">${esc(d.area)}</span>${d.breakfast?`<span class="dbf">早餐｜${esc(d.breakfast)}</span>`:''}</span></a>`}).join('');
 const ckHtml=c=>`<div class="checkw"><label class="check ${c.done?'done':''}"><input type="checkbox" data-check="${esc(c.id)}" ${c.done?'checked':''} ${canEdit()?'':'disabled'}><span><strong>${linkify(c.title)}</strong><small>${linkify(c.detail)}</small></span></label>${S.edit?`<div class="ebar"><button type="button" class="ebtn" data-editcheck="${esc(c.id)}">✎ 編輯</button><button type="button" class="ebtn del" data-delcheck="${esc(c.id)}">刪除</button></div>`:''}</div>`;
 const notesOn=t.notes_enabled!==false,tab=notesOn?S.ptab:'prep';
 const notes=data.extras.map(n=>`<details class="det" ${data.extras.length===1?'open':''}><summary>${esc(n.title)}</summary><div class="dc">${noteHtml(n)}${S.edit?`<div class="ebar"><button type="button" class="ebtn" data-editnote="${esc(n.id)}">✎ 編輯</button><button type="button" class="ebtn del" data-delnote="${esc(n.id)}">刪除</button></div>`:''}</div></details>`).join('');
 // 待辦清單（訂位、購票也都是待辦）：沒有日期的放「出發前・整趟」，其餘依標題日期歸到那一天
 const dayOf=c=>{const m=plain(c.title).match(/(\d{1,2})\/(\d{1,2})/);if(!m)return null;return data.days.find(d=>plain(d.date).startsWith(`${+m[1]}/${+m[2]}`))||null};
 const byDay=new Map(),general=[];ckSort(C).forEach(c=>{const d=dayOf(c);if(d){if(!byDay.has(d.id))byDay.set(d.id,[]);byDay.get(d.id).push(c)}else general.push(c)});
 const grp=(label,sub,items,links,key,addDate)=>`<div class="pg" ${key?`data-pg="${key}"`:''}><div class="pgh"><span class="pgd">${label}</span><span class="pgt">${sub}</span></div><div class="pgb">${items.length?`<div class="checks">${items.map(ckHtml).join('')}</div>`:''}${links?`<div class="pgl"><span class="pgk">預訂入口</span><span class="chips">${links}</span></div>`:''}${S.edit?`<button type="button" class="addbtn sm" data-addcheck="${esc(addDate||'')}">＋ ${addDate?'在這天新增待辦':'新增整趟待辦'}</button>`:''}</div></div>`;
 const groups=[general.length||S.edit?grp('出發前','<b>整趟旅程</b><small>住宿、網卡、交通等</small>',general,'','',''):'',...data.days.map(d=>{const its=byDay.get(d.id)||[];const md=(plain(d.date).match(/\d{1,2}\/\d{1,2}/)||[''])[0];return its.length||S.edit?grp(`D${d.idx}`,`<b>${esc(d.title)}</b><small>${esc(d.date)}</small>`,its,'',d.idx,md):''})].join('');
 return `<div class="scroll cover" id="scroll">
<section class="hero${img?'':' noimg'}${S.heroAnim?' anim':''}">${img}<div class="hero-shade"></div>
 <div class="hero-in cv-in">
  <div class="hero-txt"><span class="hero-eb">${esc(t.destination)}${range?`<i></i>${range}`:''}</span><h1>${esc(t.title)}</h1>${t.subtitle?`<p class="hero-sub">${esc(t.subtitle)}</p>`:''}
   <div class="hero-cta"><a class="cbtn pri" href="#d1">${ph&&ph.k==='during'?'看今天的行程':'從第一天開始'} <span aria-hidden="true">→</span></a><button type="button" class="cbtn ghost" data-scrollto="prepList">行前準備 ${done}/${C.length}</button><button type="button" class="cbtn ghost" data-share>分享給旅伴</button></div></div>
  <div class="hero-side">${t.travelers?`<span class="who">${esc(t.travelers)}</span>`:''}${cd}</div>
 </div>${t.cover_caption&&img?`<span class="hero-cap">${esc(t.cover_caption)}</span>`:''}${ebar}
</section>
<section class="cv-intro cv-in">${t.intro?`<p class="lede">${esc(t.intro)}</p>`:''}<dl class="stats"><div><dt>天數</dt><dd>${len}</dd></div><div><dt>地點</dt><dd>${pins}<small> 站</small></dd></div><div><dt>美食</dt><dd>${eats}<small> 家</small></dd></div><div><dt>行前準備</dt><dd>${done}<small> / ${C.length}</small></dd></div></dl></section>
<section class="cv-sec cv-in"><div class="cv-head"><span class="eyebrow">THE JOURNEY</span><h2>旅程一覽</h2><p>${len} · 點選任一天看路線地圖與每站細節</p></div><div class="dgrid">${cards}</div>${S.edit?'<button type="button" class="addbtn" data-addday>＋ 新增一天</button>':''}</section>
<section class="cv-sec cv-in" id="prepList"><div class="cv-head"><span class="eyebrow">BEFORE YOU GO</span><h2>${esc(t.prep_title||'行前資料與預訂清單')}</h2>${t.prep_intro?`<p>${esc(t.prep_intro)}</p>`:''}</div>
 <div class="pcard">
  ${notesOn?`<div class="ptabs" role="tablist" aria-label="行前資料">
   <button type="button" role="tab" id="pt-prep" aria-controls="pp" aria-selected="${S.ptab==='prep'}" data-ptab="prep">待辦與預訂<span class="pn">${done}/${C.length}</span></button>
   <button type="button" role="tab" id="pt-notes" aria-controls="pp" aria-selected="${S.ptab==='notes'}" data-ptab="notes"><span>${esc(t.notes_title||'入境與須知')}</span><span class="pn">${data.extras.length}</span></button>
  </div>`:''}
  <div class="ppanel" id="pp" ${notesOn?`role="tabpanel" aria-labelledby="pt-${tab}"`:''}>
  ${tab==='prep'?`<div class="prog"><span id="progT">已確認 ${done} / ${C.length} 項 · 依日期排列，完成的排在每組最後</span><div class="bar"><i id="progB" style="width:${pct}%"></i></div></div>${S.edit?'<button type="button" class="addbtn" data-addcheck="">＋ 新增待辦</button>':''}<div class="pgs">${groups||'<p class="simple">還沒有待辦或預訂。</p>'}</div><p class="foot">預訂入口會開啟店家或票券的官方頁面；出發前請再核對最新規定。</p>`
  :`<div class="notes">${notes||'<p class="simple">還沒有說明區塊。</p>'}</div>${S.edit?'<button type="button" class="addbtn" data-addnote>＋ 新增說明區塊</button>':''}`}
  </div>
 </div>
</section>
<section class="cv-sec cv-in">${aiBox()}${dupBox()}<details class="det" id="hist"><summary>修改紀錄（可還原）</summary><div class="dc" id="histList"><p class="simple">展開後載入…</p></div></details>${foot(null)}</section>
</div>`}

/* ---------- render ---------- */
function renderPanel(keepScroll=true){const sc=$('#scroll'),top=keepScroll&&sc?sc.scrollTop:0;const histOpen=$('#hist')&&$('#hist').open;$('#panel').innerHTML=S.day?(day()?panelDay(day()):''):panelCover();S.heroAnim=false;if($('#scroll'))$('#scroll').scrollTop=top;if(histOpen&&$('#hist')){$('#hist').open=true;loadHistory()}bindGrab();renderCur();updateStatus()}
function renderCur(){const d=day(),f=$('#curf');f.innerHTML=curFloat(d);f.hidden=!d||!d.pins.length;const w=$('.sc-wrap');if(w)w.innerHTML=curSheet(d)}
function dayMenuHtml(){const days=data.days.map(d=>`<a href="#d${d.idx}" ${S.day===d.idx?'aria-current="page"':''}><span class="dmn">${pad(d.idx)}</span><span class="dmt"><b>${esc(d.date)}</b><small>${esc(d.title)}</small></span></a>`).join('');return `<a href="#prep" ${S.day===0?'aria-current="page"':''}><span class="dmn">✦</span><span class="dmt"><b>封面・行前資料</b><small>${esc((data.trip||{}).title||'旅程總覽')} · 待辦與預訂</small></span></a><div class="dsep"></div>`+days}
function setDayMenu(open){const menu=$('#dmenu'),btn=$('#mlabel');if(!menu||!btn)return;menu.hidden=!open;btn.setAttribute('aria-expanded',String(open));if(open)closeSearch()}
function dayOverflow(center){const n=$('#days');if(!n)return;
 if(center){const c=n.querySelector('[aria-current=page]');if(c){const prev=n.style.scrollBehavior;n.style.scrollBehavior='auto';n.scrollLeft=c.offsetLeft-(n.clientWidth-c.offsetWidth)/2;n.style.scrollBehavior=prev}}
 const max=n.scrollWidth-n.clientWidth,x=n.scrollLeft,L=x>4,R=x<max-4;
 n.classList.toggle('fade-l',L);n.classList.toggle('fade-r',R);
 $('#dscrL').hidden=!L;$('#dscrR').hidden=!R;}
function renderChrome(){
 $('#days').innerHTML=`<a href="#prep" class="cvtab" ${S.day===0?'aria-current="page"':''}><span class="dn">✦</span><span class="dd">封面・行前</span></a><i class="dsep2" aria-hidden="true"></i>`+data.days.map(d=>`<a href="#d${d.idx}" ${S.day===d.idx?'aria-current="page"':''}><span class="dn">${pad(d.idx)}</span><span class="dd">${esc(d.date)}</span></a>`).join('')+'';
 dayOverflow(true);requestAnimationFrame(()=>dayOverflow(true));
 const d=day();$('#mlabel').innerHTML=d?`<small>DAY ${pad(d.idx)} / ${pad(N())}</small><b>${esc(d.date)}<i aria-hidden="true"></i></b>`:'<small>OVERVIEW</small><b>封面・行前<i aria-hidden="true"></i></b>';
 $('#mlabel').setAttribute('aria-label',d?`選擇日期，目前第 ${d.idx} 天，${d.date}`:'選擇日期，目前為行前資料');
 $('#dmenu').innerHTML=dayMenuHtml();
 $('#mprev').disabled=S.day===0;$('#mnext').disabled=S.day===N();
 document.documentElement.classList.toggle('cover',S.day===0);
 ['#rainMap','#rainM'].forEach(s=>$(s).setAttribute('aria-pressed',S.rain));
 $('#rainMap').hidden=S.panel||!S.day;$('#rainM').hidden=!S.day;
 $('#panel').hidden=layout==='desk'&&!S.panel&&S.day!==0;
 const tp=$('#togglePanel');tp.setAttribute('aria-expanded',S.panel);tp.setAttribute('aria-label',S.panel?'收合行程清單':'顯示行程清單');$('#tpFill').setAttribute('fill',S.panel?cv('--soft'):'none');
 ['#editT','#editM'].forEach(s=>{const b=$(s);if(b)b.setAttribute('aria-pressed',S.edit)});
 document.documentElement.classList.toggle('editing',S.edit);
 const tt=data.trip||{};document.title=d?`D${d.idx} ${plain(d.title)}｜${plain(tt.title)}`:[plain(tt.travelers),plain(tt.title)].filter(Boolean).join('｜')||'旅行行程';
 const br=$('.brand');if(br){const y=[tt.start_date,tt.end_date].filter(Boolean).map(s=>String(s).slice(0,4)).filter((v,i,a)=>a.indexOf(v)===i).join(' — ');
  br.querySelector('b').textContent=plain(tt.travelers)||plain(tt.title)||'旅行行程';br.querySelector('small').textContent=[String(plain(tt.destination)||'').split(',')[0].toUpperCase(),y].filter(Boolean).join(' · ')}
}
function updateStatus(){const el=$('#sync');if(!el)return;el.textContent=!sb?'未連線到資料庫，顯示內建版本':online?(synced?`已同步 ${pad(synced.getHours())}:${pad(synced.getMinutes())}`:'同步中…'):'離線中：顯示上次同步的內容，暫時無法編輯'}
function setSheet(h,anim=true){const p=$('#panel');p.classList.toggle('anim',anim);document.documentElement.style.setProperty('--sheet',h+'px');$('#mapbtn').classList.toggle('show',layout!=='desk'&&S.snap==='full'&&!drag)}
function applySnap(anim=true){if(layout==='desk'){document.documentElement.style.setProperty('--sheet','0px');$('#mapbtn').classList.remove('show');return}setSheet(snapH(S.snap),anim);const h=$('#handle');if(h)h.setAttribute('aria-label',S.snap==='full'?'收合行程清單':'展開行程清單')}
function goSnap(k){S.snap=k;applySnap();if(k!=='full')setTimeout(()=>focusMap(false),260)}

/* ---------- map ---------- */
function insets(){const sat=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat'))||0;if(layout==='desk')return{tl:[50,80],br:[50,S.day&&day()&&day().pins.length?200:50]};const sh=S.snap==='full'?snapH('half'):snapH(S.snap);return{tl:[30,Math.round(90+sat)],br:[30,sh+24]}}
// 底圖依主題（themes.js MAP_BASES）：底圖層 → 染色層 → 地名層 → 路線與標記
let tileSet={base:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'],labels:'',max:16},mapLayers=[],mapLayerKey='';
function setMapLayers(){if(!map||!window.TRIP_THEMES||!curTheme)return;const m=curTheme.map,ts=TRIP_THEMES.tileLayers(m),key=JSON.stringify(ts);
 const tint=map.getPane('tint');tint.firstChild.style.cssText=m.tint&&m.tint_strength?`background:${m.tint};opacity:${m.tint_strength/100}`:'display:none';
 const lp=map.getPane('labels');lp.style.opacity=m.label_opacity/100;lp.style.filter=m.label_warmth?`sepia(${m.label_warmth}%) saturate(${100+m.label_warmth*1.6}%) brightness(${100-m.label_warmth*.12}%)`:'none';
 if(key===mapLayerKey)return;mapLayerKey=key;tileSet=ts;mapLayers.forEach(l=>map.removeLayer(l));
 mapLayers=ts.base.map(u=>L.tileLayer(u,{maxZoom:19,maxNativeZoom:ts.max,attribution:'Tiles &copy; Esri'}).addTo(map));
 if(ts.labels)mapLayers.push(L.tileLayer(ts.labels,{pane:'labels',maxZoom:19,maxNativeZoom:ts.max}).addTo(map))}
function initMap(){if(typeof L==='undefined'){$('#map').innerHTML='<p style="padding:90px 24px;text-align:center;color:var(--muted)">互動地圖暫時無法載入，請使用各項目的 Google 地圖連結。</p>';return}
 map=L.map('map',{zoomControl:false,attributionControl:true,scrollWheelZoom:true,zoomSnap:.5});
 map.createPane('tint').style.zIndex=250;map.getPane('tint').innerHTML='<div class="map-tint"></div>';map.createPane('labels').style.zIndex=260;map.getPane('labels').style.pointerEvents='none';
 setMapLayers();
 map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
 overlay=L.layerGroup().addTo(map);
 map.on('click',e=>{if(S.picking){const cb=S.picking;endPick();cb([+e.latlng.lat.toFixed(6),+e.latlng.lng.toFixed(6)])}else if(S.sel&&S.day)deselect()})}
function pinIcon(html,cls){return L.divIcon({className:'pinw',html:`<div class="pin ${cls}">${html}</div>`,iconSize:[0,0],iconAnchor:[0,0]})}
function drawMap(){if(!map)return;map.invalidateSize(false);overlay.clearLayers();markers={};const d=day();
 if(!d&&S.day===0)return;
 if(!d){const ps=[];data.days.forEach(dd=>dd.pins.forEach(x=>{ps.push(x);const m=L.marker(x.pt.latlng,{icon:pinIcon('D'+dd.idx,'daypin'),keyboard:true,title:`D${dd.idx} ${x.pt.name}`}).addTo(overlay);m.bindTooltip(`<b>D${dd.idx} · ${esc(x.pt.name)}</b><br>${esc(x.pt.time)}`,{direction:'top',offset:[0,-16],className:'map-tip'});m.on('click',()=>{location.hash='d'+dd.idx;setTimeout(()=>select(x.id,{open:true,scroll:true,pan:true}),60)})}));if(ps.length)fitAll();return}
 ROUTE.legs={};ROUTE.split=false;if(d.routeGeometry)drawRoute(d.routeGeometry);
 else if(d.pins.length>1)L.polyline(d.pins.map(x=>x.pt.latlng),{color:cv('--gold'),weight:3,dashArray:'6 8',opacity:.9,interactive:false}).addTo(overlay);
 d.pins.forEach(x=>{if(x.pt.key==='batur')L.circle(x.pt.latlng,{radius:1500,color:cv('--gold'),weight:1,fillOpacity:.07,dashArray:'5 6',interactive:false}).addTo(overlay)});
 // 同一個地點的站（例如起點和終點都是住宿）合成一個標記，標成「1·5」，不然後面的號碼會蓋住前面的
 const groups=[];d.pins.forEach(x=>{const g=groups.find(g=>L.latLng(g[0].pt.latlng).distanceTo(x.pt.latlng)<40);g?g.push(x):groups.push([x])});
 groups.forEach(g=>{const x=g[0],multi=g.length>1;
  const m=L.marker(x.pt.latlng,{icon:pinIcon(g.map(y=>y.n).join('·'),multi?'multi':''),keyboard:true,draggable:S.edit&&canEdit(),title:g.map(y=>`第 ${y.n} 站：${y.ttl}`).join('；')}).addTo(overlay);
  m.bindTooltip(multi?g.map(y=>`<b>${y.n} · ${esc(y.pt.name)}</b> ${esc(y.pt.time)}`).join('<br>')+(S.edit?'<br><small>拖動會一起移動這幾站</small>':''):`<b>${esc(x.pt.name)}</b><br>${esc(x.pt.time)}${S.edit?'<br><small>拖動可移動位置</small>':''}`,{direction:'top',offset:[0,-22],className:'map-tip'});
  // 合併的標記：再點一次換到下一站
  m.on('click',()=>{const i=g.findIndex(y=>y.id===S.sel);if(i===g.length-1)return deselect();select(g[i+1].id,{open:true,scroll:true,pan:false})});
  m.on('dragend',()=>{const p=m.getLatLng(),ll=[+p.lat.toFixed(6),+p.lng.toFixed(6)];g.forEach(y=>moveItemTo(y,ll))});
  g.forEach(y=>markers[y.id]=m)});
 fitDay();updatePins()}
// 開車：沿道路實線；搭船：長虛線；搭飛機：點線；算不出路線（straight）：短虛線
const MODE_STYLE={car:null,boat:{dashArray:'12 9',weight:3},plane:{dashArray:'2 9',weight:3.5,lineCap:'round'},straight:{dashArray:'6 8',weight:3}};
const MODE_NAME={car:'開車',boat:'搭船',plane:'搭飛機',straight:'直線（查無道路）'};
// ROUTE.legs[k]：第 k 段（第 k+1 站到第 k+2 站）的圖層；舊資料沒有 leg 編號時 split=false，整條一起亮
const ROUTE={legs:{},split:false};
function drawRoute(g){const feats=g.type==='FeatureCollection'?g.features:[{type:'Feature',properties:{mode:'car'},geometry:g}];
 ROUTE.legs={};ROUTE.split=feats.length>0&&feats.every(f=>f.properties&&Number.isInteger(f.properties.leg));
 const add=(f,style,op,tip)=>{const l=L.geoJSON(f,{style:{...style,opacity:op},interactive:!!tip});if(tip)l.bindTooltip(tip,{sticky:true,className:'map-tip'});l.addTo(overlay);const k=ROUTE.split?f.properties.leg:-1;(ROUTE.legs[k]=ROUTE.legs[k]||[]).push({l,op})};
 feats.forEach(f=>{const m=(f.properties&&f.properties.mode)||'car',st=m in MODE_STYLE?MODE_STYLE[m]:MODE_STYLE.straight;
  // 路線要跟底圖道路分得開：白色光暈 → 深色描邊 → 強調色主線
  const R={lineJoin:'round',lineCap:'round',interactive:false};
  if(!st){add(f,{...R,color:'#fff',weight:12},.9);add(f,{...R,color:cv('--brown'),weight:7.5},1);add(f,{...R,color:cv('--gold'),weight:4.5},1)}
  else{add(f,{...R,color:'#fff',weight:st.weight+7},.85);add(f,{color:cv('--gold'),...st,weight:st.weight+1.5,lineCap:st.lineCap||'butt'},1,MODE_NAME[m])}})}
// 選到某站：亮它到下一站那段（最後一站亮抵達那段）；選到交通等沒有位置的項目：亮它所在的那段；沒選：整條都亮
function activeLeg(d){if(!d||!S.sel||d.pins.length<2)return -1;const n=d.pins.length,p=d.pins.findIndex(x=>x.id===S.sel);
 if(p>=0)return p<n-1?p:p-1;
 let last=-1;for(const x of d.items){if(x.id===S.sel)break;const i=d.pins.indexOf(x);if(i>=0)last=i}
 return last>=0&&last<n-1?last:-1}
function styleRoute(){const k=ROUTE.split?activeLeg(day()):-1;
 Object.entries(ROUTE.legs).forEach(([leg,ls])=>{const on=k<0||+leg===k;ls.forEach(({l,op})=>l.setStyle({opacity:on?op:op*.25}))});
 if(k>=0&&ROUTE.legs[k])ROUTE.legs[k].forEach(({l})=>l.bringToFront())}
function routeCoords(g){if(!g)return[];const fs=g.type==='FeatureCollection'?g.features.map(f=>f.geometry):[g];return fs.flatMap(x=>x.coordinates.map(c=>[c[1],c[0]]))}
function updatePins(){const d=day();if(!d)return;const st=new Map();d.pins.forEach(x=>{const m=markers[x.id];if(!m)return;const o=st.get(m)||{sel:false,rain:false};o.sel=o.sel||x.id===S.sel;o.rain=o.rain||!!x.hasRain;st.set(m,o)});st.forEach((o,m)=>{const el=m.getElement();if(!el)return;const p=el.firstChild;p.classList.toggle('sel',o.sel);p.classList.toggle('dim',S.rain&&!o.rain);el.classList.toggle('on',o.sel)});styleRoute()}
function fitDay(){const d=day();if(!map||!d)return fitAll();const ps=d.pins.map(x=>x.pt.latlng),i=insets();if(ps.length>1)map.fitBounds(L.latLngBounds(ps),{paddingTopLeft:i.tl,paddingBottomRight:i.br,maxZoom:14});else if(ps.length)map.setView(ps[0],14);else map.setView([-8.55,115.2],10)}
function fitAll(){if(!map)return;const ps=data.days.flatMap(d=>d.pins.map(x=>x.pt.latlng)),i=insets();if(ps.length)map.fitBounds(L.latLngBounds(ps),{paddingTopLeft:i.tl,paddingBottomRight:i.br});else map.setView([-8.55,115.2],10)}
// 選站時把「這站到下一站」那段整段放進畫面：已經完整可見、而且夠大就不動；否則縮放到剛好看得見
function focusLeg(){const d=day(),k=ROUTE.split?activeLeg(d):-1;if(!map||k<0||!ROUTE.legs[k])return false;
 let b=null;ROUTE.legs[k].forEach(({l})=>{const lb=l.getBounds();if(lb.isValid())b=b?b.extend(lb):L.latLngBounds(lb.getSouthWest(),lb.getNorthEast())});
 const x=d.pins.find(x=>x.id===S.sel);if(x){b=b||L.latLngBounds(x.pt.latlng,x.pt.latlng);b.extend(x.pt.latlng)}
 if(!b||!b.isValid()||b.getNorthEast().equals(b.getSouthWest()))return false;
 const i=insets(),sz=map.getSize(),ne=map.latLngToContainerPoint(b.getNorthEast()),sw=map.latLngToContainerPoint(b.getSouthWest());
 const inView=sw.x>=i.tl[0]&&ne.y>=i.tl[1]&&ne.x<=sz.x-i.br[0]&&sw.y<=sz.y-i.br[1],span=Math.max(ne.x-sw.x,sw.y-ne.y);
 if(inView&&span>=Math.max(160,.3*Math.min(sz.x-i.tl[0]-i.br[0],sz.y-i.tl[1]-i.br[1])))return true;
 map.fitBounds(b,{paddingTopLeft:[i.tl[0]+30,i.tl[1]+30],paddingBottomRight:[i.br[0]+30,i.br[1]+30],maxZoom:17,animate:!matchMedia('(prefers-reduced-motion:reduce)').matches});return true}
function focusMap(zoom){const d=day();if(!map||!d)return;const x=d.pins.find(x=>x.id===S.sel);if(!x)return fitDay();const i=insets();if(zoom&&map.getZoom()<14)map.setView(x.pt.latlng,15);map.panInside(x.pt.latlng,{paddingTopLeft:i.tl,paddingBottomRight:i.br})}

/* ---------- actions ---------- */
function deselect(){const id=S.sel;if(!id)return;S.sel=null;S.open.delete(id);renderPanel();updatePins()}
// 只捲動清單本身（#scroll）。scrollIntoView 會連整個頁面一起捲，iOS 版面會整個往上移、上方按鈕跑出畫面
function scrollInList(el,block){const sc=$('#scroll');if(!el)return;const smooth=!matchMedia('(prefers-reduced-motion:reduce)').matches;
 if(!sc||!sc.contains(el)){el.scrollIntoView({behavior:smooth?'smooth':'auto',block});return}
 const r=el.getBoundingClientRect(),c=sc.getBoundingClientRect(),top=c.top+Math.max(12,parseFloat(getComputedStyle(el).scrollMarginTop)||0),bottom=Math.min(c.bottom,innerHeight)-12;let dy=0;
 if(block==='start')dy=r.top-top;else if(r.top<top)dy=r.top-top;else if(r.bottom>bottom)dy=Math.min(r.bottom-bottom,r.top-top);
 if(dy)sc.scrollTo({top:sc.scrollTop+dy,behavior:smooth?'smooth':'auto'});
 if(document.scrollingElement.scrollTop)document.scrollingElement.scrollTop=0}
function select(id,{open=false,toggle=false,scroll=false,pan=true}={}){const d=day();if(!d)return;const x=d.items.find(x=>x.id===id);if(!x)return;if(toggle&&S.sel===id)return deselect();S.sel=id;if(toggle||open)S.open.add(id);renderPanel();updatePins();if(!focusLeg()&&pan&&x.pt)focusMap(false);if(scroll){const r=document.getElementById('r-'+id);if(r)scrollInList(r.classList.contains('tleg')?r:r.querySelector('.card'),'nearest')}}
function step(k){const d=day();if(!d||!d.pins.length)return;const i=curIdx(d),x=S.sel?d.pins[(i+k+d.pins.length)%d.pins.length]:d.pins[k>0?0:d.pins.length-1];select(x.id,{open:true,scroll:true,pan:true})}
function route(){const h=decodeURIComponent(location.hash.slice(1));let n,itemId=null;
 if(h==='prep'||h==='prepList')n=0;
 else if(!h)n=landingDay();
 else{const it=findItem(h);if(it){n=it.day.idx;itemId=it.id}else{n=Number((h.match(/^d(\d+)$/)||[])[1]);if(!(n>=1&&n<=N()))n=0}}
 const changed=n!==S.day||!S._init;S._init=true;
 if(changed){S.day=n;S.heroAnim=n===0;S.open=new Set();S.all=false;S.rain=false;S.sel=null;S.snap=defSnap()}
 if(itemId){S.sel=itemId;S.open.add(itemId)}
 renderChrome();renderPanel(false);applySnap(false);if(changed)drawMap();else{updatePins();focusMap(false)}
 if(itemId)setTimeout(()=>select(S.sel,{scroll:true}),50);closeSearch();setDayMenu(false)}
// 快取裡還沒有的項目／天數（例如 AI 剛新增的連結），同步後重新導向
function reroute(){const h=decodeURIComponent(location.hash.slice(1));if(!h){const n=landingDay();if(n!==S.day)route();return}if(h==='prep')return;const it=findItem(h);if(it){if(it.day.idx!==S.day||S.sel!==it.id)route();return}const n=Number((h.match(/^d(\d+)$/)||[])[1]);if(n>=1&&n<=N()&&n!==S.day)route()}
function rain(){S.rain=!S.rain;renderChrome();renderPanel();updatePins()}

/* ---------- sheet drag ---------- */
function bindGrab(){const g=$('#grab');if(!g)return;g.onpointerdown=e=>{if(layout==='desk'||(e.button!==undefined&&e.button!==0))return;const startY=e.clientY,startH=snapH(S.snap),from=S.snap;drag={moved:false};
 const mv=ev=>{const dy=startY-ev.clientY;if(Math.abs(dy)>6)drag.moved=true;if(drag.moved)setSheet(clampSheet(startH+dy),false)};
 const up=ev=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',up);removeEventListener('pointercancel',up);const moved=drag&&drag.moved;drag=null;if(!moved){applySnap();return}g.dataset.dragged='1';settleSheet(startH+(startY-ev.clientY),from,startY-ev.clientY)};
 addEventListener('pointermove',mv);addEventListener('pointerup',up);addEventListener('pointercancel',up)};
 $('#handle').onclick=()=>{if(g.dataset.dragged){delete g.dataset.dragged;return}goSnap({peek:'half',half:'full',full:'peek'}[S.snap])};
 const sc=$('#scroll');if(!sc||layout==='desk')return;let st=null;
 sc.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;st={y:e.touches[0].clientY,h:Math.round($('#panel').getBoundingClientRect().height),from:S.snap,on:false}},{passive:true});
 sc.addEventListener('touchmove',e=>{if(!st||e.touches.length!==1)return;const dy=st.y-e.touches[0].clientY;if(!st.on){if(sc.scrollTop>1){st=null;return}if(dy<-10)st.on=true;else if(dy>8){st=null;return}else return}if(sc.scrollTop>1){st=null;return}e.preventDefault();drag={moved:true};setSheet(clampSheet(st.h+dy),false)},{passive:false});
 sc.addEventListener('touchend',e=>{if(!st)return;const on=st.on,dy=st.y-(e.changedTouches[0]?e.changedTouches[0].clientY:st.y),h=st.h+dy,from=st.from;st=null;drag=null;if(on)settleSheet(h,from,dy)});
 sc.addEventListener('touchcancel',()=>{if(st&&st.on)applySnap();st=null;drag=null})}

/* ---------- search ---------- */
function doSearch(inp,box){const q=inp.value.trim().toLowerCase();if(!q){box.classList.remove('show');return}const hits=[];data.days.forEach(d=>d.items.forEach(x=>{const t=plain([x.title,x.note,...x.food,...x.booking,...x.rain,...x.extra].join(' ')),p=t.toLowerCase().indexOf(q);if(p>=0)hits.push({d,x,snip:t.slice(Math.max(0,p-15),p+80)})}));
 box.innerHTML=hits.length?hits.slice(0,20).map(h=>`<button data-go="${esc(h.x.id)}">D${h.d.idx} · ${esc(h.x.ttl)}<small>${esc(h.snip)}…</small></button>`).join(''):'<div class="empty">沒有符合的項目；可試「按摩」「雞翅」或店名。</div>';box.classList.add('show')}
function closeSearch(){$$('.results').forEach(r=>r.classList.remove('show'));$('#q').value='';$('#mq').value='';S.search=false;$('#msearch').classList.remove('show');$('#msBtn').setAttribute('aria-expanded','false')}
$('#q').oninput=()=>doSearch($('#q'),$('#qr'));$('#mq').oninput=()=>doSearch($('#mq'),$('#mqr'));
$('#msBtn').onclick=()=>{S.search=!S.search;$('#msearch').classList.toggle('show',S.search);$('#msBtn').setAttribute('aria-expanded',S.search);if(S.search)$('#mq').focus();else closeSearch()};

/* ---------- 文字轉換：編輯框用 [文字](網址)，儲存為安全的 HTML ---------- */
function toEditText(html){const d=document.createElement('div');d.innerHTML=String(html??'');d.querySelectorAll('a').forEach(a=>{const t=a.textContent.trim(),u=a.getAttribute('href')||'';a.replaceWith(u?(t&&t!==u?`[${t}](${u})`:u):t)});return d.textContent.replace(/[ \t]+/g,' ').trim()}
function fromEditText(text){const links=[];let s=String(text??'').trim().replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,(_,t,u)=>{links.push([t,u]);return `\u0000${links.length-1}\u0000`});
 s=esc(s).replace(/https?:\/\/[^\s<>"'（）)]+/g,u=>{const raw=u.replace(/&amp;/g,'&');return `<a href="${esc(raw)}" target="_blank" rel="noopener noreferrer">${u}</a>`});
 return s.replace(/\u0000(\d+)\u0000/g,(_,i)=>{const[t,u]=links[+i];return `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>`})}
const linesOut=arr=>(arr||[]).map(toEditText).join('\n');
const linesIn=t=>String(t||'').split('\n').map(s=>s.trim()).filter(Boolean).map(fromEditText);
const plainIn=t=>esc(String(t||'').trim());

/* ---------- 解析座標 ---------- */
function parseLatLng(s){s=String(s||'').trim();if(!s)return null;
 const pats=[/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,/[?&](?:q|query|ll|destination|daddr)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i,/@(-?\d+\.\d+),(-?\d+\.\d+)/,/^(-?\d{1,2}\.\d+)\s*[,，\s]\s*(-?\d{1,3}\.\d+)$/];
 for(const p of pats){const m=s.match(p);if(m){const a=+m[1],b=+m[2];if(Math.abs(a)<=90&&Math.abs(b)<=180)return[+a.toFixed(6),+b.toFixed(6)]}}return null}
// 從 Google 地圖連結取出名稱（/maps/place/名稱/ 或 ?q=名稱）
function nameFromLink(s){try{const u=new URL(s);const dec=x=>decodeURIComponent(x.replace(/\+/g,' ')).trim();const m=u.pathname.match(/\/maps\/place\/([^/@]+)/);if(m)return dec(m[1]).split(',')[0].trim();const q=u.searchParams.get('q')||u.searchParams.get('query');if(q&&!/^-?\d+\.\d+\s*,/.test(q))return q.split(',')[0].trim()}catch(e){}return''}
const isMapLink=s=>/^https?:\/\/(\S*\.)?(google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)/i.test(s);
async function api(qs){try{const r=await fetch(API+'/api/resolve?'+qs);if(!r.ok)return null;return await r.json()}catch(e){return null}}
async function resolveMapLink(u){const ll=parseLatLng(u),name=nameFromLink(u);if(ll)return{latlng:ll,name};const j=await api('url='+encodeURIComponent(u));return j&&!j.error?j:null}

/* ---------- toast ---------- */
let toastT;
function toast(msg,undo){const t=$('#toast');t.innerHTML=`<span>${esc(msg)}</span>${undo?'<button type="button" id="toastUndo">復原</button>':''}`;t.hidden=false;clearTimeout(toastT);
 if(undo)$('#toastUndo').onclick=async()=>{t.hidden=true;try{await undo();toast('已復原')}catch(e){toast('復原失敗：'+(e.message||e))}};
 toastT=setTimeout(()=>{t.hidden=true},undo?8000:3500)}

/* ---------- 寫入資料庫 ---------- */
function guard(){if(!sb){toast('沒有連到資料庫，無法編輯');return false}if(!online){toast('目前離線，恢復網路後才能編輯');return false}return true}
const strip=r=>{const o={...r};delete o.updated_at;return o};
function applyLocal(table,row,del){const list=raw[table]||(raw[table]=[]);const i=list.findIndex(r=>String(r.id)===String(row.id));if(del){if(i>=0)list.splice(i,1)}else if(i>=0)list[i]={...list[i],...row};else list.push(row);if(table==='days'&&del)raw.items=raw.items.filter(x=>x.day_id!==row.id);cacheRaw();rebuild()}
async function save(table,row){const{data:res,error}=await sb.from(table).upsert(strip(row)).select().single();if(error)throw error;applyLocal(table,res);return res}
async function remove(table,id){const{error}=await sb.from(table).delete().eq('id',id);if(error)throw error;applyLocal(table,{id},true)}
async function run(fn,ok){if(!guard())return;try{const r=await fn();if(ok)ok(r)}catch(e){console.error(e);toast('儲存失敗：'+(e.message||e));refresh(0)}}

function nextPos(list){return list.length?Math.max(...list.map(r=>r.position))+10:0}
async function moveItem(id,dir){const x=findItem(id);if(!x)return;const its=x.day.items,i=its.indexOf(x),j=i+dir;if(j<0||j>=its.length)return;const y=its[j];
 run(async()=>{const a=x.row.position,b=y.row.position===a?a+dir:y.row.position;await save('items',{...x.row,position:b});await save('items',{...y.row,position:a})})}
function moveItemTo(x,ll){const before={...x.row};run(()=>save('items',{...x.row,lat:ll[0],lng:ll[1],map_url:x.row.map_url&&parseLatLng(x.row.map_url)?mapsQ(ll):x.row.map_url}),()=>toast(`已移動「${x.ttl}」的位置`,()=>save('items',before)))}
function delItem(id){const x=findItem(id);if(!x)return;if(!confirm(`刪除「${x.ttl}」？\n刪除後可按「復原」，或到行前資料的修改紀錄還原。`))return;const before={...x.row};run(()=>remove('items',id),()=>toast(`已刪除「${x.ttl}」`,()=>save('items',before)))}
function delRow(table,id,label){const row=raw[table].find(r=>String(r.id)===String(id));if(!row)return;if(!confirm(`刪除「${label}」？\n刪除後可按「復原」，或到修改紀錄還原。`))return;const before={...row};run(()=>remove(table,id),()=>toast(`已刪除「${label}」`,()=>save(table,before)))}
async function delDay(d){if(!confirm(`刪除 DAY ${pad(d.idx)}「${d.title}」以及這天的 ${d.items.length} 個項目？\n可到行前資料的修改紀錄逐筆還原。`))return;const keepItems=d.items.map(x=>({...x.row})),before={...d.row};
 run(()=>remove('days',d.id),()=>{location.hash=d.idx>1?'#d'+(d.idx-1):'#prep';toast(`已刪除 DAY ${pad(d.idx)}`,async()=>{await save('days',before);for(const r of keepItems)await save('items',r)})})}

/* ---------- 編輯表單 ---------- */
let edState=null;
function field(f,v){const id='f_'+f.k,hint=f.hint?`<small class="fh">${f.hint}</small>`:'';
 if(f.type==='area')return `<label class="fl" for="${id}"><span>${f.label}</span>${hint}<textarea id="${id}" name="${f.k}" rows="${f.rows||3}" placeholder="${esc(f.ph||'')}">${esc(v)}</textarea></label>`;
 if(f.type==='select')return `<label class="fl" for="${id}"><span>${f.label}</span>${hint}<select id="${id}" name="${f.k}">${f.options.map(([val,t])=>`<option value="${esc(val)}" ${String(val)===String(v)?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
 if(f.type==='loc')return `<div class="fl"><label for="${id}"><span>${f.label}</span></label>${hint}<div class="locrow"><input id="${id}" name="${f.k}" value="${esc(v)}" placeholder="例：-8.5069, 115.2625" inputmode="decimal" autocomplete="off"><button type="button" class="ebtn" data-pick-map>在地圖上點選</button><button type="button" class="ebtn ic" data-clear-loc aria-label="清除位置">✕</button></div><small class="fh" id="locMsg"></small></div>`;
 return `<label class="fl" for="${id}"><span>${f.label}</span>${hint}<input id="${id}" name="${f.k}" value="${esc(v)}" placeholder="${esc(f.ph||'')}" autocomplete="off" ${f.type==='url'?'inputmode="url"':''} ${f.type==='date'?'type="date"':''}></label>`}
const dayOpts=()=>data.days.map(d=>[d.id,`DAY ${pad(d.idx)} · ${plain(d.date)} · ${plain(d.title)}`]);
const LINKHINT='每行一段。連結可寫成 [顯示文字](https://網址)，或直接貼網址。';
const FORMS={
 item:{title:r=>r.id?'編輯景點':'新增景點',fields:[
  {k:'day_id',label:'日期',type:'select',options:dayOpts},
  {k:'time',label:'時間',ph:'例：19:00 或 約 19:00–20:00'},
  {k:'title',label:'名稱',ph:'例：Indus Restaurant'},
  {k:'type',label:'類型',ph:'例：晚餐、行程、交通、按摩'},
  {k:'note',label:'簡短說明',type:'area',rows:2,hint:'顯示在標題下方的一句話'},
  {k:'loc',label:'地點（地圖標記）',type:'loc',hint:'貼 Google 地圖連結到下一欄會自動帶入；沒有座標的項目不會出現在地圖上'},
  {k:'map_url',label:'Google 地圖連結',type:'url',ph:'https://maps.app.goo.gl/…'},
  {k:'point_name',label:'地圖上的名稱',ph:'留空則用標題'},
  {k:'reserve',label:'預訂狀態',ph:'例：需訂位、建議提前、已訂'},
  {k:'book_url',label:'預訂連結',type:'url',ph:'https://…'},
  {k:'travel_mode',label:'怎麼到這裡（從前一站出發）',type:'select',options:[['car','開車（地圖沿道路畫線）'],['boat','搭船（地圖畫虛線）'],['plane','搭飛機（地圖畫點線）']]},
  {k:'food',label:'吃什麼／必點',type:'area',hint:LINKHINT},
  {k:'booking',label:'預訂方式',type:'area',hint:LINKHINT},
  {k:'extra',label:'當天注意事項',type:'area',hint:LINKHINT},
  {k:'rain',label:'雨天／延誤怎麼換',type:'area',hint:LINKHINT}],
  toForm:r=>({...r,travel_mode:r.travel_mode||'car',time:plain(r.time),title:plain(r.title),type:plain(r.type),note:toEditText(r.note),point_name:plain(r.point_name),reserve:plain(r.reserve),loc:r.lat!=null?`${r.lat}, ${r.lng}`:'',food:linesOut(r.food),booking:linesOut(r.booking),extra:linesOut(r.extra),rain:linesOut(r.rain)}),
  fromForm:(f,r)=>{const ll=parseLatLng(f.loc);return{...r,travel_mode:['car','boat','plane'].includes(f.travel_mode)?f.travel_mode:'car',day_id:+f.day_id,time:plainIn(f.time),title:plainIn(f.title),type:plainIn(f.type),note:fromEditText(f.note),map_url:f.map_url.trim(),point_name:plainIn(f.point_name),reserve:plainIn(f.reserve),book_url:f.book_url.trim(),lat:ll?ll[0]:null,lng:ll?ll[1]:null,food:linesIn(f.food),booking:linesIn(f.booking),extra:linesIn(f.extra),rain:linesIn(f.rain)}},
  check:f=>f.title.trim()?'':'請填名稱，或先貼上 Google 地圖連結'},
 day:{title:r=>r.id?'編輯這天':'新增一天',fields:[
  {k:'date',label:'日期',ph:'例：12/26 六'},{k:'title',label:'標題',ph:'例：抵達 Payangan'},{k:'area',label:'區域',ph:'例：Payangan / Ubud'},
  {k:'note',label:'當天摘要',type:'area',rows:2},{k:'breakfast',label:'早餐',ph:'例：民宿加購'},{k:'map_note',label:'地圖備註',type:'area',rows:2}],
  toForm:r=>({...r}),fromForm:(f,r)=>({...r,date:f.date.trim(),title:f.title.trim(),area:f.area.trim(),note:f.note.trim(),breakfast:f.breakfast.trim(),map_note:f.map_note.trim()}),check:f=>f.title.trim()?'':'請填標題'},
 check:{title:r=>r.id?'編輯待辦':'新增待辦',fields:[{k:'title',label:'待辦事項',ph:'例：12/31 Bambu 晚餐'},{k:'detail',label:'說明',type:'area',rows:2}],
  toForm:r=>({...r}),fromForm:(f,r)=>({...r,title:f.title.trim(),detail:f.detail.trim()}),check:f=>f.title.trim()?'':'請填待辦事項'},
 trip:{title:()=>'編輯封面',fields:[
  {k:'title',label:'旅程標題',ph:'例：峇里島跨年'},{k:'subtitle',label:'副標',ph:'一句話介紹這趟旅程'},
  {k:'travelers',label:'同行的人',ph:'例：Ben & Irene'},{k:'destination',label:'目的地（封面小字，建議英文）',ph:'例：Bali, Indonesia'},
  {k:'start_date',label:'出發日期',type:'date',hint:'封面會顯示倒數天數；旅程期間打開網站會直接到當天'},{k:'end_date',label:'回程日期',type:'date'},
  {k:'intro',label:'介紹',type:'area',rows:3,hint:'封面下方的一段話'},
  {k:'cover_pick',label:'封面照片',type:'select',options:()=>coverOpts()},
  {k:'cover_url',label:'或貼上圖片網址',type:'url',ph:'https://…（留空則用上面選的照片）'},
  {k:'cover_caption',label:'照片說明'},
  {k:'cover_focus',label:'照片對齊（主體被裁到時調整）',type:'select',options:()=>focusOpts()},
  {k:'prep_title',label:'行前區塊標題'},{k:'prep_intro',label:'行前區塊說明',type:'area',rows:2}],
  toForm:r=>{const has=coverOpts().some(o=>o[0]===r.cover_image);return{...r,start_date:r.start_date||'',end_date:r.end_date||'',cover_pick:has?r.cover_image:'',cover_url:has?'':r.cover_image}},
  fromForm:(f,r)=>({...r,id:'main',title:f.title.trim(),subtitle:f.subtitle.trim(),travelers:f.travelers.trim(),destination:f.destination.trim(),start_date:f.start_date||null,end_date:f.end_date||null,intro:f.intro.trim(),cover_image:f.cover_url.trim()||f.cover_pick,cover_caption:f.cover_caption.trim(),cover_focus:f.cover_focus||'center',prep_title:f.prep_title.trim(),prep_intro:f.prep_intro.trim()}),
  check:f=>!f.title.trim()?'請填旅程標題':f.start_date&&f.end_date&&f.end_date<f.start_date?'回程日期不能早於出發日期':''},
 note:{title:r=>r.id?'編輯說明區塊':'新增說明區塊',fields:[{k:'title',label:'標題'},{k:'paragraphs',label:'內容',type:'area',rows:10,hint:LINKHINT}],
  toForm:r=>({...r,paragraphs:linesOut(r.paragraphs)}),fromForm:(f,r)=>({...r,title:f.title.trim(),paragraphs:linesIn(f.paragraphs)}),check:f=>f.title.trim()?'':'請填標題'}};
const TBL={item:'items',day:'days',check:'checks',note:'notes',trip:'trip'};
function coverOpts(){const seen=new Set(),o=[['','不使用照片（純色封面）']];data.days.forEach(d=>d.items.forEach(x=>(x.photos||[]).forEach(p=>{if(p.image&&!seen.has(p.image)){seen.add(p.image);o.push([p.image,`D${d.idx} · ${plain(p.title||x.ttl)}`])}})));const cur=(data.trip||{}).cover_image;if(cur&&!seen.has(cur)&&!/^https?:/.test(cur))o.push([cur,'目前的封面照片']);return o}
function focusOpts(){const o=[['center','置中'],['center 30%','偏上'],['center 70%','偏下'],['center top','最上方'],['center bottom','最下方'],['30% center','偏左'],['70% center','偏右']],cur=(data.trip||{}).cover_focus;if(cur&&!o.some(x=>x[0]===cur))o.unshift([cur,`目前：${cur}`]);return o}


/* 景點表單：先貼連結 → 自動帶入名稱與位置；其餘收在「更多細節」 */
const TYPES=['景點','餐廳','咖啡','行程','交通','住宿','按摩','購物'];
const MORE=['travel_mode','note','reserve','book_url','food','booking','extra','rain','point_name'];
function locHtml(loc,msg){const ll=parseLatLng(loc);return ll?`<span class="locok">📍 已設定位置 <small>${ll[0].toFixed(4)}, ${ll[1].toFixed(4)}</small></span><span class="locact"><button type="button" class="linkbtn" data-pick-map>在地圖上調整</button><button type="button" class="linkbtn" data-clear-loc>清除</button></span>${msg?`<small class="fh">${esc(msg)}</small>`:''}`
 :`<span class="locno">還沒有位置，不會出現在地圖上</span><span class="locact"><button type="button" class="linkbtn" data-find-name>用名稱搜尋</button><button type="button" class="linkbtn" data-pick-map>在地圖上點選</button></span>${msg?`<small class="fh">${esc(msg)}</small>`:''}`}
function itemFormHtml(v,isNew){const F=FORMS.item.fields,f=k=>F.find(x=>x.k===k);
 const types=[...TYPES];if(v.type&&!types.includes(v.type))types.unshift(v.type);
 const filled=MORE.filter(k=>String(v[k]||'').trim()).length;
 return `<label class="fl linkfl" for="f_map_url"><span>Google 地圖連結</span><small class="fh">在 Google 地圖按「分享」→「複製連結」，貼上後名稱和位置會自動帶入</small><input id="f_map_url" name="map_url" value="${esc(v.map_url||'')}" placeholder="貼上 https://maps.app.goo.gl/…" inputmode="url" autocomplete="off"></label>
<div class="locbox" id="locBox">${locHtml(v.loc)}</div><input type="hidden" id="f_loc" name="loc" value="${esc(v.loc||'')}">
${field(f('title'),v.title||'')}
<label class="fl" for="f_time"><span>時間</span><input id="f_time" name="time" value="${esc(v.time||'')}" placeholder="例：19:00 或 約 19:00–20:00" autocomplete="off"></label>
<fieldset class="fl chipset"><legend>類型</legend><div class="chipsel">${types.map(t=>`<label class="tchip"><input type="radio" name="type" value="${esc(t)}" ${t===v.type?'checked':''}><span>${esc(t)}</span></label>`).join('')}</div></fieldset>
<details class="more"><summary>更多細節${filled?`（已填 ${filled} 項）`:''}<small>說明、預訂、餐點、雨備、日期</small></summary><div class="moreb">
${field({...f('day_id'),options:dayOpts()},v.day_id)}${MORE.map(k=>field(f(k),v[k]??'')).join('')}</div></details>`}
function openEditor(kind,row,keep){if(!guard())return;const F=FORMS[kind];edState={kind,row:{...row}};const v=keep||F.toForm(row);
 $('#edT').textContent=F.title(row);
 $('#edF').innerHTML=kind==='item'?itemFormHtml(v,!row.id):F.fields.map(f=>field(f.type==='select'?{...f,options:typeof f.options==='function'?f.options():f.options}:f,v[f.k]??'')).join('');
 $('#edErr').textContent='';$('#edDel').hidden=!row.id||kind!=='day';$('#edDel').textContent='刪除這天';
 const dlg=$('#ed');if(!dlg.open)dlg.showModal();
 if(!keep){const first=kind==='item'?(row.id?$('#f_title'):$('#f_map_url')):$('#edF input,#edF textarea');if(first)first.focus()}}
function formVals(){const o={};new FormData($('#ed form')).forEach((v,k)=>o[k]=String(v));return o}
function setLoc(ll,msg){const i=$('#f_loc');if(!i)return;i.value=ll?`${ll[0]}, ${ll[1]}`:'';$('#locBox').innerHTML=locHtml(i.value,msg)}
let linkSeq=0;
async function onMapLink(u){const seq=++linkSeq,t=$('#f_title');u=u.trim();if(!u)return;
 if(!isMapLink(u)){$('#locBox').innerHTML=locHtml($('#f_loc').value,'這不像 Google 地圖連結，也可以直接填名稱再「用名稱搜尋」');return}
 $('#locBox').innerHTML='<span class="locno">讀取連結中…</span>';
 const j=await resolveMapLink(u);if(seq!==linkSeq)return;
 if(j&&j.name&&t&&(!t.value.trim()||t.dataset.auto==='1')){t.value=j.name;t.dataset.auto='1'}
 if(j&&j.latlng)setLoc(j.latlng,j.approx?'位置是依名稱搜尋的結果，請在地圖上確認':(j.name?`已帶入「${j.name}」的位置`:'已帶入位置'));
 else setLoc(parseLatLng($('#f_loc').value),'這個連結讀不到位置，可以「用名稱搜尋」或「在地圖上點選」')}
let linkT;
$('#edF').addEventListener('input',e=>{if(e.target.id==='f_title')e.target.dataset.auto='';if(e.target.name!=='map_url')return;clearTimeout(linkT);const u=e.target.value;linkT=setTimeout(()=>onMapLink(u),e.inputType==='insertFromPaste'?0:500)});
$('#edF').addEventListener('click',async e=>{
 if(e.target.closest('[data-clear-loc]'))setLoc(null,'已清除位置');
 if(e.target.closest('[data-find-name]')){const q=($('#f_title').value||'').trim();if(!q){$('#locBox').innerHTML=locHtml('','請先填名稱');$('#f_title').focus();return}
  $('#locBox').innerHTML='<span class="locno">搜尋中…</span>';const j=await api('q='+encodeURIComponent(q));
  if(j&&j.latlng)setLoc(j.latlng,`找到：${j.label||q}${j.nearby===false?'（離行程其他地點很遠，請確認）':''}，可在地圖上調整`);else setLoc(null,`找不到「${q}」，請改貼 Google 地圖連結或在地圖上點選`)}
 if(e.target.closest('[data-pick-map]')){const keep=formVals(),st=edState,open=$('#edF details.more')?.open;$('#ed').close();startPick(ll=>{edState=st;keep.loc=`${ll[0]}, ${ll[1]}`;openEditor(st.kind,st.row,keep);if(open)$('#edF details.more').open=true;setLoc(ll,'已選好位置')},()=>{edState=st;openEditor(st.kind,st.row,keep)})}});
// 依時間決定新項目的位置
const minutes=s=>{const m=plain(s).match(/(\d{1,2}):(\d{2})/);return m?+m[1]*60+ +m[2]:null};
function posForTime(dayId,time,selfId){const d=data.days.find(d=>d.id===dayId);const its=d?d.items.filter(x=>x.id!==selfId):[];const rows=its.map(x=>x.row);const tv=minutes(time);
 if(tv==null||!its.length)return nextPos(rows);const i=its.findIndex(x=>{const v=minutes(x.time);return v!=null&&v>tv});if(i<0)return nextPos(rows);
 const after=its[i].row.position,before=i>0?its[i-1].row.position:after-20;return(before+after)/2}
$('#edSave').onclick=async e=>{e.preventDefault();if(!edState)return;const F=FORMS[edState.kind],f=formVals(),err=F.check(f);if(err){$('#edErr').textContent=err;return}
 const row=F.fromForm(f,edState.row),kind=edState.kind,isNew=!row.id;if(isNew){delete row.id}
 if(kind==='item'){const o=edState.row;if(isNew||o.day_id!==row.day_id||minutes(o.time)!==minutes(row.time))row.position=posForTime(row.day_id,row.time,o.id);if(!row.map_url&&row.lat!=null)row.map_url=''}
 $('#edSave').disabled=true;
 try{if(!guard())return;const res=await save(TBL[kind],row);$('#ed').close();edState=null;
  if(kind==='item'){const it=findItem(res.id);if(it){if(it.day.idx!==S.day)location.hash='d'+it.day.idx;setTimeout(()=>select(res.id,{open:true,scroll:true,pan:true}),80)}}
  if(kind==='day'&&isNew){const d=data.days.find(d=>d.id===res.id);if(d)location.hash='d'+d.idx}
  toast(isNew?'已新增':'已儲存')}
 catch(err){$('#edErr').textContent='儲存失敗：'+(err.message||err)}finally{$('#edSave').disabled=false}};
$('#edCancel').onclick=e=>{e.preventDefault();$('#ed').close();edState=null};
$('#edDel').onclick=e=>{e.preventDefault();if(!edState||edState.kind!=='day')return;const d=data.days.find(d=>d.id===edState.row.id);$('#ed').close();edState=null;if(d)delDay(d)};

/* ---------- 在地圖上選位置 ---------- */
function startPick(cb,cancel){S.picking=cb;S.pickCancel=cancel;$('#pickbar').hidden=false;document.documentElement.classList.add('picking');if(layout!=='desk')goSnap('peek');else if(!S.panel){}}
function endPick(){S.picking=null;S.pickCancel=null;$('#pickbar').hidden=true;document.documentElement.classList.remove('picking')}
$('#pickX').onclick=()=>{const c=S.pickCancel;endPick();if(c)c()};

/* ---------- 修改紀錄 ---------- */
const OPN={INSERT:'新增',UPDATE:'修改',DELETE:'刪除'},TBN={days:'日程',items:'項目',checks:'待辦',notes:'說明',trip:'封面與主題'};
let histRows=[];
async function loadHistory(){const box=$('#histList');if(!box)return;if(!sb){box.innerHTML='<p class="simple">沒有連到資料庫。</p>';return}
 const{data:rows,error}=await sb.from('history').select('*').order('at',{ascending:false}).limit(60);
 if(error){box.innerHTML='<p class="simple">讀取失敗，請稍後再試。</p>';return}histRows=rows;
 box.innerHTML=rows.length?`<ul class="hist">${rows.map((h,i)=>{const r=h.new||h.old||{};const name=plain(r.title||r.id);return `<li><span class="hm"><b>${OPN[h.op]||h.op}${TBN[h.tbl]||h.tbl}</b>${esc(name)}<small>${fmtTime(h.at)}${h.op==='UPDATE'?' · '+esc(diffText(h)):''}</small></span><button type="button" class="ebtn" data-restore="${i}">${h.op==='INSERT'?'撤銷新增':'還原成修改前'}</button></li>`}).join('')}</ul>`:'<p class="simple">還沒有任何修改。</p>'}
const FN={time:'時間',title:'標題',type:'類型',note:'說明',reserve:'預訂狀態',book_url:'預訂連結',map_url:'地圖連結',food:'餐點',booking:'預訂方式',extra:'注意事項',rain:'雨備',lat:'位置',lng:'位置',position:'順序',day_id:'日期',done:'勾選',detail:'說明',paragraphs:'內容',date:'日期',area:'區域',breakfast:'早餐',map_note:'地圖備註',point_name:'地圖名稱',photos:'照片',subtitle:'副標',travelers:'同行',destination:'目的地',start_date:'出發日',end_date:'回程日',intro:'介紹',cover_image:'封面照片',cover_caption:'照片說明',cover_focus:'照片對齊',prep_title:'行前標題',prep_intro:'行前說明',theme:'主題',travel_mode:'交通方式'};
function diffText(h){const o=h.old||{},n=h.new||{};const ks=[...new Set(Object.keys(n).filter(k=>k!=='updated_at'&&JSON.stringify(o[k])!==JSON.stringify(n[k])).map(k=>FN[k]||k))];return ks.join('、')||'—'}
async function restore(h){const t=h.tbl;
 if(h.op==='INSERT'){const{error}=await sb.from(t).delete().eq('id',h.new.id);if(error)throw error}
 else{const{error}=await sb.from(t).upsert(strip(h.old));if(error)throw error}
 raw=await fetchRemote();cacheRaw();rebuild()}
document.addEventListener('toggle',e=>{if(e.target.id==='hist'&&e.target.open)loadHistory()},true);

/* ---------- events ---------- */
document.addEventListener('click',e=>{
 const t=e.target.closest('[data-pick],[data-step],[data-photo],[data-showmap],[data-rain],[data-all],[data-go],[data-edit],[data-move],[data-del],[data-add],[data-editday],[data-editcheck],[data-delcheck],[data-addcheck],[data-editnote],[data-delnote],[data-addnote],[data-addday],[data-restore],[data-copyai],[data-share],[data-dup],[data-copy],[data-aitab],[data-ptab],[data-edittrip],[data-scrollto]');
 if(!e.target.closest('.search,.msearch,#msBtn'))$$('.results').forEach(r=>r.classList.remove('show'));
 if(!e.target.closest('.dpick'))setDayMenu(false);else if(e.target.closest('#dmenu a'))setDayMenu(false);
 if(!t)return;const ds=t.dataset;
 if(ds.copyai!==undefined){copyAI();return}
 if(ds.share!==undefined){shareSite();return}
 if(ds.dup!==undefined){goDup();return}
 if(ds.copy){copyText(ds.copy,ds.copymsg||'已複製網址');return}
 if(ds.aitab){S.aiTab=ds.aitab;renderPanel();return}
 if(ds.ptab){S.ptab=ds.ptab;lsSet('bali-ptab',ds.ptab);renderPanel();const b=document.getElementById('pt-'+ds.ptab);if(b)b.focus({preventScroll:true});return}
 if(ds.scrollto){scrollInList(document.getElementById(ds.scrollto),'start');return}
 if(ds.edittrip!==undefined){openEditor('trip',data.trip||DEFAULT_TRIP);return}
 if(ds.pick)select(ds.pick,{toggle:true,pan:true});
 else if(ds.step)step(+ds.step);
 else if(ds.photo){const[id,i]=ds.photo.split('|');lightbox(id,+i)}
 else if(ds.showmap){select(ds.showmap,{pan:false});goSnap('peek');setTimeout(()=>focusMap(true),280)}
 else if(ds.rain!==undefined)rain();
 else if(ds.all!==undefined){S.all=!S.all;S.open=new Set();renderPanel()}
 else if(ds.go){const x=findItem(ds.go);closeSearch();if(!x)return;if(x.day.idx===S.day){select(ds.go,{open:true,scroll:true});if(layout!=='desk'&&S.snap==='peek')goSnap('half')}else location.hash=ds.go}
 else if(ds.edit){const x=findItem(ds.edit);if(x)openEditor('item',x.row)}
 else if(ds.move){const[id,k]=ds.move.split('|');moveItem(id,+k)}
 else if(ds.del)delItem(ds.del);
 else if(ds.add){const d=data.days.find(d=>String(d.id)===ds.add);if(d)openEditor('item',{day_id:d.id,position:nextPos(d.items.map(x=>x.row)),time:'',title:'',type:'',note:'',reserve:'',book_url:'',map_url:'',food:[],booking:[],extra:[],rain:[],photos:[],lat:null,lng:null,point_name:'',coord_key:''})}
 else if(ds.editday){const d=data.days.find(d=>String(d.id)===ds.editday);if(d){openEditor('day',d.row);$('#edDel').hidden=false}}
 else if(ds.addday!==undefined)openEditor('day',{position:nextPos(raw.days),date:'',title:'',area:'',note:'',breakfast:'',map_note:''});
 else if(ds.editcheck){const r=raw.checks.find(r=>r.id===ds.editcheck);if(r)openEditor('check',r)}
 else if(ds.delcheck){const r=raw.checks.find(r=>r.id===ds.delcheck);if(r)delRow('checks',r.id,r.title)}
 else if(ds.addcheck!==undefined)openEditor('check',{position:nextPos(raw.checks),title:ds.addcheck?ds.addcheck+' ':'',detail:'',done:false});
 else if(ds.editnote){const r=raw.notes.find(r=>r.id===ds.editnote);if(r)openEditor('note',r)}
 else if(ds.delnote){const r=raw.notes.find(r=>r.id===ds.delnote);if(r)delRow('notes',r.id,r.title)}
 else if(ds.addnote!==undefined)openEditor('note',{position:nextPos(raw.notes),title:'',paragraphs:[]});
 else if(ds.restore){const h=histRows[+ds.restore];if(h&&guard()){t.disabled=true;restore(h).then(()=>{toast('已還原');loadHistory()}).catch(err=>{t.disabled=false;toast('還原失敗：'+(err.message||err))})}}});
document.addEventListener('change',e=>{const c=e.target.closest('[data-check]');if(!c)return;const r=raw.checks.find(r=>r.id===c.dataset.check);if(!r)return;if(!guard()){c.checked=!c.checked;return}run(()=>save('checks',{...r,done:c.checked}))});
document.addEventListener('keydown',e=>{
 const tb=e.target.closest&&e.target.closest('.ptabs [role=tab]');if(tb&&(e.key==='ArrowRight'||e.key==='ArrowLeft')){e.preventDefault();const all=[...document.querySelectorAll('.ptabs [role=tab]')],i=all.indexOf(tb),n=all[(i+(e.key==='ArrowRight'?1:all.length-1))%all.length];n.click();return}
 const menu=$('#dmenu'),open=menu&&!menu.hidden;
 if(e.key==='Escape'&&S.picking){$('#pickX').click();return}
 if(e.key==='Escape'&&!$('#lb').open&&!$('#ed').open){const sOpen=S.search||document.querySelector('.results.show')!==null||!!$('#q').value||!!$('#mq').value;closeSearch();if(open){setDayMenu(false);$('#mlabel').focus()}else if(!sOpen&&!e.target.closest('input,textarea,select'))deselect()}
 if(e.key!=='ArrowDown'&&e.key!=='ArrowUp'&&e.key!=='Home'&&e.key!=='End')return;
 if(!open){if((e.key==='ArrowDown'||e.key==='ArrowUp')&&document.activeElement===$('#mlabel')){e.preventDefault();setDayMenu(true);const cur=$('#dmenu a[aria-current=page]')||$('#dmenu a');if(cur)cur.focus()}return}
 const items=[...menu.querySelectorAll('a')];if(!items.length)return;e.preventDefault();
 let i=items.indexOf(document.activeElement);
 if(e.key==='Home')i=0;else if(e.key==='End')i=items.length-1;else if(i<0)i=Math.max(0,items.findIndex(a=>a.getAttribute('aria-current')==='page'));else if(e.key==='ArrowDown')i=(i+1)%items.length;else i=i===0?items.length-1:i-1;
 items[i].focus()});
$('#rainMap').onclick=rain;$('#rainM').onclick=rain;
$('#fit').onclick=()=>S.day?fitDay():fitAll();
$('#zin').onclick=()=>map&&map.zoomIn();$('#zout').onclick=()=>map&&map.zoomOut();
$('#togglePanel').onclick=()=>{S.panel=!S.panel;renderChrome();if(map)setTimeout(()=>{map.invalidateSize();fitDay()},30)};
$('#mlabel').onclick=()=>setDayMenu($('#dmenu').hidden);
$('#mprev').onclick=()=>{setDayMenu(false);if(S.day===0)return;location.hash=S.day===1?'prep':'d'+(S.day-1)};$('#mnext').onclick=()=>{setDayMenu(false);if(S.day===N())return;location.hash='d'+(S.day+1)};
$('#mapbtn').onclick=()=>goSnap('peek');
function toggleEdit(){if(!S.edit&&!guard())return;S.edit=!S.edit;lsSet('bali-edit',S.edit?'1':'0');renderChrome();renderPanel();drawMap();toast(S.edit?'編輯模式：每個項目下方可編輯、排序、刪除；地圖標記可拖動':'已離開編輯模式')}
$('#editT').onclick=toggleEdit;$('#editM').onclick=toggleEdit;
// 相簿：當天所有照片，從點的那張開始；手機左右滑、電腦方向鍵或箭頭切換
const LB={list:[],i:0};
function lightbox(id,i){const x=findItem(id);if(!x)return;const list=x.day.items.flatMap(it=>(it.photos||[]).map((p,k)=>({p,it,k})));if(!list.length)return;
 LB.list=list;LB.i=Math.max(0,list.findIndex(o=>o.it.id===id&&o.k===i));
 $('#lbStage').innerHTML=list.map((o,j)=>`<div class="lbslide" role="group" aria-label="${j+1} / ${list.length}"><img src="${esc(o.p.image)}" alt="${esc(o.p.title||o.it.ttl)}" ${Math.abs(j-LB.i)>1?'loading="lazy"':''} decoding="async" draggable="false"></div>`).join('');
 const dlg=$('#lb');if(!dlg.open)dlg.showModal();const st=$('#lbStage');st.scrollLeft=LB.i*st.clientWidth;lbCap();st.focus({preventScroll:true})}
function lbCap(){const o=LB.list[LB.i];if(!o)return;const p=o.p,t=p.title||o.it.ttl;$('#lbN').textContent=`${LB.i+1} / ${LB.list.length}`;$('#lbI').textContent=t===o.it.ttl?`DAY ${pad(o.it.day.idx)}`:`DAY ${pad(o.it.day.idx)} · ${o.it.ttl}`;$('#lbT').textContent=t;$('#lbC').textContent=(p.caption||'')+(p.credit?(p.caption?' · ':'')+p.credit:'');$('#lbS').hidden=!p.source;$('#lbS').href=p.source||'#';$('#lbPrev').disabled=LB.i===0;$('#lbNext').disabled=LB.i===LB.list.length-1}
function lbGo(k){const st=$('#lbStage'),j=Math.max(0,Math.min(LB.list.length-1,LB.i+k));if(j===LB.i)return;st.scrollTo({left:j*st.clientWidth,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'})}
$('#lbStage').addEventListener('scroll',()=>{const st=$('#lbStage'),j=Math.round(st.scrollLeft/Math.max(1,st.clientWidth));if(j!==LB.i&&LB.list[j]){LB.i=j;lbCap()}},{passive:true});
$('#lbPrev').onclick=()=>lbGo(-1);$('#lbNext').onclick=()=>lbGo(1);
$('#lb').addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();lbGo(-1)}else if(e.key==='ArrowRight'){e.preventDefault();lbGo(1)}else if(e.key==='Home'){e.preventDefault();lbGo(-LB.i)}else if(e.key==='End'){e.preventDefault();lbGo(LB.list.length)}});
addEventListener('resize',()=>{if($('#lb').open){const st=$('#lbStage');st.scrollLeft=LB.i*st.clientWidth}});
$('#lbX').onclick=()=>$('#lb').close();$('#lb').onclick=e=>{if(e.target===$('#lb')||e.target.classList.contains('lbslide'))$('#lb').close()};
// iOS PWA（透明狀態列）回報的視窗高度會少一個狀態列高，底部因此空出一塊；改用實際螢幕高度
function fitApp(){const r=document.documentElement;if(!(navigator.standalone||matchMedia('(display-mode: standalone)').matches)){r.style.removeProperty('--apph');return}const el=document.getElementById('sat')||document.body.appendChild(Object.assign(document.createElement('div'),{id:'sat'}));el.style.cssText='position:fixed;visibility:hidden;pointer-events:none;padding-top:var(--sat)';const top=parseFloat(getComputedStyle(el).paddingTop)||0,ih=innerHeight,sh=innerWidth>ih?Math.min(screen.width,screen.height):Math.max(screen.width,screen.height);if(sh>ih&&sh-ih<=top+4)r.style.setProperty('--apph',sh+'px');else r.style.removeProperty('--apph')}
function relayout(){fitApp();const nl=L_(),changed=nl!==layout;layout=nl;document.documentElement.classList.toggle('touch',layout!=='desk');document.documentElement.classList.toggle('tab',layout==='tab');document.documentElement.classList.toggle('phone',layout==='phone');if(changed&&S._init){S.snap=defSnap();renderChrome();renderPanel()}applySnap(false);if(map){const before=map.getSize();map.invalidateSize(false);const after=map.getSize();if(changed||before.x!==after.x||before.y!==after.y)S.day?fitDay():fitAll()}}
let rt;const onResize=()=>{clearTimeout(rt);rt=setTimeout(relayout,120)};addEventListener('resize',onResize);if(window.visualViewport)visualViewport.addEventListener('resize',onResize);
addEventListener('hashchange',route);
addEventListener('online',()=>{online=true;refresh(0)});
addEventListener('offline',()=>{online=false;if(S.edit){S.edit=false;renderChrome();renderPanel();drawMap()}updateStatus()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine)refresh(0)});

/* ---------- offline / PWA ---------- */
const TILE_CACHE='tiles-v1';
function tileUrls(){
 const set=new Set(),T=(la,lo,z)=>{const n=2**z;return[Math.floor((lo+180)/360*n),Math.floor((1-Math.asinh(Math.tan(la*Math.PI/180))/Math.PI)/2*n)]};
 const urls=[...tileSet.base,...(tileSet.labels?[tileSet.labels]:[])];
 const add=(z,x,y)=>{const n=2**z;if(z>tileSet.max||x<0||y<0||x>=n||y>=n)return;urls.forEach(u=>set.add(u.replace('{z}',z).replace('{x}',x).replace('{y}',y)))};
 const box=(pts,z,pad)=>{const a=pts.map(p=>T(p[0],p[1],z)),x0=Math.min(...a.map(t=>t[0])),x1=Math.max(...a.map(t=>t[0])),y0=Math.min(...a.map(t=>t[1])),y1=Math.max(...a.map(t=>t[1]));for(let x=x0-pad;x<=x1+pad;x++)for(let y=y0-pad;y<=y1+pad;y++)add(z,x,y)};
 const around=(pts,z,r)=>pts.forEach(p=>{const[x,y]=T(p[0],p[1],z);for(let i=-r;i<=r;i++)for(let j=-r;j<=r;j++)add(z,x+i,y+j)});
 const all=[];
 data.days.forEach(d=>{const pts=d.pins.map(x=>x.pt.latlng),rt=routeCoords(d.routeGeometry),both=pts.concat(rt);all.push(...both);
  if(!both.length)return;
  for(let z=13;z<=14;z++)box(both,z,1);
  around(rt.filter((_,i)=>i%8===0),15,0);around(pts,15,1);around(pts,16,1)});
 if(all.length)for(let z=8;z<=12;z++)box(all,z,1);
 return[...set]}
function initOffline(){
 if(!/^https?:$/.test(location.protocol))return;
 if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
 if(!map||!window.caches||!window.L)return;
 let busy=false;
 const C=L.control({position:'bottomleft'});
 C.onAdd=()=>{const b=L.DomUtil.create('button','offbtn'),w=L.DomUtil.create('div','offctl');b.type='button';w.appendChild(b);L.DomEvent.disableClickPropagation(w);
  const set=(t,st)=>{b.textContent=t;b.dataset.s=st||'';b.disabled=st==='busy'};
  const check=()=>caches.open(TILE_CACHE).then(c=>c.keys()).then(k=>{const have=new Set(k.map(r=>r.url)),urls=tileUrls();if(!busy)set(urls.filter(u=>have.has(u)).length>=urls.length*.98?'✓ 離線地圖已就緒':'☁ 下載離線地圖',urls.filter(u=>have.has(u)).length>=urls.length*.98?'done':'')}).catch(()=>{});
  set('☁ 下載離線地圖','');check();w._check=check;
  b.onclick=async()=>{if(busy)return;busy=true;set('下載中 0%','busy');
   try{const urls=tileUrls(),N2=urls.length,c=await caches.open(TILE_CACHE),have=new Set((await c.keys()).map(r=>r.url));let done=0,fail=0,i=0;
    const todo=urls.filter(u=>!have.has(u));done=N2-todo.length;
    const worker=async()=>{while(i<todo.length){const u=todo[i++];try{const r=await fetch(u,{mode:'no-cors'});await c.put(u,r)}catch(e){fail++}done++;set('下載中 '+Math.round(done/N2*100)+'%','busy')}};
    await Promise.all(Array.from({length:6},worker));
    if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});
    busy=false;if(fail>N2*.02)set('部分失敗，點擊重試','');else set('✓ 離線地圖已就緒','done')
   }catch(e){busy=false;set('下載失敗，點擊重試','')}};
  return w};
 C.addTo(map)}

/* ---------- 禁用頁面縮放（iOS Safari 會忽略 viewport 設定，需攔截手勢；地圖用 touch 事件，不受影響） ---------- */
['gesturestart','gesturechange','gestureend'].forEach(t=>document.addEventListener(t,e=>e.preventDefault(),{passive:false}));

/* ---------- 啟動 ---------- */
function startRealtime(){if(!sb)return;const ch=sb.channel('trip');TABLES.forEach(t=>ch.on('postgres_changes',{event:'*',schema:'public',table:t},()=>refresh(300)));ch.subscribe()}
function migrateLocalChecks(){const old=lsGet('bali-prep-v1');if(!old||lsGet('bali-prep-migrated'))return;let saved={};try{saved=JSON.parse(old)}catch(e){}
 const todo=raw.checks.filter(c=>saved[c.id]&&!c.done);lsSet('bali-prep-migrated','1');if(todo.length&&sb)Promise.all(todo.map(c=>sb.from('checks').update({done:true}).eq('id',c.id))).then(()=>refresh(0)).catch(()=>{})}
async function boot(){
 try{const c=lsGet(CACHE_KEY);if(c)raw=JSON.parse(c)}catch(e){}
 if(!raw){try{raw=await (await fetch('seed.json')).json()}catch(e){raw={days:[],items:[],checks:[],notes:[]}}}
 raw.trip=raw.trip||[];build(raw);relayout();initMap();route();initOffline();
 if(sb&&navigator.onLine){try{raw=await fetchRemote();cacheRaw();synced=new Date();online=true;rebuild();reroute();migrateLocalChecks()}catch(e){online=false;updateStatus()}startRealtime()}
 else{online=false;if(S.edit){S.edit=false;renderChrome();renderPanel()}updateStatus()}}
boot();

/* ---------- WebMCP：瀏覽器內的 AI 助理可直接呼叫（實驗性標準，不支援時略過） ---------- */
(async()=>{const mc=document.modelContext||navigator.modelContext;if(!mc||!mc.registerTool)return;
 try{const rpc=async(method,params)=>(await (await fetch(API+'/api/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})})).json()).result;
  const{tools}=await rpc('tools/list');
  tools.forEach(t=>{try{mc.registerTool({name:t.name,description:t.description,inputSchema:t.inputSchema,annotations:t.annotations,execute:async args=>{const r=await rpc('tools/call',{name:t.name,arguments:args||{}});refresh(0);return r}})}catch(e){}})}catch(e){}})();
(function(){const n=$('#days');if(!n)return;
 n.addEventListener('scroll',()=>dayOverflow(false),{passive:true});
 n.addEventListener('wheel',e=>{if(Math.abs(e.deltaY)>Math.abs(e.deltaX)){e.preventDefault();n.scrollBy({left:e.deltaY,behavior:'auto'})}},{passive:false});
 $('#dscrL').onclick=()=>n.scrollBy({left:-n.clientWidth*.7,behavior:'smooth'});
 $('#dscrR').onclick=()=>n.scrollBy({left:n.clientWidth*.7,behavior:'smooth'});
 addEventListener('resize',()=>dayOverflow(true));
 if(window.ResizeObserver)new ResizeObserver(()=>dayOverflow(false)).observe(n)})();
