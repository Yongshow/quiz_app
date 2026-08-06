"use strict";
let BANK=[];let META={total:0,choice:0,judge:0};
const $=id=>document.getElementById(id);
async function loadData(){
  try{
    const r=await fetch('data/questions.json',{cache:'no-store'});
    const data=await r.json();
    BANK=data.items||[];META=data.meta||{};
    $('loading').style.display='none';
    $('app').style.display='flex';
    tryImportFromHash(); // 若带 #sync= 迁移链接则自动导入
    goHome();
  }catch(e){
    $('loading').innerHTML='题库加载失败：请确认 data/questions.json 存在。<br><button class="btn" style="margin-top:10px" onclick="location.reload()">重试</button>';
  }
}
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function typeClass(t){return t==='单选'?'sel':'jud';}
function pill(t){return '<span class="qtype '+typeClass(t)+'">'+esc(t)+'</span>';}
function filterByType(t){if(t==='全部')return BANK;return BANK.filter(q=>q.type===t);}
function setFoot(a){['f1','f2','f3','f4'].forEach(f=>$(f).classList.toggle('on',f==='f'+a));}
function render(html){$('main').innerHTML=html;}

/* ================= 滑动切换题目 ================= */
let touchStartX=0, touchStartY=0, touchEndX=0, touchEndY=0, currentPage='home';
const mainEl=$('main');
mainEl.addEventListener('touchstart',e=>{
  touchStartX=e.changedTouches[0].screenX;
  touchStartY=e.changedTouches[0].screenY;
},{passive:true});
mainEl.addEventListener('touchend',e=>{
  touchEndX=e.changedTouches[0].screenX;
  touchEndY=e.changedTouches[0].screenY;
  handleSwipe();
},{passive:true});
function handleSwipe(){
  const dx=touchEndX-touchStartX, dy=touchEndY-touchStartY;
  if(Math.abs(dx)<50||Math.abs(dy)>Math.abs(dx)*1.2)return;
  if(currentPage==='study'){dx>0?studyNav(-1):studyNav(1);}
  else if(currentPage==='quiz'){dx>0?quizNav(-1):quizNav(1);}
}

/* ================= 首页 ================= */
function goHome(){
  currentPage='home';
  setFoot(1);
  $('appTitle').textContent='📚 背题·答题系统';
  const pct=localStorage.getItem('bestPct')||'—';
  render(`
    <div class="statrow">
      <div class="stat"><b>${META.total}</b><span>题目总数</span></div>
      <div class="stat"><b>${META.choice}</b><span>单选题</span></div>
      <div class="stat"><b>${META.judge}</b><span>判断题</span></div>
      <div class="stat"><b>${pct}%</b><span>最高分</span></div>
    </div>
    <div class="grid2">
      <button class="btn block big" onclick="goStudy()">📖 背题</button>
      <button class="btn block big" style="background:#10b981" onclick="goQuiz()">✏️ 答题</button>
    </div>
    <div style="height:14px"></div>
    <div class="card">
      <div class="muted">使用说明</div>
      <div style="font-size:14px;margin-top:8px">
        • <b>背题</b>：逐题浏览，可显示/隐藏答案、随机顺序、按题型筛选。<br>
        • <b>答题</b>：随机抽题作答，即时判分，结束后可回顾并重练错题。<br>
        • <b>我的</b>：查看历史最佳与错题本。
      </div>
    </div>
    <div class="card"><div class="muted">按题型背题</div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn block ghost" onclick="startStudy('全部')">全部</button>
        <button class="btn block ghost" onclick="startStudy('单选')">单选</button>
        <button class="btn block ghost" onclick="startStudy('判断')">判断</button>
      </div>
    </div>
  `);
}

