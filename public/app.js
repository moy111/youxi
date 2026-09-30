// 有戏 · DeepSeek 本地版（本地服务保管密钥：解析/对话/摘要/六维分析/评估接入 DeepSeek；localStorage 仅作本机草稿副本）
"use strict";

const LS_KEY = "youxi_demo_v1";
const STAGE_VIEWS = ["upload", "chat", "analysis", "final"];
const VIEW_CTX = {
  home: "让想法，一步步有戏。",
  upload: "阶段 1 / 4 · 个人资料",
  chat: "阶段 2 / 4 · 想法对话",
  analysis: "阶段 3 / 4 · 分析与验证",
  final: "阶段 4 / 4 · 最终评估",
  archive: "随时回看，随时继续",
};

let S = loadState();
let VIEW = "home";
let toastTimer = null;
let tempFile = null; // {name, text}
let draftTimer = null;
let forceSetup = false; // 已配置时从首页进入「更换 DeepSeek Key」

/* ---------- 基础工具 ---------- */
function $(sel) { return document.querySelector(sel); }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function uid() { return "p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8); }
function now() { return Date.now(); }
function timeAgo(t) {
  if (!t) return "";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "刚刚";
  if (s < 3600) return Math.floor(s / 60) + " 分钟前";
  if (s < 86400) return Math.floor(s / 3600) + " 小时前";
  return new Date(t).toLocaleDateString("zh-CN");
}
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3000);
}
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    if (s && Array.isArray(s.projects)) return s;
  } catch (e) { /* 忽略，重建 */ }
  return { projects: [], currentId: null };
}
function browserSave() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(S)); }
  catch (e) { toast("保存失败：浏览器存储空间已满，可在「个人档案」清空本机项目记录"); }
}
function touch(p) { p.updatedAt = now(); }
function cur() { return S.projects.find(p => p.id === S.currentId) || null; }

/* ---------- 项目与状态 ---------- */
function newProj() {
  return {
    id: uid(), title: "未命名的新想法", createdAt: now(), updatedAt: now(),
    status: "进行中", resumeStage: 0, stageReached: 0, bioDraft: "", chatDraft: "",
    profile: { current: null, history: [] },   // current = {json, sourceType, fileName, rawText, bio, confirmed}
    messages: [],                              // {role, content, round|null, isOpening}
    idea: { current: null, history: [], version: 0 }, // current = {json, source}
    analysis: null,                            // {tasks:[{text,status}]}
    finalHistory: [],                          // {verdict, reason, at}
    editingSummary: false,
  };
}
function flags(p) {
  const pr = p.profile.current;
  const confirmed = !!(pr && pr.confirmed);
  const hasProfile = !!pr;
  const hasIdea = !!p.idea.current;
  const rounds = p.messages.filter(m => m.round).length;
  const userMsgs = p.messages.filter(m => m.role === "user").length;
  const tasks = (p.analysis && p.analysis.tasks) || [];
  const userTasks = tasks.filter(t => t.owner !== "ai_research");
  const allRecorded = userTasks.length > 0 && userTasks.every(t => t.status === "recorded");
  const hasFinal = p.finalHistory.length > 0;
  return { confirmed, hasProfile, hasIdea, rounds, userMsgs, tasks, userTasks, allRecorded, hasFinal, status: p.status };
}
function phaseStatus(f) {
  if (f.status === "已搁置") return "已搁置 · 保留所有记录";
  if (f.hasFinal) return "最终评估已生成";
  if (f.allRecorded) return "验证信息已齐";
  if (f.userTasks.length) return `验证中 · ${f.userTasks.filter(t => t.status === "recorded").length}/${f.userTasks.length} 项已记录`;
  if (f.tasks.length) return "分析已生成 · 请核对AI检索结果";
  if (f.hasIdea) return "想法已总结";
  if (f.rounds > 0) return `想法对话 · ${Math.min(f.rounds, 3)}/3 轮`;
  if (f.confirmed) return "画像已确认 · 待开始对话";
  if (f.hasProfile) return "资料已解析 · 待确认";
  return "资料准备中";
}
function nextStep(f) {
  if (f.status === "已搁置") return "回看原因，准备好后继续";
  if (!f.confirmed) return f.hasProfile ? "确认个人画像" : "上传资料或补充个人介绍";
  if (f.rounds < 3) return `继续第 ${f.rounds + 1} 轮对话`;
  if (!f.hasIdea) return "生成想法摘要";
  if (!f.tasks.length) return "查看分析与验证清单";
  if (f.userTasks.length && !f.allRecorded) return `记录验证信息（${f.userTasks.filter(t => t.status === "recorded").length}/${f.userTasks.length}）`;
  if (!f.hasFinal) return "生成最终评估";
  return "回看最终评估";
}
function trackHtml(f) {
  const done = [f.confirmed, f.hasIdea, f.allRecorded, f.hasFinal];
  const curIdx = done.indexOf(false);
  const sub = [
    f.confirmed ? "已完成" : (f.hasProfile ? "进行中" : "未开始"),
    f.hasIdea ? "已完成" : (f.confirmed ? "进行中" : "未开始"),
    f.userTasks.length ? `${f.userTasks.filter(t => t.status === "recorded").length}/${f.userTasks.length} 已记录` : (f.tasks.length ? "核对AI检索" : (f.hasIdea ? "待收集" : "未开始")),
    f.hasFinal ? "已完成" : (f.hasIdea ? "可生成" : "未开始"),
  ];
  const names = ["资料", "对话", "验证", "评估"];
  return `<span class="phase-track">` + names.map((n, i) =>
    `<span class="phase ${done[i] ? "done" : i === curIdx ? "current" : ""}">${done[i] ? "✓ " : i === curIdx ? "● " : ""}${n}<small>${sub[i]}</small></span>`
  ).join("") + `</span>`;
}

