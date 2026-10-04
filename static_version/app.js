"use strict";
/* ============================================================
 * 光伏题库 · 背题 / 答题系统（纯前端静态版 · 多选题库）
 *   - 选择题库：光伏专业题库 / 光伏汇总全部
 *   - 题型：单选、多选、判断、填空、简答、论述、名词解释、计算、绘图
 *       单选 / 多选 / 判断 —— 背题 + 答题
 *       其余题型          —— 背题
 *   - 错题本 / 历史最佳按题库独立保存
 *   - 支持图片与 LaTeX 公式（KaTeX）渲染
 * ============================================================ */

let BANKS = [];
let BANK = [];
let META = {};
let BANK_ID = "";

const QUIZ_TYPES = ["单选", "多选", "判断"];

const TYPE_CLASS = {
  "单选": "sel", "多选": "multi", "判断": "jud", "填空": "fill",
  "简答": "short", "论述": "essay", "名词解释": "noun", "计算": "calc", "绘图": "draw"
};
const TYPE_NAME = {
  "单选": "单选题", "多选": "多选题", "判断": "判断题", "填空": "填空题",
  "简答": "简答题", "论述": "论述题", "名词解释": "名词解释",
  "计算": "计算题", "绘图": "绘图题"
};
const DIFF_CLASS = { "容易": "easy", "中等": "mid", "困难": "hard" };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s)
  .replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function tc(t) { return TYPE_CLASS[t] || "sel"; }
function pill(t) { return '<span class="qtype ' + tc(t) + '">' + esc(t) + '</span>'; }
function chip(text, cls) { return text ? '<span class="mchip ' + (cls || "") + '">' + esc(text) + '</span>' : ""; }
function metaLine(q) {
  return pill(q.type) + chip(q.chapter, "ch") + chip(q.difficulty, DIFF_CLASS[q.difficulty] || "")
    + (q.answerMissing ? '<span class="mchip warn">答案缺失</span>' : "");
}

/* ================= 渲染（含公式渲染） ================= */
function render(html) {
  const m = $("main");
  m.innerHTML = html;
  if (window.renderMathInElement) {
    try {
      renderMathInElement(m, {
        delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }],
        throwOnError: false,
        ignoredTags: ["script", "noscript", "style", "textarea", "pre", "option", "code"]
      });
    } catch (e) { /* 公式渲染失败不影响页面 */ }
  }
}
function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function setFoot(n) { ["f1", "f2", "f3", "f4"].forEach((f, i) => $(f).classList.toggle("on", i === n - 1)); }

/* ================= 按题库独立的本地存储 ================= */
function sKey(k) { return k + "::" + BANK_ID; }
function getWrong() { try { return JSON.parse(localStorage.getItem(sKey("wrongbook")) || "[]"); } catch (e) { return []; } }
function setWrong(arr) { localStorage.setItem(sKey("wrongbook"), JSON.stringify(arr)); }
function wrongCount() { return getWrong().length; }
function getBest() { return localStorage.getItem(sKey("bestPct")) || ""; }
function setBest(v) { localStorage.setItem(sKey("bestPct"), String(v)); }

function migrateLegacy() {
  if (localStorage.getItem("wrongbook") && !localStorage.getItem("wrongbook::pv_professional")) {
    localStorage.setItem("wrongbook::pv_professional", localStorage.getItem("wrongbook"));
  }
  if (localStorage.getItem("bestPct") && !localStorage.getItem("bestPct::pv_professional")) {
    localStorage.setItem("bestPct::pv_professional", localStorage.getItem("bestPct"));
  }
}

/* ================= 图片 ================= */
function imgUrl(f) { return "data/" + (META.mediaDir || "") + "/" + f; }
function imagesHtml(list) {
  if (!list || !list.length) return "";
  return '<div class="imgs">' + list.map((f) =>
    '<img loading="lazy" src="' + esc(imgUrl(f)) + '" alt="图" onclick="zoomImg(this.src)">').join("") + "</div>";
}
function zoomImg(src) { $("imgZoomImg").src = src; $("imgZoom").classList.remove("hidden"); }
function closeZoom() { $("imgZoom").classList.add("hidden"); }