/* ================= 背题 ================= */
let studyType='全部',studyIdx=0,studyOrder=[],studyShow=true,autoT=null;
function startStudy(t){studyType=t;studyIdx=0;studyOrder=filterByType(t).map((_,i)=>i);studyShow=true;goStudy();}
function goStudy(){
  currentPage='study';
  setFoot(2);
  $('appTitle').textContent='📖 背题';
  const list=filterByType(studyType);
  if(!list.length){render('<div class="card">该题型暂无题目</div>');return;}
  if(studyIdx>=list.length)studyIdx=0;
  if(!studyOrder.length)studyOrder=list.map((_,i)=>i);
  renderStudy(list);
}
function renderStudy(list){
  const q=list[studyOrder[studyIdx]];
  let optHtml='';
  if(q.type==='单选'){
    optHtml=['A','B','C','D'].map((k,i)=>q.options[i]?`<div class="opt"><span class="k">${k}</span>${esc(q.options[i])}</div>`:'').join('');
  }else{
    optHtml='<div class="opt"><span class="k">√</span>正确</div><div class="opt"><span class="k">×</span>错误</div>';
  }
  const ans=q.type==='单选'?q.answer:(q.answer==='√'?'√ 正确':'× 错误');
  const tab=(t)=>`<div class="tab ${studyType===t?'on':''}" onclick="switchStudy('${t}')">${t==='全部'?'全部':(t==='单选'?'单选题':'判断题')}</div>`;
  render(`
    <div class="tabs">${tab('全部')}${tab('单选')}${tab('判断')}</div>
    <div class="card">
      <span class="muted">第 ${studyIdx+1} / ${list.length} 题　题型：${esc(q.type)}</span>
      <p class="stem">${esc(q.question)}</p>
      ${optHtml}
      <div class="ansbox hidden" id="ansArea"><b>答案：</b>${ans}</div>
      <div class="navbar">
        <button class="btn ghost" onclick="studyNav(-1)">‹ 上一题</button>
        <button class="btn answer-btn" id="toggleAns" onclick="toggleAns()">显示答案</button>
        <button class="btn ghost" onclick="studyNav(1)">下一题 ›</button>
      </div>
    </div>
    <div class="jump">
      <input type="number" id="jumpInput" min="1" placeholder="跳转到第几题">
      <button class="btn" onclick="studyJump()">跳转</button>
    </div>
    <div class="toolbar">
      <button class="btn ghost" onclick="studyShuffle()">🔀 随机顺序</button>
      <button class="btn ghost" onclick="studyAuto()">⏩ 自动翻页</button>
    </div>
  `);
  const qa=$('ansArea');
  if(studyShow){qa.classList.remove('hidden');$('toggleAns').textContent='隐藏答案';}
}
function switchStudy(t){startStudy(t);}
function toggleAns(){studyShow=!studyShow;goStudy();}
function studyNav(d){
  const list=filterByType(studyType);
  studyIdx=Math.min(Math.max(0,studyIdx+d),list.length-1);
  renderStudy(list);
}
function studyShuffle(){studyOrder=shuffle(studyOrder);studyIdx=0;goStudy();}
function studyJump(){
  const n=parseInt($('jumpInput').value);if(!n)return;
  studyIdx=Math.min(Math.max(0,n-1),filterByType(studyType).length-1);goStudy();
}
function studyAuto(){
  if(autoT){clearInterval(autoT);autoT=null;goStudy();return;}
  studyShow=true;autoT=setInterval(()=>studyNav(1),2500);
  $('toggleAns').textContent='⏸ 停止';
}