/* ---------- 视图 ---------- */
function cardHtml(p) {
  const f = flags(p);
  return `<button class="recent" data-action="open" data-id="${p.id}">
    <strong>${esc(p.title)}</strong><span>${phaseStatus(f)}</span>
    ${trackHtml(f)}<span>下一步：${nextStep(f)}</span><span>最近保存：${timeAgo(p.updatedAt)}</span>
  </button>`;
}

function viewUpload(p) {
  const pr = p.profile.current;
  const f = flags(p);
  if (!pr) {
    return `
    <div class="eyebrow">1 / 个人资料</div>
    <h1>从你的经历开始</h1>
    <p class="muted">上传文字型PDF、DOCX或文本资料，也可直接输入。文字在本地提取，点击解析后发送给DeepSeek生成画像。</p>
    <label class="field">个人资料（PDF/DOCX/TXT/MD，≤3MB；扫描件请先OCR）
      <input type="file" id="file-input" accept=".txt,.md,.json,.csv,.pdf,.docx">
      <span class="tiny" id="file-name">${tempFile ? esc(tempFile.name) : "还没有选择文件"}</span>
    </label>
    <label class="field">自我介绍（推荐）
      <textarea id="bio" rows="6" maxlength="4000" placeholder="例如：熟悉短视频剪辑，做过3年运营助理；想帮街边小店拍宣传视频；周末每周8小时；预算5000元">${esc(p.bioDraft)}</textarea>
    </label>
    <div class="stack"><button class="primary" data-action="parse">使用 DeepSeek 解析</button></div>
    ${p.profile.history.length ? `<details><summary>历史解析（${p.profile.history.length} 次，均保留）</summary><p class="tiny">每次解析都生成新记录，不覆盖旧版。</p></details>` : ""}
  `;
  }
  const j = pr.json;
  return `
  <div class="eyebrow">1 / 个人资料</div>
  <h1>确认你的画像</h1>
  <p class="muted">解析来源：${pr.sourceType === "file" ? "资料文本" : pr.sourceType === "bio" ? "自我介绍" : "资料 + 自我介绍"}（DeepSeek 解析，请核对事实）。请核对、修改后确认。</p>
  ${pr.rawText ? `<details><summary>资料原文（${pr.rawText.length} 字）</summary><p class="tiny">${esc(pr.rawText.slice(0, 600))}${pr.rawText.length > 600 ? "…" : ""}</p></details>` : ""}
  <label class="field">技能（每行一条）<textarea data-f="skills" rows="3">${esc(j.skills.join("\n"))}</textarea></label>
  <label class="field">相关经历（每行一条）<textarea data-f="experiences" rows="3">${esc(j.experiences.join("\n"))}</textarea></label>
  <label class="field">兴趣方向（每行一条）<textarea data-f="interests" rows="2">${esc(j.interests.join("\n"))}</textarea></label>
  <label class="field">可用资源（每行一条）<textarea data-f="resources" rows="2">${esc(j.resources.join("\n"))}</textarea></label>
  <label class="field">约束（每行一条）<textarea data-f="constraints" rows="2">${esc(j.constraints.join("\n"))}</textarea></label>
  <div class="row2">
    <label class="field">可投入时间<input data-f="time" value="${esc(j.commitment.time)}" maxlength="60"></label>
    <label class="field">预算<input data-f="budget" value="${esc(j.commitment.budget)}" maxlength="60"></label>
  </div>
  <label class="field">未知/缺失（每行一条）<textarea data-f="unknowns" rows="2">${esc(j.unknowns.join("\n"))}</textarea></label>
  <div class="stack">
    <button class="primary" data-action="confirm-profile">确认画像</button>
    <button data-action="reupload">重新选择资料</button>
  </div>
  <p class="saved">${f.confirmed ? "画像已确认" : "尚未确认"} · 第 ${p.profile.history.length + 1} 次解析（历史均保留）</p>`;
}