/* ================= 启动 / 题库加载 ================= */
async function boot() {
  try {
    const r = await fetch("data/banks.json", { cache: "no-store" });
    const j = await r.json();
    BANKS = j.banks || [];
    if (!BANKS.length) throw new Error("题库索引为空");
    migrateLegacy();
    const saved = localStorage.getItem("bankId");
    const pick = BANKS.find((b) => b.id === saved) || BANKS[0];
    await loadBank(pick.id);
    $("loading").style.display = "none";
    $("app").style.display = "flex";
    tryImportFromHash();
    goHome();
  } catch (e) {
    $("loading").innerHTML = '题库加载失败：' + esc(e.message) +
      '<br><button class="btn" style="margin-top:10px" onclick="location.reload()">重试</button>';
  }
}
async function loadBank(id) {
  const b = BANKS.find((x) => x.id === id) || BANKS[0];
  const r = await fetch("data/" + b.file, { cache: "no-store" });
  const data = await r.json();
  BANK = data.items || [];
  META = data.meta || {};
  META.types = META.types || [];
  META.chapters = META.chapters || [];
  META.difficulties = META.difficulties || [];
  META.counts = META.counts || {};
  META.mediaDir = META.mediaDir || "";
  BANK_ID = b.id;
  localStorage.setItem("bankId", id);
  studyFilter = { type: "全部", chapter: "全部", difficulty: "全部" };
  studyIdx = 0; studyOrder = []; studyShow = true;
  WRONG_TYPE = "全部";
}
async function switchBank(id) {
  if (id === BANK_ID) { goHome(); return; }
  const m = $("main");
  m.innerHTML = '<div class="card empty">题库切换中…</div>';
  await loadBank(id);
  goHome();
}

/* ================= 滑动切换题目 ================= */
let touchStartX = 0, touchStartY = 0, touchEndX = 0, touchEndY = 0, currentPage = "home";
const mainEl = $("main");
mainEl.addEventListener("touchstart", (e) => {
  touchStartX = e.changedTouches[0].screenX; touchStartY = e.changedTouches[0].screenY;
}, { passive: true });
mainEl.addEventListener("touchend", (e) => {
  touchEndX = e.changedTouches[0].screenX; touchEndY = e.changedTouches[0].screenY;
  const dx = touchEndX - touchStartX, dy = touchEndY - touchStartY;
  if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 1.2) return;
  if (currentPage === "study") { dx > 0 ? studyNav(-1) : studyNav(1); }
  else if (currentPage === "quiz") { dx > 0 ? quizNav(-1) : quizNav(1); }
}, { passive: true });

/* ================= 首页 ================= */
function goHome() {
  currentPage = "home";
  setFoot(1);
  $("appTitle").textContent = "📚 " + (META.title || "题库");
  const pct = getBest() || "—";
  const counts = META.counts || {};
  const bankRows = BANKS.map((b) => {
    const on = b.id === BANK_ID;
    return `<div class="bank-row ${on ? "on" : ""}" onclick="switchBank('${b.id}')">
        <div class="bank-radio">${on ? "●" : "○"}</div>
        <div class="bank-main"><div class="bank-name">${esc(b.name)}${on ? '<span class="bank-cur">当前</span>' : ""}</div>
          <div class="muted">${b.total} 题 · ${(b.types || []).map((t) => t + (b.counts ? b.counts[t] || 0 : "")).join(" / ")}</div></div>
      </div>`;
  }).join("");
  const typeTiles = META.types.map((t) => `
      <div class="tstat ${tc(t)}" onclick="startStudy('${t}')">
        <b>${counts[t] || 0}</b><span>${esc(t)}</span>
      </div>`).join("");
  render(`
    <div class="hero">
      <div class="hero-item"><div class="hero-num">${META.total || BANK.length}</div><div class="hero-cap">题目总数</div></div>
      <div class="hero-divider"></div>
      <div class="hero-item"><div class="hero-num">${wrongCount()}</div><div class="hero-cap">错题本</div></div>
      <div class="hero-divider"></div>
      <div class="hero-item"><div class="hero-num">${pct}${pct === "—" ? "" : "%"}</div><div class="hero-cap">历史最佳</div></div>
    </div>
    <div class="card">
      <h2>选择题库</h2>
      ${bankRows}
    </div>
    <div class="grid2">
      <button class="btn block big grad-blue" onclick="goStudy()">📖 背题</button>
      <button class="btn block big grad-green" onclick="goQuiz()">✏️ 答题</button>
    </div>
    <div style="height:14px"></div>
    <div class="card">
      <h2>按题型背题</h2>
      <div class="typegrid">${typeTiles}</div>
    </div>
    <div class="card">
      <div class="muted">使用说明</div>
      <div class="tip">
        • <b>选择题库</b>：上方切换「光伏专业题库 / 光伏汇总全部」，背题、答题、错题本都会随之切换。<br>
        • <b>背题</b>：逐题浏览，可显示答案、按题型 / 章节 / 难易度筛选、随机顺序、自动翻页。<br>
        • <b>答题</b>：单选 / 多选 / 判断随机抽题，即时判分，结束后可回顾并重练错题。<br>
        • 公式已尽量转为 LaTeX 渲染，图片可点击放大。
      </div>
    </div>
  `);
}

/* ================= 通用：题干 / 选项 / 答案 ================= */
function optionKeys(q) { return q.type === "多选" ? ["A", "B", "C", "D", "E"] : ["A", "B", "C", "D"]; }