/* ================= 答题 ================= */
let quiz={list:[],pos:0,answers:{}};
function goQuiz(){
  currentPage='quiz';
  setFoot(3);
  $('appTitle').textContent='✏️ 答题';
  render(`
    <div class="card">
      <h2>开始新测验</h2>
      <label class="chk"><input type="checkbox" id="cz" checked> 单选题 (${META.choice})</label>
      <label class="chk"><input type="checkbox" id="cj" checked> 判断题 (${META.judge})</label>
      <div style="margin-top:12px"><div class="muted">题目数量</div>
        <select id="qnum">
          <option value="all">全部题目（随机顺序）</option>
          <option value="10">10 题</option>
          <option value="20" selected>20 题</option>
          <option value="30">30 题</option>
          <option value="50">50 题</option>
          <option value="100">100 题</option>
        </select>
      </div>
      <div style="height:14px"></div>
      <button class="btn block big" onclick="startQuiz()">开始答题</button>
    </div>
    <div class="card"><div class="muted">错题本（${wrongCount()} 题）</div>
      <button class="btn block ghost" style="margin-top:10px" onclick="reviewWrong()">做错题本</button>
    </div>
  `);
}
function startQuiz(){
  const cz=$('cz').checked,cj=$('cj').checked;
  if(!cz&&!cj){alert('请至少选择一种题型');return;}
  let pool=BANK.filter(q=>(q.type==='单选'&&cz)||(q.type==='判断'&&cj));
  pool=shuffle(pool);
  const n=$('qnum').value;
  if(n!=='all')pool=pool.slice(0,parseInt(n));
  quiz={list:pool,pos:0,answers:{}};
  renderQuiz();
}
function ansLabel(q){return q.type==='单选'?q.answer:(q.answer==='√'?'√ 正确':'× 错误');}
function renderQuiz(){
  const L=quiz.list.length;
  if(!L){render('<div class="card">没有符合条件的题目</div>');return;}
  const q=quiz.list[quiz.pos];
  const answered=quiz.answers[quiz.pos]!=null;
  let optHtml='';
  const keys=q.type==='单选'?['A','B','C','D']:['√','×'];
  keys.forEach((k,i)=>{
    if(q.type==='单选'&&!q.options[i])return;
    const chosen=quiz.answers[quiz.pos]===k;
    let cls='opt';
    if(answered){if(k===q.answer)cls+=' right';else if(chosen)cls+=' wrong dim';else cls+=' dim';}
    optHtml+=`<button class="${cls}" ${answered?'disabled':''} onclick="pick('${k}')"><span class="k">${k}</span>${q.type==='单选'?esc(q.options[i]):(k==='√'?'正确':'错误')}</button>`;
  });
  let feed='';
  if(answered){const ok=quiz.answers[quiz.pos]===q.answer;
    feed=`<div class="ansbox">${ok?'✅ 回答正确！':('❌ 回答错误，正确答案：'+ansLabel(q))}</div>`;}
  render(`
    <div class="card">
      <div class="muted">第 ${quiz.pos+1} / ${L} 题　已答对 ${score()} 题</div>
      <div class="progress"><div style="width:${L?Math.round(quiz.pos/L*100):0}%"></div></div>
      <p class="stem">${esc(q.question)}</p>
      ${optHtml}
      ${feed}
      <div class="navbar">
        <button class="btn ghost" ${quiz.pos===0?'disabled':''} onclick="quizNav(-1)">‹ 上一题</button>
        ${answered?'<button class="btn" onclick="quizNext()">'+(quiz.pos===L-1?'查看成绩':'下一题')+' ›</button>':'<button class="btn ghost" disabled>请选择答案</button>'}
      </div>
    </div>
  `);
}
function pick(k){quiz.answers[quiz.pos]=k;renderQuiz();}
function quizNav(d){quiz.pos=Math.min(Math.max(0,quiz.pos+d),quiz.list.length-1);renderQuiz();}
function quizNext(){if(quiz.pos<quiz.list.length-1){quiz.pos++;renderQuiz();}else finishQuiz();}
function score(){let s=0;for(const k in quiz.answers){if(quiz.answers[k]===quiz.list[k].answer)s++;}return s;}
function finishQuiz(){
  const L=quiz.list.length,sc=score(),pct=L?Math.round(sc/L*100):0;
  const best=parseInt(localStorage.getItem('bestPct')||'0');
  if(pct>best)localStorage.setItem('bestPct',pct);
  const wrong=quiz.list.map((q,i)=>({...q,ua:quiz.answers[i]})).filter(q=>q.ua!==q.answer);
  saveWrong(wrong.map(({ua,...rest})=>rest));
  autoSync();
  let wrongHtml='';
  if(wrong.length){
    wrongHtml='<div class="card"><h2>❌ 错题回顾（'+wrong.length+' 题）</h2>'+
      wrong.map((q,i)=>wrongQuestionHtml(q,i,q.ua)).join('')
      +'<button class="btn block" style="margin-top:12px" onclick="retryQuiz()">🔁 重练这组错题</button></div>';
  }
  render(`
    <div class="card">
      <div class="result-big">${pct}%</div>
      <div class="result-sub">答对 <b>${sc}</b> / <b>${L}</b> 题</div>
      <div class="grid2">
        <button class="btn block ghost" onclick="goQuiz()">再测一次</button>
        <button class="btn block" onclick="goStudy()">去背题</button>
      </div>
    </div>
    ${wrongHtml}
  `);
}
function retryQuiz(){quiz={list:shuffle(quiz.list.filter((q,i)=>quiz.answers[i]!==q.answer)),pos:0,answers:{}};renderQuiz();}
function reviewWrong(){
  const w=getWrong();
  if(!w.length){alert('暂无错题记录 🎉');return;}
  quiz={list:shuffle(w),pos:0,answers:{}};
  renderQuiz();
}