const SUMMARY_FIELDS = [
  ["customer", "目标客户", "请填写具体目标客户"],
  ["problem", "解决的问题", ""],
  ["deliverable", "交付内容", ""],
  ["advantages", "个人优势", ""],
  ["constraints", "投入限制", ""],
  ["assumptions", "关键假设（每行一条）", ""],
  ["unknowns", "待验证（每行一条）", ""],
];
function viewChat(p) {
  const f = flags(p);
  let lastAi = -1;
  p.messages.forEach((m, i) => { if (m.role === "assistant") lastAi = i; });
  const msgs = p.messages.map((m, i) => {
    const cls = m.role === "user" ? "user" : "ai";
    const tag = m.role === "user"
      ? (m.round ? `<span class="round-tag">第 ${m.round} 轮</span>` : (p.messages.some(x => x.round) ? `<span class="round-tag">补充</span>` : ""))
      : (m.isOpening ? `<span class="round-tag">开场</span>` : "");
    const chips = (i === lastAi && m.role === "assistant" && Array.isArray(m.options) && m.options.length && !busy.has(p.id))
      ? `<div class="chips">${m.options.map((o, j) => `<button class="chip" data-chip="${j}">${esc(o)}</button>`).join("")}</div>` : "";
    return `<div class="msg ${cls}">${tag}<div class="bubble">${esc(m.content)}</div>${chips}</div>`;
  }).join("");
  const idea = p.idea.current;
  const ideaBox = idea ? `
    <details ${p.editingSummary ? "open" : ""}><summary>想法摘要 v${p.idea.version}（${idea.source === "user" ? "含你的修改" : "DeepSeek 生成"}）</summary>
      <label class="field">标题<input id="s-title" value="${esc(idea.json.title)}" maxlength="20"></label>
      ${SUMMARY_FIELDS.map(([k, label, ph]) =>
        `<label class="field">${label}<textarea id="s-${k}" rows="${["assumptions", "unknowns"].includes(k) ? 3 : 2}" placeholder="${ph}">${esc(Array.isArray(idea.json[k]) ? idea.json[k].join("\n") : idea.json[k] || "")}</textarea></label>`
      ).join("")}
      <div class="stack"><button class="primary" data-action="save-summary">保存修改（生成新版本）</button></div>
      <p class="tiny">初稿由 DeepSeek 基于全部对话生成，请核对修改。v1–v${p.idea.version} 均保留。</p>
    </details>
    <div class="stack"><button class="primary" data-action="goto-analysis">进入分析与验证 →</button></div>` : "";
  return `
  <div class="eyebrow">2 / 想法对话</div>
  <h1>${esc(p.title)}</h1>
  <p class="muted">三轮对话把想法聊清楚。已完成 ${f.rounds}/3 轮${f.userMsgs > f.rounds ? `（补充 ${f.userMsgs - f.rounds} 条）` : ""}。回复由 DeepSeek 生成；草稿保存在本机。</p>
  <p class="tiny">不确定也没关系：AI 会基于你的背景给出候选方向，点一下就能选，之后随时可以换。</p>
  <div class="chat-list">${msgs || '<p class="muted">确认画像后，开始第一轮对话。</p>'}</div>
  ${!p.messages.length && f.confirmed ? '<div class="stack"><button class="primary" data-action="start-chat">开始对话</button></div>' : ""}
  ${f.confirmed ? `
  <div class="chat-input-row">
    <textarea id="chat-input" rows="3" maxlength="4000" placeholder="${f.rounds >= 3 ? "补充信息（不计轮）…" : "写一句你的想法…"}">${esc(p.chatDraft)}</textarea>
    <button class="primary" data-action="send">发送</button>
  </div>` : '<p class="muted">请先在阶段 1 确认个人画像。</p>'}
  ${f.rounds >= 3 && !f.hasIdea ? '<div class="stack"><button class="primary" data-action="gen-summary">使用 DeepSeek 总结想法</button></div>' : ""}
  ${f.hasIdea && !p.editingSummary ? '<div class="stack"><button data-action="edit-summary">查看 / 修改想法摘要</button></div>' : ""}
  ${ideaBox}`;
}

function viewArchive() {
  const cards = S.projects.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  const sel = cur() || cards[0] || null;
  const selF = sel ? flags(sel) : null;
  const pr = sel && sel.profile.current;
  const confirmedPr = pr && pr.confirmed ? pr : null;
  const stages = [
    ["个人资料", () => true, f => f.confirmed ? "画像已确认" : f.hasProfile ? "已解析，待确认" : "尚未开始"],
    ["想法对话", f => f.confirmed, f => f.rounds > 0 ? `${f.rounds} 轮对话${f.userMsgs > f.rounds ? `（补充 ${f.userMsgs - f.rounds} 条）` : ""}` : "尚未开始"],
    ["分析与验证", f => f.hasIdea, f => f.userTasks.length ? `${f.userTasks.filter(t => t.status === "recorded").length}/${f.userTasks.length} 项已记录` : (f.tasks.length ? "核对AI检索结果" : (f.hasIdea ? "清单待整理" : "先完成三轮对话"))],
    ["最终评估", f => f.hasIdea, f => f.hasFinal ? "已生成" : "可生成"],
  ];
  return `
  <div class="eyebrow">个人档案</div>
  <h1>你的经历与想法，都在这里</h1>
  <p class="muted">每个阶段都能回看，也能从上次停下的位置继续。回看不会让已完成的进度倒退。</p>
  ${confirmedPr ? `
  <details><summary>我的个人资料（已确认 v${sel.profile.history.length + 1}）</summary>
    <p class="tiny">${esc(JSON.stringify(confirmedPr.json).slice(0, 400))}…</p>
    <span class="tiny">编辑草稿与已确认画像分开保存；确认后生成新版本。</span>
  </details>` : '<p class="muted">尚未确认个人资料。</p>'}
  <div class="section">
    <h2>我的想法</h2>
    ${cards.length ? cards.map(c => cardHtml(c).replace('class="recent"', `class="recent${c.id === (sel && sel.id) ? " selected" : ""}"`)).join("") : '<p class="muted">还没有想法档案，去首页开始第一个。</p>'}
  </div>
  ${sel && selF ? `
  <div class="box">
    <h3>${esc(sel.title)}</h3>
    <p class="tiny">状态：${esc(sel.status)} · 最近保存 ${timeAgo(sel.updatedAt)}</p>
    ${stages.map(([label, avail, note], i) => `
      <div class="record">
        <div>${label}<small>${note(selF)}</small></div>
        <button ${avail(selF) ? "" : "disabled"} data-action="stage-goto" data-id="${sel.id}" data-i="${i}">回看 / 继续</button>
      </div>`).join("")}
    <div class="stack"><button class="primary" data-action="open" data-id="${sel.id}">继续这个想法</button></div>
    <details><summary>历史评估</summary>${sel.finalHistory.length ? sel.finalHistory.slice().reverse().map(h => `<p class="tiny">${new Date(h.at).toLocaleString("zh-CN")} · ${esc(h.verdict)}</p>`).join("") : '<p class="tiny">尚未生成评估。</p>'}</details>
  </div>` : ""}
  <div class="box soft">
    <span class="tag">本机数据</span>
    <p class="tiny">项目同时保存到本机 data/projects.json 和浏览器。请定期导出备份；没有多设备云同步。</p>
    <button class="danger" data-action="reset-data">清空本机项目记录</button>
  </div>`;
}