// 处理填空题中的 {{答案}} 标记
function stemHtml(q, showAnswer) {
  let s = esc(q.question || "");
  if (s.indexOf("{{") >= 0) {
    s = s.replace(/\{\{([\s\S]*?)\}\}/g, (_m, a) =>
      showAnswer ? '<mark class="hl">' + a + "</mark>" : '<span class="blank">（　　）</span>');
  }
  return s;
}
function optionsHtml(q, correctSet, showRight) {
  const keys = optionKeys(q);
  return keys.map((k, i) => {
    const txt = q.options ? q.options[i] : "";
    if (!txt) return "";
    const right = showRight && correctSet.includes(k);
    return `<div class="opt${right ? " right" : ""}"><span class="k">${k}</span>${esc(txt)}</div>`;
  }).join("");
}
function judgeHtml(q, showRight) {
  return [["√", "正确"], ["×", "错误"]].map(([k, txt]) => {
    const right = showRight && q.answer === k;
    return `<div class="opt${right ? " right" : ""}"><span class="k">${k}</span>${txt}</div>`;
  }).join("");
}
function answerBodyHtml(q, showRight) {
  if (q.type === "单选" || q.type === "多选") return optionsHtml(q, (q.answer || "").split(""), showRight);
  if (q.type === "判断") return judgeHtml(q, showRight);
  return "";
}
function ansInline(q) {
  if (q.type === "单选" || q.type === "多选") return esc(q.answer || "");
  if (q.type === "判断") return q.answer === "√" ? "√ 正确" : (q.answer === "×" ? "× 错误" : "—");
  return "";
}
function answerTextHtml(q) {
  if (q.answerMissing) return '<span class="muted">（原题未提供答案）</span>';
  if (q.type === "单选" || q.type === "多选") {
    const keys = optionKeys(q);
    const parts = (q.answer || "").split("").map((k) => {
      const i = keys.indexOf(k);
      const txt = q.options && q.options[i] ? ("　" + q.options[i]) : "";
      return k + txt;
    });
    return "<b>答案：</b>" + esc(parts.join("　"));
  }
  if (q.type === "判断") {
    let h = "<b>答案：</b>" + (q.answer === "√" ? "√ 正确" : "× 错误");
    if (q.correctDesc) h += '<div class="desc"><b>正确描述：</b>' + esc(q.correctDesc) + "</div>";
    return h;
  }
  if (q.type === "填空") {
    if (q.answers && q.answers.length === 1) return "<b>答案：</b>" + esc(q.answers[0]);
    if (q.answers && q.answers.length > 1) {
      let h = "<b>答案：</b><div class=\"answers\">"
        + q.answers.map((a, i) => `<div>(${i + 1}) ${esc(a)}</div>`).join("") + "</div>";
      if (q.orderFixed === false) h += '<div class="muted">（各空答案顺序可互换）</div>';
      return h;
    }
    return '<span class="muted">答案见题干标注</span>';
  }
  return '<div class="ans-text">' + esc(q.answer || "") + "</div>";
}

/* ================= 背题 ================= */
let studyFilter = { type: "全部", chapter: "全部", difficulty: "全部" };
let studyIdx = 0, studyOrder = [], studyShow = true, autoT = null;

function studyList() {
  return BANK.filter((q) =>
    (studyFilter.type === "全部" || q.type === studyFilter.type) &&
    (studyFilter.chapter === "全部" || q.chapter === studyFilter.chapter) &&
    (studyFilter.difficulty === "全部" || q.difficulty === studyFilter.difficulty));
}
function startStudy(t) {
  studyFilter = { type: t, chapter: "全部", difficulty: "全部" };
  studyIdx = 0; studyOrder = []; studyShow = true;
  goStudy();
}
function goStudy() {
  currentPage = "study";
  setFoot(2);
  $("appTitle").textContent = "📖 背题 · " + (META.title || "");
  const list = studyList();
  if (!studyOrder.length || studyOrder.length !== list.length) studyOrder = list.map((_, i) => i);
  if (studyIdx >= list.length) studyIdx = 0;
  renderStudy();
}
function setStudyType(t) { studyFilter.type = t; studyIdx = 0; studyOrder = []; studyShow = true; goStudy(); }
function setStudyChapter(v) { studyFilter.chapter = v; studyIdx = 0; studyOrder = []; goStudy(); }
function setStudyDiff(v) { studyFilter.difficulty = v; studyIdx = 0; studyOrder = []; goStudy(); }