/* ================= 错题本 ================= */
function wrongQuestionHtml(q,i,ua){
  let opts='';
  if(q.type==='单选'){
    opts=['A','B','C','D'].map((k,j)=>{
      if(!q.options[j])return '';
      let mark='';
      if(ua&&ua===k)mark='<span style="color:var(--err);font-weight:600">✗ 你的答案 </span>';
      if(k===q.answer)mark+='<span style="color:var(--ok);font-weight:600">✓ 正确 </span>';
      return '<div style="padding:4px 0">'+mark+'<b>'+k+'</b> '+esc(q.options[j])+'</div>';
    }).join('');
  }else{
    let uaMark='';
    if(ua&&ua!==q.answer)uaMark='<div style="padding:2px 0"><span style="color:var(--err)">你的答案：'+esc(ua)+'</span></div>';
    opts=uaMark+'<div style="padding:4px 0"><b>√</b> 正确</div><div style="padding:4px 0"><b>×</b> 错误</div>';
  }
  return '<div style="border-bottom:1px solid var(--line);padding:8px 0">'+
    '<div class="muted">'+(i+1)+'. '+(q.type==='单选'?'单选':'判断')+'</div>'+
    '<div style="font-size:14px;margin:8px 0">'+esc(q.question)+'</div>'+
    '<div style="margin:6px 0">'+opts+'</div>'+
    '<div style="font-size:13px;color:var(--ok)">答案：'+ansLabel(q)+'</div>'+
    '</div>';
}

function getWrong(){try{return JSON.parse(localStorage.getItem('wrongbook')||'[]');}catch(e){return [];}}
function setWrong(arr){localStorage.setItem('wrongbook',JSON.stringify(arr));}
function saveWrong(arr){
  if(!arr.length)return;
  const map=new Map(getWrong().map(q=>[q.question,q]));
  arr.forEach(q=>map.set(q.question,q));
  setWrong([...map.values()]);
}
function wrongCount(){return getWrong().length;}

/* ================= 数据备份与跨设备同步 =================
 * 双通道设计：
 * ① 文件导出/导入：任何部署形态（含 GitHub Pages 静态版）都可用，
 *    导出 JSON 备份文件，换设备后导入合并，不依赖服务器。
 * ② 服务器云同步：仅 Flask 后端版可用（前端自动检测 /api/ping），
 *    多设备使用同一"同步码"即可共享错题本与最佳成绩。
 */
function getBest(){return localStorage.getItem('bestPct')||'';}
function setBest(v){localStorage.setItem('bestPct',v);}

function collectProgress(){
  return {kind:'quiz_app_progress',version:1,exported_at:new Date().toISOString(),
    bestPct:getBest(),wrongbook:getWrong()};
}
function mergeProgress(data){
  if(!data||data.kind!=='quiz_app_progress')return {ok:false,error:'文件格式不正确（非本应用备份文件）'};
  let added=0;
  if(data.wrongbook&&Array.isArray(data.wrongbook)){
    const map=new Map(getWrong().map(q=>[q.question,q]));
    data.wrongbook.forEach(q=>{if(q&&q.question&&!map.has(q.question)){map.set(q.question,q);added++;}});
    setWrong([...map.values()]);
  }
  const nb=parseInt(data.bestPct||'0');
  if(nb>parseInt(getBest()||'0'))setBest(String(nb));
  return {ok:true,added,total:wrongCount()};
}