/* ---------- 渲染 ---------- */
function baseRender() {
  $("#ctx").textContent = VIEW === "archive" ? "随时回看，随时继续" : (VIEW_CTX[VIEW] || "让想法，一步步有戏。");
  document.querySelectorAll(".app-footer button").forEach(b => b.classList.toggle("active", b.dataset.nav === VIEW));
  renderSwitch();
  const main = $("#main");
  if ((config && !config.configured) || forceSetup) { main.innerHTML = viewSetup(); window.scrollTo(0, 0); return; }
  const p = cur();
  if (VIEW === "home") main.innerHTML = viewHome();
  else if (VIEW === "archive") main.innerHTML = viewArchive();
  else if (!p) main.innerHTML = '<p class="muted">先从首页开始一个新想法，或选择已有想法。</p>';
  else if (VIEW === "upload") main.innerHTML = viewUpload(p);
  else if (VIEW === "chat") main.innerHTML = viewChat(p);
  else if (VIEW === "analysis") main.innerHTML = viewAnalysis(p);
  else if (VIEW === "final") main.innerHTML = viewFinal(p);
  if (VIEW === "chat") window.scrollTo(0, document.documentElement.scrollHeight);
  else window.scrollTo(0, 0);
}
function renderSwitch() {
  const sel = $("#project-select");
  const next = $("#next-step");
  const cards = S.projects.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  if (!cards.length) {
    sel.style.display = "none";
    next.textContent = "还没有想法档案，从首页开始一个新想法";
    return;
  }
  sel.style.display = "";
  sel.innerHTML = cards.map(c => `<option value="${c.id}" ${c.id === S.currentId ? "selected" : ""}>${esc(c.title)} · ${phaseStatus(flags(c))}</option>`).join("");
  const p = cur();
  next.textContent = p ? `下一步：${nextStep(flags(p))}` : "选择一个想法档案开始";
}

/* ---------- 动作 ---------- */
function navigate(view) {
  const idx = STAGE_VIEWS.indexOf(view);
  const p = cur();
  if (idx >= 0 && p) { p.resumeStage = idx; save(); }
  VIEW = view;
  render();
}
function openProject(id, stageIdx) {
  const p = S.projects.find(x => x.id === id);
  if (!p) return;
  S.currentId = id;
  tempFile=files.get(id)||null;
  const target = typeof stageIdx === "number" ? stageIdx : Math.min(Math.max(p.resumeStage || 0, 0), 3);
  p.resumeStage=target;
  VIEW = STAGE_VIEWS[target];
  save();
  render();
}
function legacyActions(act, el) {
  const p = cur();
  switch (act) {
    case "new": {
      const np = newProj();
      S.projects.push(np);
      S.currentId = np.id;tempFile=null;
      VIEW = "upload";
      save();
      render();
      break;
    }
    case "open": {
      openProject(el.dataset.id);
      break;
    }
    case "stage-goto": {
      openProject(el.dataset.id, parseInt(el.dataset.i, 10));
      break;
    }
    case "confirm-profile": {
      if (!p.profile.current) break;
      const get = f => { const el2 = document.querySelector(`[data-f="${f}"]`); return el2 ? el2.value : ""; };
      const lines = v => v.split("\n").map(s => s.trim()).filter(Boolean);
      p.profile.current.json = {
        skills: lines(get("skills")), experiences: lines(get("experiences")),
        interests: lines(get("interests")), resources: lines(get("resources")),
        constraints: lines(get("constraints")),
        commitment: { time: get("time").trim(), budget: get("budget").trim() },
        unknowns: lines(get("unknowns")),
      };
      p.profile.current.confirmed = true;
      p.stageReached = Math.max(p.stageReached, 1);
      p.resumeStage = Math.max(p.resumeStage, 1);
      touch(p); save();
      toast("画像已确认，可以开始三轮对话");
      navigate("chat");
      break;
    }
    case "reupload": {
      if(p.profile.current)p.profile.history.push(structuredClone(p.profile.current));
      p.profile.current = null;
      p.resumeStage = 0;
      tempFile = null;
      save(); render();
      break;
    }
    case "edit-summary": {
      p.editingSummary = true;
      save(); render();
      break;
    }
    case "save-summary": {
      if (!p.idea.current) break;
      const val = id => { const el2 = $("#" + id); return el2 ? el2.value : ""; };
      const lines = v => v.split("\n").map(s => s.trim()).filter(Boolean);
      p.idea.history.push(p.idea.current);
      p.idea.version++;
      p.idea.current = {
        json: {
          title: val("s-title").trim().slice(0, 20),
          customer: val("s-customer").trim(),
          problem: val("s-problem").trim(),
          deliverable: val("s-deliverable").trim(),
          advantages: val("s-advantages").trim(),
          constraints: val("s-constraints").trim(),
          assumptions: lines(val("s-assumptions")),
          unknowns: lines(val("s-unknowns")),
        },
        source: "user",
      };
      if (p.idea.current.json.title) p.title = p.idea.current.json.title;
      p.editingSummary = false;
      p.resumeStage = Math.max(p.resumeStage, 2);
      touch(p); save(); render();
      toast("已保存为 v" + p.idea.version + "，旧版本保留");
      break;
    }
    case "goto-analysis": { navigate("analysis"); break; }
    case "toggle-task": {
      if (!p.analysis) break;
      const t = p.analysis.tasks[parseInt(el.dataset.i, 10)];
      if (!t) break;
      t.status = t.status === "recorded" ? "待收集" : "recorded";
      touch(p); save(); render();
      break;
    }
    case "add-task": {
      const input = $("#new-task");
      const v = input ? input.value.trim() : "";
      if (!v) { toast("先写验证项内容"); break; }
      if (!p.analysis) p.analysis = { tasks: [] };
      p.analysis.tasks.push({ text: v, status: "待收集" });
      touch(p); save(); render();
      break;
    }
    case "reset-data": {
      if (window.confirm("清空本机全部项目数据？不可恢复。")) {
        localStorage.removeItem(LS_KEY);
        S = loadState();
        VIEW = "home";
        render();
        toast("本机数据已重置");
      }
      break;
    }
  }
}