function renderStudy() {
  const list = studyList();
  if (!list.length) { render('<div class="card empty">当前筛选条件下暂无题目</div>'); return; }
  const q = list[studyOrder[studyIdx]];
  const typeTabs = ["全部", ...META.types].map((t) =>
    `<div class="tab ${studyFilter.type === t ? "on" : ""}" onclick="setStudyType('${t}')">${t === "全部" ? "全部" : esc(t)}</div>`
  ).join("");
  let filters = "";
  if (META.chapters.length) {
    const o = ["全部", ...META.chapters].map((c) => `<option ${studyFilter.chapter === c ? "selected" : ""}>${esc(c)}</option>`).join("");
    filters += `<select onchange="setStudyChapter(this.value)">${o}</select>`;
  }
  if (META.difficulties.length) {
    const o = ["全部", ...META.difficulties].map((d) => `<option ${studyFilter.difficulty === d ? "selected" : ""}>${esc(d)}</option>`).join("");
    filters += `<select onchange="setStudyDiff(this.value)">${o}</select>`;
  }
  const correctSet = (q.answer || "").split("");
  const answerImgs = (!q.answerMissing && q.answerImages) ? imagesHtml(q.answerImages) : "";
  render(`
    <div class="tabs scroll-x">${typeTabs}</div>
    ${filters ? '<div class="filters">' + filters + "</div>" : ""}
    <div class="card qcard">
      <div class="qmeta">
        <span class="muted">第 <b>${studyIdx + 1}</b> / ${list.length} 题</span>
        <span class="mchips">${metaLine(q)}</span>
      </div>
      <p class="stem">${stemHtml(q, studyShow)}</p>
      ${imagesHtml(q.images)}
      ${answerBodyHtml(q, studyShow)}
      <div class="ansbox hidden" id="ansArea">${answerTextHtml(q)}${answerImgs}</div>
      <div class="navbar">
        <button class="btn ghost" onclick="studyNav(-1)">‹ 上一题</button>
        <button class="btn answer-btn" id="toggleAns" onclick="toggleAns()">${studyShow ? "隐藏答案" : "显示答案"}</button>
        <button class="btn ghost" onclick="studyNav(1)">下一题 ›</button>
      </div>
    </div>
    <div class="jump">
      <input type="number" id="jumpInput" min="1" placeholder="跳转到第几题">
      <button class="btn" onclick="studyJump()">跳转</button>
    </div>
    <div class="toolbar">
      <button class="btn ghost" onclick="studyShuffle()">🔀 随机顺序</button>
      <button class="btn ghost" onclick="studyAuto()">${autoT ? "⏸ 停止自动" : "⏩ 自动翻页"}</button>
    </div>
  `);
  if (studyShow) $("ansArea").classList.remove("hidden");
}
function toggleAns() { studyShow = !studyShow; goStudy(); }
function studyNav(d) {
  if (autoT) { clearInterval(autoT); autoT = null; }
  const list = studyList();
  studyIdx = Math.min(Math.max(0, studyIdx + d), list.length - 1);
  renderStudy();
}
function studyShuffle() { studyOrder = shuffle(studyOrder); studyIdx = 0; goStudy(); }
function studyJump() {
  const n = parseInt($("jumpInput").value);
  if (!n) return;
  studyIdx = Math.min(Math.max(0, n - 1), studyList().length - 1);
  goStudy();
}
function studyAuto() {
  if (autoT) { clearInterval(autoT); autoT = null; goStudy(); return; }
  studyShow = true;
  autoT = setInterval(() => {
    const list = studyList();
    if (studyIdx >= list.length - 1) { clearInterval(autoT); autoT = null; renderStudy(); return; }
    studyIdx++;
    renderStudy();
  }, 2500);
  goStudy();
}

/* ================= 答题 ================= */
let quiz = { list: [], pos: 0, answers: {}, picked: {} };