/* ---- ① 文件导出/导入 ---- */
function exportProgress(){
  const data=collectProgress();
  const blob=new Blob([JSON.stringify(data,null,1)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='quiz_backup_'+new Date().toISOString().slice(0,10)+'.json';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function importProgressFile(input){
  const f=input.files&&input.files[0];
  if(!f)return;
  const rd=new FileReader();
  rd.onload=()=>{
    try{
      const res=mergeProgress(JSON.parse(rd.result));
      alert(res.ok?('✅ 导入成功：新增 '+res.added+' 道错题，错题本共 '+res.total+' 题')
                  :('❌ '+res.error));
      if(res.ok)goMine();
    }catch(e){alert('❌ 文件解析失败：'+e.message);}
    input.value='';
  };
  rd.readAsText(f);
}

/* ---- ② 服务器云同步 ---- */
let HAS_SERVER=null;
async function detectServer(){
  if(HAS_SERVER!==null)return HAS_SERVER;
  try{
    const r=await fetch('/api/ping',{cache:'no-store'});
    HAS_SERVER=r.ok;
  }catch(e){HAS_SERVER=false;}
  return HAS_SERVER;
}
function getSyncCode(){return (localStorage.getItem('syncCode')||'').trim();}
function setSyncCodeInput(){
  const inp=$('syncCodeInput');
  if(inp){const c=getSyncCode();if(c)inp.value=c;}
}
async function pushProgress(){
  if(!(await detectServer())){alert('当前为纯静态版，无服务器可同步。请使用"导出备份 / 导入备份"方式。');return;}
  let code=($('syncCodeInput')?$('syncCodeInput').value.trim():getSyncCode());
  if(!code){alert('请先填写同步码（任意自定义字符串，多设备保持一致即可）');return;}
  localStorage.setItem('syncCode',code);
  const r=await fetch('/api/sync/'+encodeURIComponent(code),{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(collectProgress())});
  const j=await r.json();
  if(j.ok){
    const res=mergeProgress(j.data||{});
    alert('✅ 已同步到云端（同步码：'+code+'）\n本地错题本共 '+wrongCount()+' 题');
    goMine();
  }else alert('❌ 同步失败：'+(j.error||'未知错误'));
}
async function pullProgress(){
  if(!(await detectServer())){alert('当前为纯静态版，无服务器可同步。请使用"导出备份 / 导入备份"方式。');return;}
  let code=($('syncCodeInput')?$('syncCodeInput').value.trim():getSyncCode());
  if(!code){alert('请先填写同步码');return;}
  localStorage.setItem('syncCode',code);
  const r=await fetch('/api/sync/'+encodeURIComponent(code),{cache:'no-store'});
  const j=await r.json();
  if(!j.ok){alert('❌ 获取失败：'+(j.error||'该同步码尚无云端数据'));return;}
  const res=mergeProgress(j.data||{});
  alert('✅ 已从云端恢复：新增 '+res.added+' 道错题，错题本共 '+res.total+' 题');
  goMine();
}
async function autoSync(){
  try{
    if(!(await detectServer()))return;
    const code=getSyncCode();
    if(!code)return;
    await fetch('/api/sync/'+encodeURIComponent(code),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(collectProgress())});
  }catch(e){/* 静默失败，不影响答题体验 */}
}

/* ---- ③ 迁移链接（纯前端，静态版首选，无需服务器/文件） ---- */
function collectCompact(){return {k:1,b:getBest(),w:getWrong().map(q=>q.question)};}
function b64urlEncode(bytes){
  let bin='';bytes.forEach(b=>bin+=String.fromCharCode(b));
  return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64urlDecode(str){
  str=str.replace(/-/g,'+').replace(/_/g,'/');while(str.length%4)str+='=';
  const bin=atob(str);const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  return bytes;
}
async function deflateStr(s){
  if(typeof CompressionStream==='undefined')return null;
  const cs=new CompressionStream('deflate');
  const stream=new Blob([new TextEncoder().encode(s)]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function inflateStr(bytes){
  const ds=new DecompressionStream('deflate');
  const stream=new Blob([bytes]).stream().pipeThrough(ds);
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}
async function buildShareLink(){
  const json=JSON.stringify(collectCompact());
  const z=await deflateStr(json);
  const encoded=z?('Z.'+b64urlEncode(z)):('R.'+b64urlEncode(new TextEncoder().encode(json)));
  return location.origin+location.pathname+'#sync='+encoded;
}
async function showShareLink(){
  const link=await buildShareLink();
  $('shareLink').value=link;
  $('shareBox').classList.remove('hidden');
}
async function copyShareLink(){
  const ta=$('shareLink');ta.select();ta.setSelectionRange(0,99999);
  try{await navigator.clipboard.writeText(ta.value);alert('✅ 链接已复制，发送到另一台设备打开即可导入');}
  catch(e){document.execCommand('copy');alert('✅ 链接已复制');}
}
async function tryImportFromHash(){
  const m=location.hash.match(/#sync=(.+)/);
  if(!m)return;
  try{
    const enc=m[1],kind=enc.slice(0,2),bytes=b64urlDecode(enc.slice(2));
    const json=(kind==='Z.')?await inflateStr(bytes):new TextDecoder().decode(bytes);
    const compact=JSON.parse(json);
    const byText=new Map(BANK.map(q=>[q.question,q]));
    const wrong=(compact.w||[]).map(t=>byText.get(t)).filter(Boolean);
    const res=mergeProgress({kind:'quiz_app_progress',bestPct:compact.b,wrongbook:wrong});
    history.replaceState(null,'',location.pathname+location.search);
    alert('✅ 迁移成功：新增 '+res.added+' 道错题，错题本共 '+res.total+' 题');
    goMine();
  }catch(e){alert('❌ 迁移链接解析失败：'+e.message);}
}

function goMine(){
  currentPage='mine';
  setFoot(4);
  $('appTitle').textContent='📊 我的';
  const wr=getWrong(),best=localStorage.getItem('bestPct')||'—';
  render(`
    <div class="statrow">
      <div class="stat"><b>${best}%</b><span>历史最佳正确率</span></div>
      <div class="stat"><b>${wr.length}</b><span>错题本数量</span></div>
    </div>
    <div class="card">
      <h2>🔗 迁移链接（推荐 · 无需服务器）</h2>
      <div class="muted">把错题本和最佳成绩生成一个链接，发送到另一台设备打开即自动导入，最适合手机使用。</div>
      <button class="btn block" style="margin-top:10px" onclick="showShareLink()">🔗 生成迁移链接</button>
      <div id="shareBox" class="hidden" style="margin-top:10px">
        <textarea id="shareLink" readonly style="width:100%;height:70px;font-size:12px;border:1px solid var(--line);border-radius:10px;padding:8px;word-break:break-all"></textarea>
        <button class="btn block" style="margin-top:6px" onclick="copyShareLink()">📋 复制链接</button>
      </div>
    </div>
    <div class="card">
      <h2>☁️ 跨设备同步</h2>
      <div class="muted" id="syncHint">检测服务器中…</div>
      <div id="serverSync" class="hidden">
        <div class="muted" style="margin-top:6px">同步码（自定义，多设备保持一致）</div>
        <div style="display:flex;gap:8px;margin-top:6px">
          <input type="text" id="syncCodeInput" placeholder="如：yong-2026" style="flex:1;padding:8px 10px;border:1px solid var(--line);border-radius:10px;font-size:14px">
        </div>
        <div class="grid2" style="margin-top:8px">
          <button class="btn block" onclick="pushProgress()">⬆️ 上传到云端</button>
          <button class="btn block ghost" onclick="pullProgress()">⬇️ 从云端恢复</button>
        </div>
        <div class="muted" style="margin-top:6px">上传会合并云端已有错题；恢复会把云端错题合并到本机。答题结束后自动静默上传。</div>
      </div>
      <div style="height:10px"></div>
      <div class="muted">文件备份（导出 JSON 文件，换设备后导入）</div>
      <div class="grid2" style="margin-top:8px">
        <button class="btn block ghost" onclick="exportProgress()">💾 导出备份</button>
        <button class="btn block ghost" onclick="$('importFile').click()">📂 导入备份</button>
      </div>
      <input type="file" id="importFile" accept=".json,application/json" style="display:none" onchange="importProgressFile(this)">
    </div>
    <div class="card">
      <h2>错题本</h2>
      ${wr.length===0?'<div class="muted">还没有错题，去做一次题吧。</div>':
        wr.slice(0,200).map((q,i)=>wrongQuestionHtml(q,i)).join('')}
      <div style="height:10px"></div>
      <button class="btn block ghost" onclick="reviewWrong()">开始练习错题</button>
      <button class="btn block ghost" style="margin-top:8px;color:var(--err)" onclick="clearWrong()">清空错题本</button>
    </div>
  `);
  setSyncCodeInput();
  detectServer().then(ok=>{
    const hint=$('syncHint');
    if(!hint)return;
    if(ok){hint.textContent='已检测到本地服务器，可使用云端同步';$('serverSync').classList.remove('hidden');}
    else hint.textContent='当前为纯静态版（无服务器），推荐使用上方"迁移链接"或下方"文件备份"跨设备迁移。';
  });
}
function clearWrong(){if(confirm('确定清空错题本？')){localStorage.removeItem('wrongbook');goMine();}}

/* ================= 启动 ================= */
$('app').style.display='none';
loadData();