/* ---------- 事件绑定 ---------- */
document.addEventListener("click", e => {
  const nav = e.target.closest("[data-nav]");
  if (nav) { navigate(nav.dataset.nav); return; }
  const chip = e.target.closest(".chip");
  if (chip) {
    const p = cur();
    if (!p) return;
    if (busy.has(p.id)) { toast("AI 正在回复，请稍候"); return; }
    let lastAi = -1;
    p.messages.forEach((m, i) => { if (m.role === "assistant") lastAi = i; });
    const opt = p.messages[lastAi] && p.messages[lastAi].options && p.messages[lastAi].options[+chip.dataset.chip];
    if (!opt) return;
    p.chatDraft = opt;
    actions("send", chip);
    return;
  }
  const act = e.target.closest("[data-action]");
  if (act) { actions(act.dataset.action, act); }
});
document.addEventListener("input", e => {
  const p = cur();
  if (!p) return;
  if (e.target.id === "bio") {
    p.bioDraft = e.target.value;
    clearTimeout(draftTimer); draftTimer = setTimeout(save, 400);
  } else if (e.target.id === "chat-input") {
    p.chatDraft = e.target.value;
    clearTimeout(draftTimer); draftTimer = setTimeout(save, 400);
  }
});
$("#project-select").addEventListener("change", e => {
  if (e.target.value) openProject(e.target.value);
});