function goQuiz() {
  currentPage = "quiz";
  setFoot(3);
  $("appTitle").textContent = "✏️ 答题 · " + (META.title || "");
  const counts = META.counts || {};
  const qtypes = QUIZ_TYPES.filter((t) => META.types.includes(t));
  const boxes = qtypes.map((t) =>
    `<label class="chk"><input type="checkbox" id="ct_${t}" checked> ${TYPE_NAME[t]} <span class="muted">(${counts[t] || 0})</span></label>`
  ).join("");
  let filters = "";
  if (META.chapters.length) {
    filters += '<div class="field"><div class="muted">章节</div><select id="quizChapter">'
      + ["全部", ...META.chapters].map((c) => `<option>${esc(c)}</option>`).join("") + "</select></div>";
  }
  if (META.difficulties.length) {
    filters += '<div class="field"><div class="muted">难易度</div><select id="quizDiff">'
      + ["全部", ...META.difficulties].map((d) => `<option>${esc(d)}</option>`).join("") + "</select></div>";
  }
  render(`
    <div class="card">
      <h2>开始新测验</h2>
      <div class="muted">选择题型</div>
      <div class="chk-group">${boxes}</div>
      ${filters ? '<div class="field-row">' + filters + "</div>" : ""}
      <div class="field" style="margin-top:10px"><div class="muted">题目数量</div>
        <select id="quizCount">
          <option value="all">全部题目（随机顺序）</option>
          <option value="10">10 题</option>
          <option value="20" selected>20 题</option>
          <option value="30">30 题</option>
          <option value="50">50 题</option>
          <option value="100">100 题</option>
        </select>
      </div>
      <div style="height:14px"></div>
      <button class="btn block big grad-green" onclick="startQuiz()">开始答题</button>
    </div>
    <div class="card wrong-entry">
      <div class="wrong-entry-txt">📕 错题本<span class="muted">（${wrongCount()} 题）</span></div>
      <button class="btn block ghost" onclick="reviewWrong()">做错题本</button>
    </div>
  `);
}
function startQuiz() {
  const types = QUIZ_TYPES.filter((t) => $(`ct_${t}`) && $(`ct_${t}`).checked);
  if (!types.length) { alert("请至少选择一种题型"); return; }
  const chapter = $("quizChapter") ? $("quizChapter").value : "全部";
  const diff = $("quizDiff") ? $("quizDiff").value : "全部";
  let pool = BANK.filter((q) => types.includes(q.type)
    && !q.answerMissing && q.answer
    && (chapter === "全部" || q.chapter === chapter)
    && (diff === "全部" || q.difficulty === diff));
  pool = shuffle(pool);
  const n = $("quizCount").value;
  if (n !== "all") pool = pool.slice(0, parseInt(n));
  quiz = { list: pool, pos: 0, answers: {}, picked: {} };
  renderQuiz();
}
function renderQuiz() {
  const L = quiz.list.length;
  if (!L) { render('<div class="card empty">没有符合条件的题目</div>'); return; }
  const q = quiz.list[quiz.pos];
  const answered = quiz.answers[quiz.pos] != null;
  let optHtml = "";
  if (q.type === "多选") {
    const sel = quiz.picked[quiz.pos] || [];
    const correct = (q.answer || "").split("");
    optionKeys(q).forEach((k, i) => {
      const txt = q.options[i];
      if (!txt) return;
      let cls = "opt";
      const chosen = sel.includes(k);
      if (answered) {
        if (correct.includes(k)) cls += " right";
        else if (chosen) cls += " wrong dim";
        else cls += " dim";
      } else if (chosen) cls += " chosen";
      optHtml += `<button class="${cls}" ${answered ? "disabled" : ""} onclick="multiPick('${k}')"><span class="k">${k}</span>${esc(txt)}</button>`;
    });
  } else {
    const keys = q.type === "单选" ? ["A", "B", "C", "D"] : ["√", "×"];
    keys.forEach((k, i) => {
      if (q.type === "单选" && !q.options[i]) return;
      const chosen = quiz.answers[quiz.pos] === k;
      let cls = "opt";
      if (answered) {
        if (k === q.answer) cls += " right";
        else if (chosen) cls += " wrong dim";
        else cls += " dim";
      }
      const txt = q.type === "单选" ? esc(q.options[i]) : (k === "√" ? "正确" : "错误");
      optHtml += `<button class="${cls}" ${answered ? "disabled" : ""} onclick="pick('${k}')"><span class="k">${k}</span>${txt}</button>`;
    });
  }
  let feed = "";
  let action = "";
  if (answered) {
    const ok = quiz.answers[quiz.pos] === q.answer;
    feed = `<div class="ansbox ${ok ? "ok" : "bad"}">${ok ? "✅ 回答正确！" : ("❌ 回答错误，正确答案：" + ansInline(q))}`;
    if (q.type === "判断" && q.answer === "×" && q.correctDesc) {
      feed += `<div class="desc"><b>正确描述：</b>${esc(q.correctDesc)}</div>`;
    }
    feed += (q.answerImages ? imagesHtml(q.answerImages) : "") + "</div>";
    action = `<button class="btn grad-green" onclick="quizNext()">${quiz.pos === L - 1 ? "查看成绩" : "下一题"} ›</button>`;
  } else if (q.type === "多选") {
    const sel = (quiz.picked[quiz.pos] || []).slice().sort().join("");
    action = `<button class="btn grad-green" onclick="submitMulti()">提交答案${sel ? "（已选 " + sel + "）" : ""}</button>`;
  } else {
    action = '<button class="btn ghost" disabled>请选择答案</button>';
  }
  const pct = L ? Math.round(quiz.pos / L * 100) : 0;
  render(`
    <div class="card qcard">
      <div class="qmeta">
        <span class="muted">第 <b>${quiz.pos + 1}</b> / ${L} 题　已答对 <b>${score()}</b> 题</span>
        <span class="mchips">${metaLine(q)}</span>
      </div>
      <div class="progress"><div style="width:${pct}%"></div><span class="progress-num">${pct}%</span></div>
      <p class="stem">${stemHtml(q, false)}</p>
      ${imagesHtml(q.images)}
      ${q.type === "多选" ? '<div class="muted mb6">多选题：可选多项，选好后点击“提交答案”</div>' : ""}
      ${optHtml}
      ${feed}
      <div class="navbar">
        <button class="btn ghost" ${quiz.pos === 0 ? "disabled" : ""} onclick="quizNav(-1)">‹ 上一题</button>
        ${action}
      </div>
    </div>
  `);
}
function pick(k) { quiz.answers[quiz.pos] = k; renderQuiz(); }
function multiPick(k) {
  const cur = (quiz.picked[quiz.pos] || []).slice();
  const i = cur.indexOf(k);
  if (i >= 0) cur.splice(i, 1); else cur.push(k);
  quiz.picked[quiz.pos] = cur;
  renderQuiz();
}
function submitMulti() {
  const sel = (quiz.picked[quiz.pos] || []).slice().sort().join("");
  if (!sel) { alert("请至少选择一项"); return; }
  quiz.answers[quiz.pos] = sel;
  renderQuiz();
}
function quizNav(d) { quiz.pos = Math.min(Math.max(0, quiz.pos + d), quiz.list.length - 1); renderQuiz(); }
function quizNext() { if (quiz.pos < quiz.list.length - 1) { quiz.pos++; renderQuiz(); } else finishQuiz(); }
function score() {
  let s = 0;
  for (const k in quiz.answers) if (quiz.answers[k] === quiz.list[k].answer) s++;
  return s;
}
function finishQuiz() {
  const L = quiz.list.length, sc = score(), pct = L ? Math.round(sc / L * 100) : 0;
  if (pct > parseInt(getBest() || "0")) setBest(String(pct));
  const wrong = quiz.list
    .map((q, i) => ({ ...q, ua: quiz.answers[i] != null ? quiz.answers[i] : "" }))
    .filter((q) => q.ua !== q.answer);
  saveWrong(wrong);
  let wrongHtml = "";
  if (wrong.length) {
    wrongHtml = '<div class="card"><h2>❌ 错题回顾（' + wrong.length + ' 题）</h2>'
      + wrong.map((q, i) => wrongQuestionHtml(q, i)).join("")
      + '<button class="btn block grad-green" style="margin-top:12px" onclick="retryQuiz()">🔁 重练这组错题</button></div>';
  }
  render(`
    <div class="card result-card">
      <div class="score-ring" style="--pct:${pct}">
        <div class="score-ring-in"><b>${pct}%</b><span>${pct >= 80 ? "优秀" : (pct >= 60 ? "及格" : "加油")}</span></div>
      </div>
      <div class="result-sub">答对 <b>${sc}</b> / <b>${L}</b> 题</div>
      <div class="grid2">
        <button class="btn block ghost" onclick="goQuiz()">再测一次</button>
        <button class="btn block" onclick="goStudy()">去背题</button>
      </div>
    </div>
    ${wrongHtml}
  `);
}
function retryQuiz() {
  quiz = { list: shuffle(quiz.list.filter((q, i) => quiz.answers[i] !== q.answer)), pos: 0, answers: {}, picked: {} };
  renderQuiz();
}
function reviewWrong() {
  const w = wrongFiltered();
  if (!w.length) { alert("暂无错题记录 🎉"); return; }
  quiz = { list: shuffle(w), pos: 0, answers: {}, picked: {} };
  renderQuiz();
}