/* ---------- Live local backend ---------- */
let token='', config=null, saveTimer=null, saveChain=Promise.resolve(), saveStatus='正在连接本地服务';
const files=new Map(),busy=new Set();
const clone=x=>JSON.parse(JSON.stringify(x));
function save(){browserSave();saveStatus='保存中';clearTimeout(saveTimer);saveTimer=setTimeout(()=>syncState(),350);updateSave();}
function syncState(){clearTimeout(saveTimer);const snapshot=JSON.stringify(S);saveChain=saveChain.catch(()=>{}).then(async()=>{await post('/api/state',JSON.parse(snapshot));saveStatus='已保存到本机';updateSave();}).catch(e=>{saveStatus='未同步：'+e.message;updateSave();});return saveChain;}
function updateSave(){const e=$('#save-status');if(e)e.textContent=saveStatus;}
async function post(url,data){const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Youxi-Token':token},body:JSON.stringify(data)});const json=await res.json();if(!res.ok)throw Error(json.error||'本地请求失败');return json;}
function context(p){return {projectId:p.id,profile:p.profile.current?.json||{},messages:p.messages.map(m=>({role:m.role,content:m.content})),idea:p.idea.current?.json||{},analysis:p.analysis||{},researchNotice:'ai_research任务的searchResults为机器检索结果，未经人工核验；sources为系统或用户登记。'};}
async function ai(p,kind,input){return (await post('/api/ai',{kind,input,requestId:crypto.randomUUID()})).result;}
async function runResearch(p,onlyIdx){if(!(config&&config.search&&config.search.provider)||!p.analysis)return;let n=0;for(let i=0;i<p.analysis.tasks.length;i++){const t=p.analysis.tasks[i];if(t.owner!=='ai_research')continue;if(onlyIdx!==undefined&&i!==onlyIdx)continue;if(onlyIdx===undefined&&n>=3)break;n++;t.searchStatus='检索中';if(cur()?.id===p.id)render();try{const q=((p.idea.current&&p.idea.current.json.title?p.idea.current.json.title+' ':'')+t.text).slice(0,180);const res=await post('/api/search',{query:q});t.searchResults=res.results;t.searchStatus='done';t.searchError='';}catch(e){t.searchStatus='failed';t.searchError=e.message;}touch(p);save();}}
function invalidate(p,upstream=true){p.reportStale=!!p.finalHistory.length;if(upstream)p.analysisStale=!!p.analysis;}
function render(){baseRender();const p=cur();if(p&&busy.has(p.id)){const list=document.querySelector('.chat-list');if(VIEW==='chat'&&list){list.insertAdjacentHTML('beforeend','<div class="msg ai typing" role="status"><div class="bubble"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div></div>');const sb=document.querySelector('[data-action="send"]');if(sb)sb.textContent='回复中…';window.scrollTo(0,document.documentElement.scrollHeight);}else{$('#main').insertAdjacentHTML('afterbegin','<p class="box soft" role="status">DeepSeek 正在处理此想法…可以切换其他档案，结果只写回原项目。</p>');}$('#main').querySelectorAll('input,textarea,button').forEach(e=>e.disabled=true);}updateSave();}
function viewSetup(){
  const has = !!(config && config.configured);
  return `<div class="eyebrow">首次使用</div>
  <h1>配置 DeepSeek API Key</h1>
  <p class="muted">本项目不内置任何密钥。请粘贴你自己的 DeepSeek API Key（在 platform.deepseek.com 的 API Keys 页面创建）。Key 只会写入本机 .env 文件：不进 Git 仓库，也不会发送给 DeepSeek 以外的任何一方。</p>
  <label class="field">DeepSeek API Key<input id="key-input" type="text" autocomplete="off" spellcheck="false" placeholder="sk-..." maxlength="120"></label>
  <div class="stack">
    <button class="primary" data-action="save-key">保存到本机 .env</button>
    ${has ? '<button data-action="cancel-setup">取消</button>' : ''}
  </div>
  <p class="tiny">保存后即可使用解析、对话、分析与评估；也可以改为直接编辑 .env 填写 DEEPSEEK_API_KEY 后重启。文件解析在本机进行，点击 AI 按钮时相关内容才会发送给 DeepSeek。</p>
  ${has ? '' : '<p class="tiny">暂时没有 Key 也可以浏览界面；运行 python -m unittest discover -s tests 可验证服务逻辑，不消耗额度。</p>'}`;
}
function viewHome(){const cards=S.projects.slice().sort((a,b)=>b.updatedAt-a.updatedAt);return `<h1>让你的想法，<br>一步步有戏。</h1><p class="muted">从个人经历到真实验证，DeepSeek 帮你梳理下一步。</p><div class="stack"><button class="primary" data-action="new">＋ 开始一个新想法</button></div><h2>最近的想法</h2>${cards.slice(0,3).map(cardHtml).join('')||'<p>从第一个想法开始。</p>'}<div class="box soft"><p>${config&&config.search&&config.search.provider?'资料解析、对话、六维分析、评估与公开检索已接入 DeepSeek；检索结果未经人工核验。':'资料解析、对话、六维分析与评估已接入 DeepSeek。联网检索未配置，可自行登记公开来源。'}</p><p class="tiny">文件文字在本机提取，点击 AI 按钮时才发送当前相关内容至 DeepSeek。切换页面与档案不产生模型调用。</p><p class="tiny">模型请求数默认不限（.env 的 DAILY_REQUEST_LIMIT 可设上限）；余额与扣费以 DeepSeek 账户为准。</p></div><button data-action="export">导出全部项目备份</button><button data-action="setup-key">更换 DeepSeek Key</button>`;}
function viewAnalysis(p){if(!p.idea.current)return '<p>请先完成对话并生成想法摘要。</p>';const a=p.analysis;
 if(!a)return `<div class="eyebrow">3 / 分析与验证</div><h1>${esc(p.title)}</h1><div class="stack"><button class="primary" data-action="analyze">生成 DeepSeek 六维分析</button></div><p class="tiny">分析会把任务分成两类：「需要你亲自验证」和「AI 可公开检索」，让你把时间花在最关键的地方。</p>${p.analysisHistory?.length?`<details><summary>历史分析与验证记录（${p.analysisHistory.length}份）</summary>${p.analysisHistory.map(h=>`<pre>${esc(JSON.stringify(h,null,2))}</pre>`).join('')}</details>`:''}`;
 const userTasks=a.tasks.map((t,i)=>[t,i]).filter(x=>x[0].owner!=='ai_research');
 const aiTasks=a.tasks.map((t,i)=>[t,i]).filter(x=>x[0].owner==='ai_research');
 const aiDone=aiTasks.filter(x=>x[0].searchStatus==='done').length;
 const searchOn=!!(config&&config.search&&config.search.provider);
 return `<div class="eyebrow">3 / 分析与验证</div><h1>${esc(p.title)}</h1>${p.analysisStale?'<p class="box">想法或画像已变更，下方旧分析需更新。</p>':''}<div class="stack"><button class="primary" data-action="analyze">更新 DeepSeek 六维分析</button></div>${p.analysisHistory?.length?`<details><summary>历史分析与验证记录（${p.analysisHistory.length}份）</summary>${p.analysisHistory.map(h=>`<pre>${esc(JSON.stringify(h,null,2))}</pre>`).join('')}</details>`:''}<div class="box soft">${esc(a.overview||'')}</div><details><summary>六维分析</summary>${(a.dimensions||[]).map(d=>`<h3>${esc(d.name)}</h3><p>${esc(d.finding)}</p><p class="tiny">依据：${esc(d.evidence)}<br>待确认：${esc(d.unknown)}</p>`).join('')}</details>
 <h2>需要你亲自验证</h2><p class="tiny">公开资料查不到的部分：真实客户的原话与行为、真实成本与渠道。AI 检索替代不了这一步，也是整个验证里最值钱的证据。</p>
 ${userTasks.length?userTasks.map(([t,i])=>`<details><summary>${esc(t.id||'T'+(i+1))} · ${esc(t.text)} · ${t.finding?'已填写':'待验证'}</summary><p>假设：${esc(t.hypothesis||'')}</p><p>${esc(t.method||'')}</p><p class="tiny">所需证据：${esc(t.requiredEvidence||'请记录实际发现，不能只打勾')}</p><label class="field">发现、原话或具体行为<textarea rows="4" data-task="${i}" data-prop="finding">${esc(t.finding||'')}</textarea></label><label class="field">来源链接或出处（未自动核验）<textarea rows="2" data-task="${i}" data-prop="sources">${esc(t.sources||'')}</textarea></label><label class="field">你的暂定理解<select data-task="${i}" data-prop="signal">${['仍不确定','支持','不支持'].map(v=>`<option ${t.signal===v?'selected':''}>${v}</option>`).join('')}</select></label></details>`).join(''):'<p class="muted">本次分析未生成需要亲自验证的任务，可更新分析。</p>'}
 ${aiTasks.length?`<details ${aiDone<aiTasks.length?'open':''}><summary>AI 公开检索（${aiDone}/${aiTasks.length} 已完成）</summary><p class="tiny">${searchOn?'AI 自动检索公开资料并登记来源与摘录；结果未经人工核验，请点开链接自行确认后再采信。':'检索服务未配置：在 .env 填 TAVILY_API_KEY，或 pip install ddgs 后重启。以下任务需手动查证登记。'}</p>${aiTasks.map(([t,i])=>`<details><summary>${esc(t.id||'T'+(i+1))} · ${esc(t.text)} · ${t.searchStatus==='done'?'✓ 已检索':t.searchStatus==='failed'?'检索失败':t.searchStatus==='检索中'?'检索中…':'待检索'}</summary><p class="tiny">假设：${esc(t.hypothesis||'')}</p><p class="tiny">${esc(t.method||'')}</p>${(t.searchResults||[]).map(r=>`<p class="src"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title||r.url)}</a><br><span class="tiny">${esc(r.snippet||'')}</span></p>`).join('')}${t.searchStatus==='failed'?`<p class="tiny">失败原因：${esc(t.searchError||'')}</p>`:''}${searchOn?`<div class="stack"><button data-action="research-task" data-i="${i}">${t.searchStatus==='done'?'重新检索':'重试检索'}</button></div>`:''}<label class="field">补充来源或笔记<textarea rows="2" data-task="${i}" data-prop="sources">${esc(t.sources||'')}</textarea></label></details>`).join('')}</details>`:''}
 <div class="stack"><button class="primary" data-action="gen-final">综合全部内容，生成评估</button></div><p class="tiny">未填完也可评估，但报告必须指出证据缺口。切换档案会保留已填写内容。</p>`;}