/* ================= 错题本 ================= */
let WRONG_TYPE = "全部";
let WRONG_VIEW = [];

function wrongFiltered() {
  const w = getWrong();
  return WRONG_TYPE === "全部" ? w : w.filter((q) => q.type === WRONG_TYPE);
}
function saveWrong(arr) {
  if (!arr.length) return;
  const map = new Map(getWrong().map((q) => [q.question, q]));
  arr.forEach((q) => map.set(q.question, q));
  setWrong([...map.values()]);
}
function removeWrong(i) {
  const q = WRONG_VIEW[i];
  if (!q) return;
  setWrong(getWrong().filter((x) => x.question !== q.question));
  goMine();
}
function setWrongType(t) { WRONG_TYPE = t; goMine(); }

function wrongQuestionHtml(q, i) {
  const ua = q.ua || "";
  let opts = "";
  if (q.type === "单选" || q.type === "多选") {
    const correct = (q.answer || "").split("");
    optionKeys(q).forEach((k, j) => {
      const txt = q.options ? q.options[j] : "";
      if (!txt) return;
      const isC = correct.includes(k), isU = ua.includes(k);
      let mk = "";
      if (isC && isU) mk = '<span class="mk ok">✓ 已选对</span>';
      else if (isC) mk = '<span class="mk ok">✓ 正确</span>';
      else if (isU) mk = '<span class="mk bad">✗ 你选</span>';
      opts += `<div class="wopt${isC ? " right" : (isU ? " wrong" : "")}">${mk}<b>${k}</b> ${esc(txt)}</div>`;
    });
  } else if (q.type === "判断") {
    opts = '<div class="wopt">你的答案：' + esc(ua === "√" ? "√ 正确" : (ua === "×" ? "× 错误" : "未作答")) + "</div>"
      + '<div class="wopt right"><span class="mk ok">✓ 正确</span>' + esc(q.answer === "√" ? "√ 正确" : "× 错误") + "</div>";
  }
  let desc = "";
  if (q.type === "判断" && q.answer === "×" && q.correctDesc) {
    desc = '<div class="desc"><b>正确描述：</b>' + esc(q.correctDesc) + "</div>";
  }
  return `<div class="witem">
      <div class="qmeta"><span class="muted">${i + 1}.</span> <span class="mchips">${metaLine(q)}</span></div>
      <div class="wstem">${stemHtml(q, true)}</div>
      ${imagesHtml(q.images)}
      ${opts}${desc}
      <div class="wans">答案：${ansInline(q)}</div>
      <button class="btn ghost tiny" onclick="removeWrong(${i})">移除</button>
    </div>`;
}

/* ================= 备份 / 迁移链接（含题库） ================= */
function collectBankProgress(id) {
  return {
    bestPct: localStorage.getItem("bestPct::" + id) || "",
    wrongbook: (function () { try { return JSON.parse(localStorage.getItem("wrongbook::" + id) || "[]"); } catch (e) { return []; } })()
  };
}
function collectProgressAll() {
  const banks = {};
  BANKS.forEach((b) => { banks[b.id] = collectBankProgress(b.id); });
  return { kind: "quiz_app_progress", version: 2, exported_at: new Date().toISOString(), banks, currentBank: BANK_ID };
}
function mergeBankProgress(id, data) {
  let added = 0;
  if (data.wrongbook && Array.isArray(data.wrongbook)) {
    const key = "wrongbook::" + id;
    let cur = [];
    try { cur = JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) { cur = []; }
    const map = new Map(cur.map((q) => [q.question, q]));
    data.wrongbook.forEach((q) => { if (q && q.question && !map.has(q.question)) { map.set(q.question, q); added++; } });
    localStorage.setItem(key, JSON.stringify([...map.values()]));
  }
  const nb = parseInt(data.bestPct || "0");
  const cur = parseInt(localStorage.getItem("bestPct::" + id) || "0");
  if (nb > cur) localStorage.setItem("bestPct::" + id, String(nb));
  return added;
}
function mergeProgress(data) {
  if (!data || data.kind !== "quiz_app_progress") return { ok: false, error: "文件格式不正确（非本应用备份文件）" };
  // v2：多题库
  if (data.banks && typeof data.banks === "object") {
    let added = 0;
    Object.keys(data.banks).forEach((id) => {
      if (BANKS.some((b) => b.id === id)) added += mergeBankProgress(id, data.banks[id] || {});
    });
    return { ok: true, added, total: wrongCount() };
  }
  // v1：旧版单题库 → 并入当前题库
  const added = mergeBankProgress(BANK_ID, data);
  return { ok: true, added, total: wrongCount() };
}
function exportProgress() {
  const blob = new Blob([JSON.stringify(collectProgressAll(), null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "quiz_backup_" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function importProgressFile(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const res = mergeProgress(JSON.parse(rd.result));
      alert(res.ok ? ("✅ 导入成功：新增 " + res.added + " 道错题，当前题库错题本共 " + res.total + " 题")
        : ("❌ " + res.error));
      if (res.ok) goMine();
    } catch (e) { alert("❌ 文件解析失败：" + e.message); }
    input.value = "";
  };
  rd.readAsText(f);
}

function collectCompact() {
  const wrong = {};
  BANKS.forEach((b) => { wrong[b.id] = collectBankProgress(b.id).wrongbook.map((q) => q.question); });
  return { k: 2, w: wrong, b: collectBankProgress(BANK_ID).bestPct, bank: BANK_ID };
}
function b64urlEncode(bytes) {
  let bin = ""; bytes.forEach((b) => bin += String.fromCharCode(b));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
async function deflateStr(s) {
  if (typeof CompressionStream === "undefined") return null;
  const cs = new CompressionStream("deflate");
  const stream = new Blob([new TextEncoder().encode(s)]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function inflateStr(bytes) {
  const ds = new DecompressionStream("deflate");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}
async function buildShareLink() {
  const json = JSON.stringify(collectCompact());
  const z = await deflateStr(json);
  const encoded = z ? ("Z." + b64urlEncode(z)) : ("R." + b64urlEncode(new TextEncoder().encode(json)));
  return location.origin + location.pathname + "#sync=" + encoded;
}
async function showShareLink() {
  $("shareLink").value = await buildShareLink();
  $("shareBox").classList.remove("hidden");
}
async function copyShareLink() {
  const ta = $("shareLink"); ta.select(); ta.setSelectionRange(0, 99999);
  try { await navigator.clipboard.writeText(ta.value); alert("✅ 链接已复制，发送到另一台设备打开即可导入"); }
  catch (e) { document.execCommand("copy"); alert("✅ 链接已复制"); }
}
async function tryImportFromHash() {
  const m = location.hash.match(/#sync=(.+)/);
  if (!m) return;
  try {
    const enc = m[1], kind = enc.slice(0, 2), bytes = b64urlDecode(enc.slice(2));
    const json = (kind === "Z.") ? await inflateStr(bytes) : new TextDecoder().decode(bytes);
    const compact = JSON.parse(json);
    history.replaceState(null, "", location.pathname + location.search);
    if (compact.k === 2 && compact.w) {
      let added = 0;
      Object.keys(compact.w).forEach((id) => {
        if (!BANKS.some((b) => b.id === id)) return;
        const byText = new Map((id === BANK_ID ? BANK : []).map((q) => [q.question, q]));
        const wrong = (compact.w[id] || []).map((t) => byText.get(t)).filter(Boolean);
        added += mergeBankProgress(id, { wrongbook: wrong });
      });
      if (compact.bank && BANK_ID !== compact.bank) { await loadBank(compact.bank); }
      if (compact.b) mergeBankProgress(compact.bank || BANK_ID, { bestPct: compact.b });
      alert("✅ 迁移成功：新增 " + added + " 道错题（按题库合并）");
    } else {
      const byText = new Map(BANK.map((q) => [q.question, q]));
      const wrong = (compact.w || []).map((t) => byText.get(t)).filter(Boolean);
      const res = mergeProgress({ kind: "quiz_app_progress", bestPct: compact.b, wrongbook: wrong });
      alert("✅ 迁移成功：新增 " + res.added + " 道错题");
    }
    goMine();
  } catch (e) { alert("❌ 迁移链接解析失败：" + e.message); }
}

/* ================= 我的 ================= */
function goMine() {
  currentPage = "mine";
  setFoot(4);
  $("appTitle").textContent = "📊 我的 · " + (META.title || "");
  const best = getBest() || "—";
  const all = getWrong();
  const typesInWrong = META.types.filter((t) => all.some((q) => q.type === t));
  WRONG_TYPE = (WRONG_TYPE === "全部" || typesInWrong.includes(WRONG_TYPE)) ? WRONG_TYPE : "全部";
  WRONG_VIEW = wrongFiltered();
  const tabs = ["全部", ...typesInWrong].map((t) =>
    `<div class="tab ${WRONG_TYPE === t ? "on" : ""}" onclick="setWrongType('${t}')">${t === "全部" ? "全部" : esc(t)}<span class="tab-num">${t === "全部" ? all.length : all.filter((q) => q.type === t).length}</span></div>`
  ).join("");
  render(`
    <div class="statrow">
      <div class="stat"><b>${best}${best === "—" ? "" : "%"}</b><span>历史最佳正确率</span></div>
      <div class="stat"><b>${all.length}</b><span>错题本数量</span></div>
    </div>
    <div class="card">
      <h2>错题本 · ${esc(META.title || "")}</h2>
      ${all.length === 0 ? '<div class="muted">还没有错题，去做一次题吧。</div>' : `
        <div class="tabs scroll-x">${tabs}</div>
        <div class="wrong-list">${WRONG_VIEW.length ? WRONG_VIEW.map((q, i) => wrongQuestionHtml(q, i)).join("") : '<div class="muted">该题型暂无错题</div>'}</div>
        <div style="height:10px"></div>
        <button class="btn block grad-green" onclick="reviewWrong()">开始练习错题（${WRONG_VIEW.length} 题）</button>
        <button class="btn block ghost" style="margin-top:8px;color:var(--err)" onclick="clearWrong()">清空错题本</button>`}
    </div>
    <div class="card">
      <h2>🔗 迁移链接（推荐）</h2>
      <div class="muted">把全部题库的错题本和最佳成绩生成一个链接，发送到另一台设备打开即自动导入。</div>
      <button class="btn block" style="margin-top:10px" onclick="showShareLink()">🔗 生成迁移链接</button>
      <div id="shareBox" class="hidden" style="margin-top:10px">
        <textarea id="shareLink" readonly style="width:100%;height:70px;font-size:12px;border:1px solid var(--line);border-radius:10px;padding:8px;word-break:break-all"></textarea>
        <button class="btn block" style="margin-top:6px" onclick="copyShareLink()">📋 复制链接</button>
      </div>
    </div>
    <div class="card">
      <h2>💾 文件备份</h2>
      <div class="muted">导出 JSON 文件（含全部题库进度），换设备后导入合并。</div>
      <div class="grid2" style="margin-top:8px">
        <button class="btn block ghost" onclick="exportProgress()">导出备份</button>
        <button class="btn block ghost" onclick="$('importFile').click()">导入备份</button>
      </div>
      <input type="file" id="importFile" accept=".json,application/json" style="display:none" onchange="importProgressFile(this)">
    </div>
  `);
}
function clearWrong() { if (confirm("确定清空当前题库的错题本？")) { localStorage.removeItem(sKey("wrongbook")); goMine(); } }

/* ================= 启动 ================= */
$("app").style.display = "none";
boot();