function reportHtml(r){return `<div class="box"><h2>${esc(r.verdict)}</h2><p>${esc(r.reason)}</p>${(r.findings||[]).map(f=>`<p>${esc(f.claim)} <small>［${esc(f.evidenceIds.join('、'))}］</small><br><span class="tiny">${esc(f.uncertainty)}</span></p>`).join('')}<h3>风险与未知</h3><ul>${[...(r.risks||[]),...(r.unknowns||[])].map(x=>`<li>${esc(x)}</li>`).join('')}</ul><h3>下一步</h3><ul>${(r.nextSteps||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`;}
function viewFinal(p){const r=p.finalHistory.at(-1);return `<div class="eyebrow">4 / 最终评估</div><h1>${esc(p.title)}</h1>${p.reportStale?'<p class="box">输入已有变化，此报告已过期。请重新生成。</p>':''}${r?reportHtml(r):'<p>尚未生成报告。</p>'}<div class="stack"><button class="primary" data-action="gen-final">${r?'重新生成':'生成'} DeepSeek 评估</button><button data-nav="analysis">返回补充验证</button><button data-action="shelve">我选择搁置并保留档案</button></div>${p.finalHistory.length>1?`<details><summary>历史完整报告（${p.finalHistory.length-1}份）</summary>${p.finalHistory.slice(0,-1).reverse().map(h=>`<details><summary>${new Date(h.at).toLocaleString()} · ${esc(h.verdict)}</summary>${reportHtml(h)}<pre>${esc(JSON.stringify(h.snapshot||{},null,2))}</pre></details>`).join('')}</details>`:''}<p class="tiny">AI建议供你判断；可小范围落地不代表创业成功保证。</p>`;}
const originalViewUpload=viewUpload;
viewUpload=function(p){let html=originalViewUpload(p);if(p.profile.draft&&p.profile.current){const original=p.profile.current;p.profile.current={...original,json:p.profile.draft};html=originalViewUpload(p);p.profile.current=original;}if(p.profile.history.length)html+=`<details><summary>查看历史画像</summary>${p.profile.history.map(x=>`<pre>${esc(JSON.stringify(x.json,null,2))}</pre>`).join('')}</details>`;return html;};
const originalViewChat=viewChat;
viewChat=function(p){const original=p.idea.current;if(p.summaryDraft&&original)p.idea.current={...original,json:p.summaryDraft};let html=originalViewChat(p);p.idea.current=original;if(p.idea.history.length)html+=`<details><summary>历史想法摘要</summary>${p.idea.history.map(x=>`<pre>${esc(JSON.stringify(x.json,null,2))}</pre>`).join('')}</details>`;return html;};
async function actions(act,el){const p=cur();if(act==='export'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(S,null,2)],{type:'application/json'}));a.download='youxi-projects.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);return;}
 if(act==='setup-key'){forceSetup=true;render();return;}
 if(act==='cancel-setup'){forceSetup=false;render();return;}
 if(act==='save-key'){const v=($('#key-input')?.value||'').trim();if(!v)return toast('请先粘贴 Key（sk- 开头）');try{await post('/api/key',{key:v});if(config)config.configured=true;forceSetup=false;render();toast('Key 已保存到本机 .env，仅本机可见');}catch(e){toast(e.message);}return;}
 if(act==='shelve'){p.status='已搁置';touch(p);save();navigate('archive');return;}
 if(act==='research-task'){if(!p||!p.analysis)return;busy.add(p.id);render();try{await runResearch(p,+el.dataset.i);}finally{busy.delete(p.id);render();}return;}
 if(p&&busy.has(p.id)&&!['new','open','stage-goto'].includes(act)){toast('本项目正在处理，请稍后');return;}
 if(['parse','start-chat','send','gen-summary','analyze','gen-final'].includes(act)){
  if(!p)return;let sendText='',parseInput;
  if(act==='parse'){const file=files.get(p.id);parseInput=[file?.text||'',p.bioDraft||''].filter(Boolean).join('\n');if(!parseInput.trim())return toast('请上传资料或填写介绍');}
  if(act==='send'){sendText=p.chatDraft.trim();if(!sendText)return toast('先写一句想法');}
  if(act==='gen-summary'&&flags(p).rounds<3)return toast('请先完成三轮对话');
  if(['analyze','gen-final'].includes(act)&&!p.idea.current)return toast('请先生成想法摘要');
  busy.add(p.id);render();
  try{
   if(act==='parse'){const j=await ai(p,'parse',{text:parseInput});if(p.profile.current)p.profile.history.push(clone(p.profile.current));const file=files.get(p.id);p.profile.current={json:j,sourceType:file?'file+bio':'bio',fileName:file?.name||'',rawText:file?.text||'',bio:p.bioDraft,confirmed:false};p.profile.draft=null;invalidate(p);}
   if(act==='start-chat'){const r=await ai(p,'chat',{...context(p),instruction:'开始第1轮：先简短热情地打招呼，点出画像中2-3个具体亮点，说明接下来用三轮对话帮他确定一个方向并迈出第一步；如有初步方向建议放进options；最后只问一个最关键的问题。'});p.messages.push({role:'assistant',content:r.reply,round:null,isOpening:true,options:Array.isArray(r.options)?r.options:[]});}
   if(act==='send'){const f=flags(p);const msg={role:'user',content:sendText,round:f.rounds<3?f.rounds+1:null};const r=await ai(p,'chat',{...context(p),messages:[...p.messages,msg],round:msg.round,request:'回应最后一条用户消息。用户含糊、犹豫或想跳过时，基于其背景给出2-3个具体候选方向放入options（各附一句理由），说明选一个先聊、随时可换；用户点选某选项即视为选定该方向，继续深入并推进到下一个关键问题。三轮结束后提示可以生成摘要。'});p.messages.push(msg,{role:'assistant',content:r.reply,round:null,options:Array.isArray(r.options)?r.options:[]});p.chatDraft='';invalidate(p);}
   if(act==='gen-summary'){const r=await ai(p,'summary',context(p));if(p.idea.current)p.idea.history.push(clone(p.idea.current));p.idea.current={json:r,source:'deepseek'};p.idea.version++;p.title=r.title;p.editingSummary=true;p.summaryDraft=null;invalidate(p);}
   if(act==='analyze'){const r=await ai(p,'analysis',context(p));if(p.analysis)(p.analysisHistory??=[]).push(clone(p.analysis));p.analysis={...r,tasks:r.tasks.map((t,i)=>({...t,id:'T'+(i+1),finding:'',sources:'',signal:'仍不确定',status:'待收集',searchStatus:'待检索',searchResults:[],searchError:''}))};p.analysisStale=false;p.reportStale=!!p.finalHistory.length;p.stageReached=Math.max(2,p.stageReached);p.resumeStage=2;await runResearch(p);}
   if(act==='gen-final'){const snap=context(p);const r=await ai(p,'evaluate',snap);p.finalHistory.push({...r,at:now(),snapshot:clone(snap)});p.reportStale=false;p.stageReached=3;p.resumeStage=3;if(cur()?.id===p.id)VIEW='final';}
   touch(p);save();if(cur()?.id===p.id)toast('DeepSeek 已完成，内容已保存');
  }catch(e){toast(e.message+'；输入和旧结果已保留。');}
  finally{busy.delete(p.id);render();}return;
 }
 if(act==='confirm-profile'&&p.profile.current){p.profile.history.push(clone(p.profile.current));legacyActions(act,el);p.profile.draft=null;invalidate(p);save();return;}
 if(act==='save-summary'){legacyActions(act,el);p.summaryDraft=null;invalidate(p);save();return;}
 if(act==='reupload')invalidate(p);
 if(act==='reset-data'){if(busy.size)return toast('请先等待正在进行的AI请求完成');if(!confirm('清空本机所有项目？请先导出备份。'))return;S={projects:[],currentId:null};files.clear();tempFile=null;save();navigate('home');return;}
 legacyActions(act,el);
}
document.addEventListener('input',e=>{const p=cur();if(!p||busy.has(p.id))return;
 if(e.target.dataset.f&&p.profile.current){p.profile.draft??=clone(p.profile.current.json);const k=e.target.dataset.f;const v=e.target.value;if(['time','budget'].includes(k))p.profile.draft.commitment[k]=v;else p.profile.draft[k]=v.split('\n').filter(Boolean);save();}
 if(e.target.id.startsWith('s-')&&p.idea.current){p.summaryDraft??=clone(p.idea.current.json);const k=e.target.id.slice(2);p.summaryDraft[k]=['assumptions','unknowns'].includes(k)?e.target.value.split('\n').filter(Boolean):e.target.value;save();}
 if(e.target.dataset.task!==undefined){const t=p.analysis.tasks[+e.target.dataset.task];t[e.target.dataset.prop]=e.target.value;t.status=t.finding.trim()?'recorded':'待收集';invalidate(p,false);touch(p);save();}
});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='key-input'){e.preventDefault();actions('save-key',e.target);}});
document.addEventListener('change',async e=>{if(e.target.id!=='file-input')return;const p=cur(),f=e.target.files?.[0];if(!f||!p)return;if(f.size>3*1024*1024)return toast('文件最多3MB');try{const bytes=new Uint8Array(await f.arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));const result=await post('/api/extract',{name:f.name,data:btoa(raw)});files.set(p.id,{name:f.name,text:result.text});p.fileDraft={name:f.name,text:result.text};if(cur()?.id===p.id){tempFile=files.get(p.id);render();}save();toast('已在本机提取文字；点击解析才会发送给DeepSeek');}catch(err){toast(err.message);}});
window.addEventListener('pagehide',()=>{browserSave();if(token)fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json','X-Youxi-Token':token},body:JSON.stringify(S),keepalive:true}).catch(()=>{});});
async function boot(){try{config=await(await fetch('/api/config')).json();token=config.csrf;if(!token)throw Error('本地服务未就绪');const res=await fetch('/api/state');const stored=await res.json();if(!res.ok)throw Error(stored.error);if(stored?.projects)S=stored;for(const p of S.projects){if(p.fileDraft)files.set(p.id,p.fileDraft);if(p.analysis)p.analysis.tasks.forEach((t,i)=>{t.id??='T'+(i+1);t.finding??='';t.sources??='';t.owner??='user';t.searchStatus??=(t.owner==='ai_research'?'待检索':'');t.searchResults??=[];});}tempFile=files.get(S.currentId)||null;saveStatus='已连接本机存储';const bar=document.querySelector('.demo-bar');if(bar)bar.textContent=config.search&&config.search.provider?'DeepSeek 本地版 · AI按钮会调用模型 · AI公开检索已接入（结果未人工核验）':'DeepSeek 本地版 · AI按钮会调用模型 · 公开检索未配置';render();}catch(e){$('#main').innerHTML='<h1>请从本地服务启动</h1><p>'+esc(e.message)+'</p><p>运行项目中的 start.command，不要直接打开HTML。</p>';}}
boot();
