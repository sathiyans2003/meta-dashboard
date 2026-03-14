const API = (window.location.protocol === "file:" || window.location.hostname === "" || window.location.hostname === "localhost") ? "http://localhost:4000/api" : window.location.origin + "/api";
const WS  = (window.location.protocol === "file:" || window.location.hostname === "" || window.location.hostname === "localhost") ? "ws://localhost:4000" : (window.location.protocol === "https:" ? "wss://" : "ws://") + window.location.host;

let ws = null, data = null, reconn = null;
let currentToken = null;
let currentAccountId = null;
let allAccounts = [];
let selectedCampaignIds = new Set();
let currentSearchData = { camp: "", adset: "", ad: "" };
let currentStatusFilter = { camp: "ALL", adset: "ALL", ad: "ALL" };
let currentSort = {
  camp: { k: "spend", dir: "desc" },
  adset: { k: "spend", dir: "desc" },
  ad: { k: "spend", dir: "desc" }
};

// ══════════════════════════════════════════════════════════════
// INITIAL AUTH CHECK
// ══════════════════════════════════════════════════════════════
window.onload = async () => {
  loadColPrefs();
  try {
    const r = await fetch(`${API}/status`);
    const s = await r.json();
    if (!s.connected) {
      window.location.href = "index.html"; // Not connected, go to login
    } else {
      currentToken = s.config.token;
      currentAccountId = s.config.accountId;
      allAccounts = s.allAccounts || [];
      
      // Update UI with existing status
      updateSidebarAccount(s.account);
      updateAccountSwitcher(s.config.accountId);
      if (s.config.datePreset) {
        document.getElementById("datePresetSel").value = s.config.datePreset;
      }
      
      // Start WebSocket
      connect();
    }
  } catch(e) {
    console.error("Status check failed:", e);
  }
};

// ══════════════════════════════════════════════════════════════
// ACCOUNT SWITCHER
// ══════════════════════════════════════════════════════════════
function updateAccountSwitcher(activeId) {
  const lbl = document.getElementById("accSwitchLabel");
  const list = document.getElementById("accountSwitcherList");
  if (!lbl || !list) return;

  if (!allAccounts || !allAccounts.length) {
    lbl.textContent = "No accounts";
    list.innerHTML = `<div style="padding:10px 12px;color:var(--muted);font-size:12px;">No accounts found</div>`;
    return;
  }
  
  const activeAcc = allAccounts.find(a => a.id === activeId) || allAccounts[0];
  lbl.textContent = activeAcc ? activeAcc.name : "Select Account";

  renderAccList(allAccounts, activeId);
}

function renderAccList(accounts, activeId) {
  const list = document.getElementById("accountSwitcherList");
  if (!list) return;
  list.innerHTML = accounts.map(a => `
    <div class="acc-list-item ${a.id === activeId ? 'active' : ''}" onclick="switchAccount('${a.id.replace('act_','')}')" style="display:flex; justify-content:space-between; align-items:center;">
      <div>
        <div class="acc-list-name">${a.name}</div>
        <div class="acc-list-id">${a.id} · ${a.currency || ''}</div>
      </div>
      <div style="font-size:10px; color:var(--muted); text-align:right;">
        ${a.timezone_name || a.timezone || ''}
      </div>
    </div>
  `).join("");
}

function filterAccounts() {
  const q = document.getElementById("accSearch")?.value.toLowerCase() || "";
  if (!q) {
    renderAccList(allAccounts, currentAccountId);
    return;
  }
  const filtered = allAccounts.filter(a => 
    (a.name && a.name.toLowerCase().includes(q)) || 
    (a.id && a.id.toLowerCase().includes(q))
  );
  renderAccList(filtered, currentAccountId);
}

function openAccountModal() {
  document.getElementById("accModalOverlay").classList.add("show");
  document.getElementById("accSearchInp").value = "";
  renderAccList(allAccounts, currentAccountId);
  setTimeout(() => document.getElementById("accSearchInp").focus(), 100);
}

function closeAccountModal() {
  document.getElementById("accModalOverlay").classList.remove("show");
}

function filterAccounts() {
  const q = document.getElementById("accSearchInp")?.value.toLowerCase() || "";
  if (!q) {
    renderAccList(allAccounts, currentAccountId);
    return;
  }
  const filtered = allAccounts.filter(a => 
    (a.name && a.name.toLowerCase().includes(q)) || 
    (a.id && a.id.toLowerCase().includes(q))
  );
  renderAccList(filtered, currentAccountId);
}

async function switchAccount(newAccountId) {
  closeAccountModal();
  const fullId = "act_" + newAccountId;
  if (!newAccountId || fullId === currentAccountId) return;
  
  setStatus("wait");
  // Immediate UI feedback
  if (document.getElementById("overviewAccName")) {
    document.getElementById("overviewAccName").textContent = "Switching account...";
    document.getElementById("overviewAccId").textContent = fullId;
  }
  
  try {
    const res = await fetch(`${API}/connect`, {
      method: "POST", 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        token: currentToken, 
        accountId: fullId, 
        datePreset: document.getElementById("datePresetSel").value 
      })
    });
    const json = await res.json();
    if (!json.ok) {
      alert("Failed to switch account: " + json.error);
      // Revert title if failed
      updateSidebarAccount(allAccounts.find(a => a.id === currentAccountId));
    } else {
      currentAccountId = fullId;
      updateAccountSwitcher(fullId);
    }
  } catch(e) {
    alert("Error switching account: " + e.message);
  }
}

// ══════════════════════════════════════════════════════════════
// TAB ROUTING & SIDEBAR
// ══════════════════════════════════════════════════════════════
document.querySelectorAll(".nav-link").forEach(a => {
  if (a.getAttribute("href") && a.getAttribute("href") !== "#") return; // Ignore links like explorer.html
  
  a.addEventListener("click", e => {
    e.preventDefault();
    const tab = a.dataset.tab;
    if (!tab) return;
    document.querySelectorAll(".nav-link").forEach(x => x.classList.remove("active"));
    document.querySelectorAll(".pane").forEach(x => x.classList.remove("active"));
    a.classList.add("active");
    const pane = document.getElementById(`tab-${tab}`);
    if (pane) pane.classList.add("active");
    const titles = { overview:"Overview", campaigns:"Campaigns", adsets:"Ad Sets", ads:"Ads" };
    document.getElementById("pageH1").textContent = titles[tab] || tab;
    if (data) renderTab(tab);
  });
});

function toggleSidebar() { document.getElementById("sidebar").classList.toggle("open"); }

function handleDateChange(v) {
  const wrap = document.getElementById("customDateWrap");
  if (v === "custom") {
    wrap.style.display = "flex";
  } else {
    wrap.style.display = "none";
    changeDatePreset(v);
  }
}

async function applyCustomDate() {
  const since = document.getElementById("startDate").value;
  const until = document.getElementById("endDate").value;
  if (!since || !until) return alert("Select both dates");
  
  setStatus("wait");
  try {
    await fetch(`${API}/daterange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ datePreset: { since, until } })
    });
  } catch (err) {
    alert("Date range update failed: " + err.message);
  }
}

async function changeDatePreset(v) {
  setStatus("wait");
  try { 
    await fetch(`${API}/daterange`, { 
      method: "POST", 
      headers: { "Content-Type": "application/json" }, 
      body: JSON.stringify({ datePreset: v }) 
    }); 
  } catch(e) {
    console.error("Date change failed:", e);
  }
}

// ══════════════════════════════════════════════════════════════
// WEBSOCKET
// ══════════════════════════════════════════════════════════════
function connect() {
  clearTimeout(reconn);
  try { ws = new WebSocket(WS); } catch(_) { scheduleReconn(); return; }

  ws.onopen  = () => setStatus("ok");
  ws.onclose = () => { setStatus("err"); scheduleReconn(); };
  ws.onerror = () => { setStatus("err"); };

  ws.onmessage = e => {
    try {
      const msg = JSON.parse(e.data);

      if (msg.type === "data") {
        data = msg.data;
        onData(msg);
      }

      if (msg.type === "connected") {
        if (msg.config?.token) currentToken = msg.config.token;
        if (msg.accountInfo?.id) currentAccountId = msg.accountInfo.id;
        if (msg.accountInfo?.allAccounts) {
          allAccounts = msg.accountInfo.allAccounts;
          updateAccountSwitcher(currentAccountId);
        }
        updateSidebarAccount(msg.accountInfo);
      }

      if (msg.type === "status") {
        if (msg.status === "fetching") setStatus("wait");
        if (msg.status === "error")    setStatus("err");
        if (msg.status === "waiting_for_token") {
          window.location.href = "index.html";
        }
      }

      if (msg.type === "disconnected") {
        data = null; currentToken = null; currentAccountId = null;
        window.location.href = "index.html";
      }

      if (msg.type === "countdown") {
        document.getElementById("syncTime").textContent = `Next sync: ${msg.remaining}s`;
      }
    } catch(_) {}
  };

  setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ type:"ping" })); }, 15000);
}

function scheduleReconn() { reconn = setTimeout(connect, 5000); }

async function disconnectFacebook() {
  if (!confirm("Disconnect pandhal ellaa data clear aagum. Continue?")) return;
  try {
    const res = await fetch(`${API}/disconnect`, { method:"POST" });
    const json = await res.json();
    if (json.ok) window.location.href = "index.html";
    else alert("Disconnect failed: " + (json.error || "Unknown error"));
  } catch(err) { alert("Error: " + err.message); }
}

function setStatus(s) {
  const dot = document.getElementById("liveDot");
  const lbl = document.getElementById("liveLabel");
  if(dot) dot.className = "live-dot" + (s==="err" ? " err" : s==="wait" ? " wait" : "");
  if(lbl) {
    lbl.className = "live-label" + (s==="err" ? " err" : s==="wait" ? " wait" : "");
    lbl.textContent = s==="ok" ? "Live" : s==="wait" ? "Updating..." : "Disconnected";
  }
}

function updateSidebarAccount(acc) {
  if (!acc) return;
  document.getElementById("pageDesc").textContent = `${acc.name || ""} · ${acc.currency || ""}`;
  document.getElementById("sidebarAccName").textContent = acc.name || "—";
  document.getElementById("sidebarAccId").textContent   = acc.id   || "—";
  if (document.getElementById("sidebarAccTz")) {
    document.getElementById("sidebarAccTz").textContent = acc.timezone || "—";
  }
  
  // Also update Overview Tab banner
  if (document.getElementById("overviewAccName")) {
    document.getElementById("overviewAccName").textContent = acc.name || "—";
    document.getElementById("overviewAccId").textContent   = acc.id   || "—";
    document.getElementById("overviewAccTz").textContent   = acc.timezone || "—";
  }
}

// ══════════════════════════════════════════════════════════════
// DATA RENDER
// ══════════════════════════════════════════════════════════════
function onData(msg) {
  setStatus("ok");
  const { runCount: rc } = msg;
  document.getElementById("runCount").textContent = `Run #${rc}`;
  
  const cLive = data.campaigns.filter(c => c.status === "ACTIVE").length;
  const cOff = data.campaigns.filter(c => c.status === "PAUSED").length;
  const sLive = data.adsets.filter(s => s.status === "ACTIVE").length;
  const sOff = data.adsets.filter(s => s.status === "PAUSED").length;
  const aLive = data.ads.filter(a => a.status === "ACTIVE").length;
  const aOff = data.ads.filter(a => a.status === "PAUSED").length;

  document.getElementById("pageDesc").textContent =
    `${data.campaigns.length} Campaigns (${cLive} Live) · ${data.adsets.length} Ad Sets · ${data.ads.length} Ads (${aLive} Live)`;
    
  applySelectionFilter(); // Update summary if selection exists
  const activeTab = document.querySelector(".nav-link.active")?.dataset?.tab || "overview";
  renderTab(activeTab);
}

function applySelectionFilter() {
  if (!data) return;
  const clearBtn = document.getElementById("clearSelectionBtn");
  if (clearBtn) clearBtn.style.display = selectedCampaignIds.size > 0 ? "flex" : "none";

  const selBar = document.getElementById("selectionBar");
  if (selectedCampaignIds.size === 0) {
    if (selBar) selBar.classList.remove("active");
    renderOverview(data.summary);
    return;
  }

  if (selBar) selBar.classList.add("active");

  const selectedCamps = data.campaigns.filter(c => selectedCampaignIds.has(c.id));
  if (selectedCamps.length === 0) {
    if (selBar) selBar.classList.remove("active");
    renderOverview(data.summary);
    return;
  }

  // Aggregate stats
  let s = {
    spend: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0,
    purchases: 0, purchaseValue: 0, leads: 0, messagingConversations: 0, results: 0,
    postEngagement: 0, v100: 0, videoViews: 0, landingPageViews: 0, uniqueClicks: 0
  };

  selectedCamps.forEach(c => {
    Object.keys(s).forEach(k => {
      s[k] += parseFloat(c[k] || 0);
    });
  });

  // Calculate Averages
  s.ctr = s.impressions > 0 ? ((s.clicks / s.impressions) * 100).toFixed(2) : "0.00";
  s.cpc = s.clicks > 0 ? (s.spend / s.clicks).toFixed(2) : "0.00";
  s.cpm = s.impressions > 0 ? (s.spend / (s.impressions / 1000)).toFixed(2) : "0.00";
  s.purchaseRoas = s.spend > 0 ? (s.purchaseValue / s.spend).toFixed(2) : "0.00";
  s.resultRate = s.impressions > 0 ? ((s.results / s.impressions) * 100).toFixed(2) : "0.00";
  s.costPerResult = s.results > 0 ? (s.spend / s.results).toFixed(2) : "0.00";
  s.costPerPurchase = s.purchases > 0 ? (s.spend / s.purchases).toFixed(2) : "0.00";
  s.costPerLead = s.leads > 0 ? (s.spend / s.leads).toFixed(2) : "0.00";
  s.costPerConversation = s.messagingConversations > 0 ? (s.spend / s.messagingConversations).toFixed(2) : "0.00";
  s.frequency = s.reach > 0 ? (s.impressions / s.reach).toFixed(2) : "1.00";
  s.uniqueCtr = s.reach > 0 ? ((s.uniqueClicks / s.reach) * 100).toFixed(2) : "0.00";

  // Update selection bar UI
  if (document.getElementById("selCount")) {
    document.getElementById("selCount").textContent = `${selectedCampaignIds.size} Selected`;
    document.getElementById("selSpend").textContent = `₹${fmtM(s.spend)}`;
    document.getElementById("selResults").textContent = fmtBig(s.results);
    document.getElementById("selRoas").textContent = `${s.purchaseRoas}×`;
  }

  renderOverview(s, true); // true means it's a filtered view
}



function getActiveCols(tab) {
  const all = { camp: campCols, adset: adsetCols, ad: adCols }[tab];
  const ids = activeColIds[tab] || [];
  const valid = ids.map(id => all.find(c => c.k === id)).filter(Boolean);
  return valid.length ? valid : all; // fallback to all if empty
}

function renderTab(tab) {
  if (!data) return;
  if (tab === "overview")   applySelectionFilter();
  if (tab === "campaigns")  renderTable("camp",  getFilteredData("camp"), getActiveCols("camp"));
  if (tab === "adsets")     renderTable("adset", getFilteredData("adset"), getActiveCols("adset"));
  if (tab === "ads")        renderTable("ad",    getFilteredData("ad"), getActiveCols("ad"));
}

function getFilteredData(tabPrefix) {
  const map = { camp: "campaigns", adset: "adsets", ad: "ads" };
  let rows = data[map[tabPrefix]] || [];
  
  // 1. Search Query
  const q = currentSearchData[tabPrefix];
  if (q) {
    rows = rows.filter(r => 
      (r.name && r.name.toLowerCase().includes(q)) || 
      (r.id && r.id.toLowerCase().includes(q))
    );
  }
  
  // 2. Status Filter
  const s = currentStatusFilter[tabPrefix];
  if (s !== "ALL") {
    rows = rows.filter(r => {
      const rs = String(r.status).toUpperCase();
      if (s === "ACTIVE") return rs === "ACTIVE";
      if (s === "PAUSED") return rs === "PAUSED";
      if (s === "ARCHIVED") return rs !== "ACTIVE" && rs !== "PAUSED";
      return true;
    });
  }
  
  // 3. Sorting
  const sort = currentSort[tabPrefix];
  if (sort && sort.k) {
    rows.sort((a, b) => {
      let va = a[sort.k], vb = b[sort.k];
      // Numeric sort check
      let fa = parseFloat(va), fb = parseFloat(vb);
      if (!isNaN(fa) && !isNaN(fb)) {
        return sort.dir === "asc" ? fa - fb : fb - fa;
      }
      // String sort
      va = String(va || "").toLowerCase();
      vb = String(vb || "").toLowerCase();
      if (va < vb) return sort.dir === "asc" ? -1 : 1;
      if (va > vb) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
  }
  
  return rows;
}

function handleSearch(tabPrefix) {
  currentSearchData[tabPrefix] = document.getElementById(`${tabPrefix}Search`)?.value.toLowerCase() || "";
  renderTab(tabPrefix);
}

function handleStatusFilter(tabPrefix, v) {
  currentStatusFilter[tabPrefix] = v;
  renderTab(tabPrefix);
}

function handleSort(tabPrefix, key) {
  if (currentSort[tabPrefix].k === key) {
    currentSort[tabPrefix].dir = currentSort[tabPrefix].dir === "asc" ? "desc" : "asc";
  } else {
    currentSort[tabPrefix] = { k: key, dir: "desc" };
  }
  renderTab(tabPrefix);
}

// ══════════════════════════════════════════════════════════════
// OVERVIEW RENDER
// ══════════════════════════════════════════════════════════════
function renderOverview(s, isFiltered = false) {
  const kpiTitle = document.querySelector("#tab-overview h2");
  if (kpiTitle) {
    kpiTitle.innerHTML = isFiltered 
      ? `Top KPIs <span style="color:var(--fb); font-size:12px; margin-left:10px;">(Filtered by ${selectedCampaignIds.size} Selected)</span>`
      : `Top KPIs <span style="color:var(--muted); font-size:12px; margin-left:10px;">(Account Total)</span>`;
  }
  const kpiIds = activeColIds["overview"] || ["spend", "impressions", "clicks", "ctr", "purchaseRoas", "cpc", "cpm", "reach"];
  const kpis = kpiIds.map(id => {
    const def = ALL_METRICS.find(m => m.k === id);
    if (!def) return null;
    let vStr = "0";
    if (s[id]) {
      if (def.f === "money") vStr = `₹${fmtM(s[id])}`;
      else if (def.f === "pct") vStr = `${s[id]}%`;
      else if (def.f === "roas") vStr = `${s[id]}×`;
      else if (def.f === "big") vStr = fmtBig(s[id]);
      else vStr = s[id];
    }
    return { v: vStr, l: def.h };
  }).filter(Boolean);

  document.getElementById("kpiStrip").innerHTML =
    kpis.map(k=>`<div class="kpi"><div class="kpi-v">${k.v}</div><div class="kpi-l">${k.l}</div></div>`).join("");

  document.getElementById("convGrid").innerHTML = [
    { l:"Purchases",       v:fmtBig(s.purchases),       c:"c-green" },
    { l:"Leads",           v:fmtBig(s.leads),           c:"c-blue"  },
    { l:"Conversations",   v:fmtBig(s.messagingConversations), c:"c-purple" },
    { l:"Results",         v:fmtBig(s.results),         c:""        },
  ].map(c=>`<div class="conv-cell"><div class="conv-cell-label">${c.l}</div><div class="conv-cell-val ${c.c}">${c.v}</div></div>`).join("");

  document.getElementById("engGrid").innerHTML = [
    ["Link Clicks",     fmtBig(s.linkClicks)],
    ["Landing Page",    fmtBig(s.landingPageViews)],
    ["CTR (%)",         `${s.ctr}%`],
    ["CPC (₹)",         fmtM(s.cpc)],
    ["Reach",           fmtBig(s.reach)],
    ["Frequency",       s.frequency],
  ].map(([l,v])=>`<div class="eng-row"><span class="eng-lbl">${l}</span><span class="eng-val">${v}</span></div>`).join("");

  const roas = parseFloat(s.purchaseRoas);
  document.getElementById("delivChip").textContent = roas>=2 ? "Healthy 🟢" : roas>=1 ? "Average 🟡" : "Low 🔴";
  document.getElementById("delivChip").className = "chip " + (roas>=2?"chip--green":roas>=1?"chip--amber":"chip--red");

  document.getElementById("delivGrid").innerHTML = [
    { l:"Frequency",    v:s.frequency },
    { l:"Reach",        v:fmtBig(s.reach) },
    { l:"CPM (₹)",      v:fmtM(s.cpm) },
    { l:"CPC (₹)",      v:fmtM(s.cpc) },
    { l:"ROAS",         v:`${s.purchaseRoas}×` },
    { l:"Spend (₹)",    v:fmtM(s.spend) },
  ].map(h=>`<div class="deliv-cell"><div class="deliv-cell-lbl">${h.l}</div><div class="deliv-cell-val">${h.v}</div></div>`).join("");

  document.getElementById("videoGrid").innerHTML = [
    ["Video Views",     fmtBig(s.videoViews||0)],
    ["Video 100%",      fmtBig(s.v100||0)],
    ["Post Engagement", fmtBig(s.postEngagement||0)],
    ["Result Rate",     `${s.resultRate}%`],
  ].map(([l,v])=>`<div class="eng-row"><span class="eng-lbl">${l}</span><span class="eng-val">${v}</span></div>`).join("");

  document.getElementById("qualityGrid").innerHTML = [
    ["Quality Ranking",     s.qualityRanking     || "N/A"],
    ["Engagement Ranking",  s.engagementRanking  || "N/A"],
    ["Conversion Ranking",  s.conversionRanking  || "N/A"],
    ["Unique Clicks",       fmtBig(s.uniqueClicks||0)],
    ["Unique CTR",          `${s.uniqueCtr||0}%`],
  ].map(([l,v])=>`<div class="eng-row"><span class="eng-lbl">${l}</span><span class="eng-val">${v}</span></div>`).join("");

  document.getElementById("costGrid").innerHTML = [
    ["Cost/Result",         fmtM(s.costPerResult||0)],
    ["Cost/Purchase",       fmtM(s.costPerPurchase||0)],
    ["Cost/Lead",           fmtM(s.costPerLead||0)],
    ["Cost/Conv.",          fmtM(s.costPerConversation||0)],
    ["Purchase Value (₹)",  fmtM(s.purchaseValue||0)],
  ].map(([l,v])=>`<div class="eng-row"><span class="eng-lbl">${l}</span><span class="eng-val">${v}</span></div>`).join("");
}

// ══════════════════════════════════════════════════════════════
// TABLE COLUMNS
// ══════════════════════════════════════════════════════════════
const ALL_METRICS = [
  { k: "results", h: "Results", f: "big" },
  { k: "costPerResult", h: "Cost/Result", f: "money" },
  { k: "resultRate", h: "Result Rate", f: "pct" },
  { k: "spend", h: "Spend (₹)", f: "money" },
  { k: "budget", h: "Budget", f: "money" },
  { k: "reach", h: "Reach", f: "big" },
  { k: "impressions", h: "Impressions", f: "big" },
  { k: "frequency", h: "Frequency", f: "text" },
  { k: "cpm", h: "CPM", f: "money" },
  { k: "clicks", h: "Clicks", f: "big" },
  { k: "linkClicks", h: "Link Clicks", f: "big" },
  { k: "ctr", h: "CTR", f: "pct" },
  { k: "cpc", h: "CPC", f: "money" },
  { k: "landingPageViews", h: "Landing Page Views", f: "big" },
  { k: "purchases", h: "Purchases", f: "big" },
  { k: "costPerPurchase", h: "Cost/Purchase", f: "money" },
  { k: "purchaseValue", h: "Purchase Value", f: "money" },
  { k: "purchaseRoas", h: "ROAS", f: "roas" },
  { k: "leads", h: "Leads", f: "big" },
  { k: "costPerLead", h: "Cost/Lead", f: "money" },
  { k: "addToCart", h: "Add to Cart", f: "big" },
  { k: "initiateCheckout", h: "Checkouts", f: "big" },
  { k: "messagingConversations", h: "Conversations Started", f: "big" },
  { k: "costPerConversation", h: "Cost/Conversation", f: "money" },
  { k: "uniqueClicks", h: "Unique Clicks", f: "big" },
  { k: "uniqueCtr", h: "Unique CTR", f: "pct" },
  { k: "qualityRanking", h: "Quality Ranking", f: "text" },
  { k: "engagementRanking", h: "Engagement Ranking", f: "text" },
  { k: "conversionRanking", h: "Conversion Ranking", f: "text" },
  { k: "appInstalls", h: "App Installs", f: "big" },
  { k: "viewContent", h: "View Content", f: "big" },
  { k: "postEngagement", h: "Post Engagement", f: "big" },
  { k: "postReactions", h: "Reactions", f: "big" },
  { k: "postComments", h: "Comments", f: "big" },
  { k: "videoViews", h: "Video Views", f: "big" },
  { k: "v100", h: "Video 100%", f: "big" },
  { k: "dateStart", h: "Date Start", f: "text" },
  { k: "dateStop", h: "Date Stop", f: "text" }
];

const campCols = [ { h:"Campaign ID", k:"id", f:"id" }, { h:"Campaign", k:"name", f:"name" }, { h:"Status", k:"status", f:"status" }, { h:"Objective", k:"objective", f:"text" }, ...ALL_METRICS ];
const adsetCols = [ { h:"Ad Set ID", k:"id", f:"id" }, { h:"Ad Set", k:"name", f:"name" }, { h:"Campaign", k:"campaignName", f:"text" }, { h:"Status", k:"status", f:"status" }, ...ALL_METRICS ];
const adCols = [ { h:"Ad ID", k:"id", f:"id" }, { h:"Ad Name", k:"name", f:"name" }, { h:"Ad Set", k:"adsetName", f:"text" }, { h:"Campaign", k:"campaignName", f:"text" }, { h:"Status", k:"status", f:"status" }, ...ALL_METRICS ];

let activeColIds = {
  overview: ["spend", "results", "costPerResult", "impressions", "clicks", "ctr", "purchaseRoas", "reach"],
  camp: ["id", "name", "status", "results", "costPerResult", "spend", "impressions", "ctr", "purchases", "purchaseRoas"],
  adset: ["id", "name", "status", "results", "costPerResult", "spend", "ctr", "cpm", "cpc", "purchases", "purchaseRoas"],
  ad: ["id", "name", "status", "results", "costPerResult", "spend", "ctr", "cpm", "cpc", "purchases", "purchaseRoas", "linkClicks"]
};

function loadColPrefs() {
  try {
    const saved = localStorage.getItem("metaColPrefs");
    if (saved) {
      activeColIds = JSON.parse(saved);
      // Force 'status' column if it's missing from any tab
      ["camp", "adset", "ad"].forEach(tab => {
        if (activeColIds[tab] && !activeColIds[tab].includes("status")) {
          // Insert status after name or at index 2
          const nameIdx = activeColIds[tab].indexOf("name");
          if (nameIdx !== -1) activeColIds[tab].splice(nameIdx + 1, 0, "status");
          else activeColIds[tab].splice(2, 0, "status");
        }
      });
    }
  } catch(e) {}
}

let currentColEditingTab = null;

const PRESETS = {
  lead: { name: "SM – Lead Performance", cols: ["results", "costPerResult", "resultRate", "spend", "budget", "linkClicks", "ctr", "cpc", "landingPageViews", "impressions", "reach", "frequency", "cpm"] },
  sales: { name: "SM – Sales ROAS", cols: ["purchases", "costPerPurchase", "purchaseValue", "purchaseRoas", "addToCart", "initiateCheckout", "landingPageViews", "spend", "ctr", "cpc", "frequency", "cpm"] },
  whats: { name: "SM – WhatsApp Leads", cols: ["messagingConversations", "costPerConversation", "linkClicks", "ctr", "cpc", "impressions", "reach", "frequency", "cpm", "spend"] },
  scale: { name: "SM – Scaling Decision", cols: ["results", "costPerResult", "spend", "frequency", "cpm", "uniqueCtr", "qualityRanking", "engagementRanking", "conversionRanking"] }
};

function applyPreset(pKey) {
  if (!currentColEditingTab || !PRESETS[pKey]) return;
  const ids = PRESETS[pKey].cols;
  
  // Ensure we keep table-specific fixed IDs if editing camp/adset/ad
  let finalIds = [];
  if (currentColEditingTab === "camp") finalIds = ["id", "name", "status"];
  else if (currentColEditingTab === "adset") finalIds = ["id", "name", "campaignName", "status"];
  else if (currentColEditingTab === "ad") finalIds = ["id", "name", "adsetName", "campaignName", "status"];
  
  finalIds = [...finalIds, ...ids];
  
  // Update checkboxes in modal
  const chks = document.querySelectorAll(".col-chk");
  chks.forEach(chk => {
    chk.checked = finalIds.includes(chk.value);
  });
}

function openColSettings(tabPrefix) {
  currentColEditingTab = tabPrefix;
  let all = [];
  if (tabPrefix === "overview") all = ALL_METRICS;
  else all = { camp: campCols, adset: adsetCols, ad: adCols }[tabPrefix];

  const activeIds = activeColIds[tabPrefix] || [];
  const ttls = { overview:"Top KPI Strip", camp:"Campaign Columns", adset:"Ad Set Columns", ad:"Ad Columns" };
  document.getElementById("colModalTtl").textContent = ttls[tabPrefix] || "Customize Columns";

  // Build list: active columns first (in their saved order), then the rest
  const activeCols = activeIds.map(id => all.find(c => c.k === id)).filter(Boolean);
  const inactiveCols = all.filter(c => !activeIds.includes(c.k));
  const ordered = [...activeCols, ...inactiveCols];

  // Presets
  let presetsHtml = "";
  if (tabPrefix !== "overview") {
    presetsHtml = `
      <div style="margin-bottom:12px;">
        <div style="font-size:10px; color:var(--muted); margin-bottom:6px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">Quick Presets</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
          ${Object.entries(PRESETS).map(([k, p]) => `
            <button class="action-btn" style="font-size:10px; padding:6px; justify-content:center; background:var(--bg-3);" onclick="applyPreset('${k}')">${p.name}</button>
          `).join("")}
        </div>
      </div>
      <div style="font-size:10px; color:var(--muted); margin-bottom:8px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">All Columns</div>
    `;
  }

  document.getElementById("colModalList").innerHTML = presetsHtml + ordered.map((c, i) => {
    const isChecked = activeIds.includes(c.k);
    return `
      <label class="col-opt${isChecked ? ' checked' : ''}" draggable="true" data-key="${c.k}">
        <span class="col-drag-handle" title="Drag to reorder">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="9" cy="7" r="1.5"/><circle cx="15" cy="7" r="1.5"/>
            <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
            <circle cx="9" cy="17" r="1.5"/><circle cx="15" cy="17" r="1.5"/>
          </svg>
        </span>
        <input type="checkbox" class="col-chk" value="${c.k}" ${isChecked ? 'checked' : ''} onchange="updateColSelectedStrip()" />
        <span class="col-label">${c.h}</span>
        ${isChecked ? '<span class="col-count">✓</span>' : ''}
      </label>
    `;
  }).join("");

  const searchInp = document.getElementById("colSearchInp");
  if (searchInp) searchInp.value = "";

  updateColSelectedStrip();
  setupColDragDrop();
  document.getElementById("colModalOverlay").classList.add("show");
}

function updateColSelectedStrip() {
  const chks = document.querySelectorAll("#colModalList .col-chk");
  const selected = [];
  chks.forEach(chk => { if (chk.checked) selected.push({ k: chk.value, h: chk.closest('.col-opt').querySelector('.col-label').textContent }); });
  
  document.getElementById("colSelectedCount").textContent = `(${selected.length})`;
  
  const strip = document.getElementById("colSelectedStrip");
  if (!strip) return;
  strip.innerHTML = selected.length ? selected.map(s =>
    `<span class="col-chip">${s.h}<span class="col-chip-rm" onclick="removeColChip('${s.k}')" title="Remove">×</span></span>`
  ).join("") : `<span style="font-size:11px; color:var(--muted); padding:4px;">No columns selected</span>`;
}

function removeColChip(key) {
  const chk = document.querySelector(`#colModalList .col-chk[value="${key}"]`);
  if (chk) { chk.checked = false; chk.closest('.col-opt').classList.remove('checked'); }
  updateColSelectedStrip();
}

function setupColDragDrop() {
  const list = document.getElementById("colModalList");
  let dragSrc = null;

  list.querySelectorAll('.col-opt[draggable]').forEach(el => {
    el.addEventListener('dragstart', e => {
      dragSrc = el;
      e.dataTransfer.effectAllowed = 'move';
      el.style.opacity = '0.4';
    });
    el.addEventListener('dragend', () => {
      el.style.opacity = '';
      list.querySelectorAll('.col-opt').forEach(i => i.classList.remove('drag-over'));
    });
    el.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      list.querySelectorAll('.col-opt').forEach(i => i.classList.remove('drag-over'));
      el.classList.add('drag-over');
    });
    el.addEventListener('drop', e => {
      e.preventDefault();
      if (dragSrc !== el) {
        // Reorder DOM
        const items = [...list.querySelectorAll('.col-opt[draggable]')];
        const fromIdx = items.indexOf(dragSrc);
        const toIdx = items.indexOf(el);
        if (fromIdx > toIdx) list.insertBefore(dragSrc, el);
        else list.insertBefore(dragSrc, el.nextSibling);
      }
      el.classList.remove('drag-over');
    });
  });
}

function resetColDefaults() {
  if (!currentColEditingTab) return;
  const defaults = {
    overview: ["spend", "results", "costPerResult", "impressions", "clicks", "ctr", "purchaseRoas", "reach"],
    camp:  ["id", "name", "status", "results", "costPerResult", "spend", "impressions", "ctr", "purchases", "purchaseRoas"],
    adset: ["id", "name", "status", "results", "costPerResult", "spend", "ctr", "cpm", "cpc", "purchases", "purchaseRoas"],
    ad:    ["id", "name", "status", "results", "costPerResult", "spend", "ctr", "cpm", "cpc", "purchases", "purchaseRoas", "linkClicks"]
  };
  const ids = defaults[currentColEditingTab] || [];
  document.querySelectorAll('#colModalList .col-chk').forEach(chk => {
    chk.checked = ids.includes(chk.value);
    chk.closest('.col-opt').classList.toggle('checked', chk.checked);
  });
  updateColSelectedStrip();
}

function filterModalCols() {
  const q = document.getElementById("colSearchInp")?.value.toLowerCase() || "";
  const opts = document.querySelectorAll("#colModalList .col-opt");
  opts.forEach(opt => {
    const lbl = opt.querySelector(".col-label").textContent.toLowerCase();
    if (lbl.includes(q)) {
      opt.style.display = "flex";
    } else {
      opt.style.display = "none";
    }
  });
}

function closeColSettings() {
  document.getElementById("colModalOverlay").classList.remove("show");
}

function saveColSettings() {
  if (!currentColEditingTab) return;

  // Respect drag order: iterate DOM elements in their current order
  const opts = document.querySelectorAll("#colModalList .col-opt[draggable]");
  const selected = [];
  opts.forEach(opt => {
    const chk = opt.querySelector(".col-chk");
    if (chk && chk.checked) selected.push(chk.value);
  });
  // Fallback: also check non-draggable checkboxes (presets area)
  if (selected.length === 0) {
    document.querySelectorAll("#colModalList .col-chk").forEach(chk => {
      if (chk.checked) selected.push(chk.value);
    });
  }

  if (selected.length === 0) {
    alert("Please select at least one column.");
    return;
  }

  activeColIds[currentColEditingTab] = selected;
  try { localStorage.setItem("metaColPrefs", JSON.stringify(activeColIds)); } catch(e){}

  closeColSettings();

  // Re-render
  if (!data) return;
  if (currentColEditingTab === "overview") {
    renderOverview(data.summary);
  } else {
    const map = { camp: "campaigns", adset: "adsets", ad: "ads" };
    renderTable(currentColEditingTab, getFilteredData(currentColEditingTab), getActiveCols(currentColEditingTab));
  }
}

function renderTable(id, rows, cols) {
  const countId = { camp:"campCount", adset:"adsetCount", ad:"adCount" };
  const container = document.getElementById(countId[id]);
  
  if (container && rows) {
    const total = rows.length;
    const active = rows.filter(r => String(r.status).toUpperCase() === "ACTIVE").length;
    const paused = rows.filter(r => String(r.status).toUpperCase() === "PAUSED").length;
    
    container.innerHTML = `
      <b style="color:var(--text);">${total}</b> <span style="font-size:10px; opacity:0.7;">TOTAL</span>
      <span style="margin:0 6px; opacity:0.3;">|</span>
      <b style="color:var(--green);">${active}</b> <span style="font-size:10px; opacity:0.7;">LIVE</span>
      <span style="margin:0 6px; opacity:0.3;">|</span>
      <b style="color:var(--amber);">${paused}</b> <span style="font-size:10px; opacity:0.7;">OFFLINE</span>
    `;
    container.style.display = "inline-flex";
    container.style.alignItems = "center";
    container.style.padding = "4px 12px";
    container.style.background = "var(--bg-2)";
    container.style.borderRadius = "99px";
    container.style.border = "1px solid var(--border)";
    container.style.fontFamily = "var(--ff-mono)";
    container.style.fontSize = "11px";
  }


  const thead = document.getElementById(`${id}Head`);
  if (thead) { 
    const sort = currentSort[id];
    let headHtml = cols.map(c => {
      const isSorted = sort.k === c.k;
      const arrow = isSorted ? (sort.dir === "asc" ? " ↑" : " ↓") : "";
      const sortCls = isSorted ? "sort-active" : "";
      return `<th onclick="handleSort('${id}', '${c.k}')" class="sortable ${sortCls}">${c.h}${arrow}</th>`;
    }).join("");
    
    // Always add a leading column for consistency (checkbox or spacer)
    if (id === "camp") {
      headHtml = `<th style="width:40px; text-align:center;"><input type="checkbox" id="selectAllCamps" onchange="toggleSelectAllCamps(this.checked)" ${selectedCampaignIds.size > 0 && selectedCampaignIds.size === rows.length ? 'checked' : ''} /></th>` + headHtml;
    } else {
      headHtml = `<th style="width:40px;"></th>` + headHtml;
    }
    thead.innerHTML = headHtml;
  }

  const tbody = document.getElementById(`${id}Body`);
  if (!tbody) return;
  if (!rows?.length) {
    tbody.innerHTML = `<tr><td colspan="${cols.length + (id==="camp"?1:0)}" style="text-align:center;padding:40px;color:var(--muted)">No data available</td></tr>`;
    return;
  }

  // Calculate Totals row
  let totalRow = { name: "TOTAL ALL", status: "", isTotal: true };
  cols.forEach(c => {
    if (["id", "name", "status", "objective", "campaignName", "adsetName"].includes(c.k)) return;
    let sum = 0;
    rows.forEach(r => {
      let v = parseFloat(r[c.k] || 0);
      if (!isNaN(v)) sum += v;
    });
    totalRow[c.k] = sum;
  });

  // Re-calculate averages for the total row
  if (totalRow.spend && totalRow.impressions) {
    if (totalRow.ctr !== undefined && totalRow.impressions > 0) 
      totalRow.ctr = (totalRow.clicks / totalRow.impressions * 100).toFixed(2);
    if (totalRow.cpm !== undefined && totalRow.impressions > 0) 
      totalRow.cpm = (totalRow.spend / (totalRow.impressions / 1000)).toFixed(2);
    if (totalRow.cpc !== undefined && totalRow.clicks > 0) 
      totalRow.cpc = (totalRow.spend / totalRow.clicks).toFixed(2);
    if (totalRow.resultRate !== undefined && totalRow.impressions > 0)
      totalRow.resultRate = (totalRow.results / totalRow.impressions * 100).toFixed(2);
    if (totalRow.purchaseRoas !== undefined && totalRow.spend > 0) {
      const roas = (totalRow.purchaseValue / totalRow.spend);
      totalRow.purchaseRoas = isNaN(roas) ? "0.00" : roas.toFixed(2);
    }
  }

  let totalTrHtml = cols.map(c=>`<td class="${tdClass(c.f)}">${fmtCell(totalRow[c.k],c.f)}</td>`).join("");
  totalTrHtml = `<td></td>` + totalTrHtml; // Leader spacer for all tables
  const totalTr = `<tr class="tr-total">${totalTrHtml}</tr>`;

  tbody.innerHTML = totalTr + rows.map(r => {
    let rowHtml = cols.map(c=>`<td class="${tdClass(c.f)}">${fmtCell(r[c.k],c.f)}</td>`).join("");
    if (id === "camp") {
      const isChecked = selectedCampaignIds.has(r.id) ? "checked" : "";
      rowHtml = `<td style="text-align:center;"><input type="checkbox" class="row-chk" onchange="toggleCampSelection('${r.id}')" ${isChecked} /></td>` + rowHtml;
    } else {
      rowHtml = `<td></td>` + rowHtml; // Spacer
    }
    return `<tr>${rowHtml}</tr>`;
  }).join("");
}

function toggleCampSelection(id) {
  if (selectedCampaignIds.has(id)) selectedCampaignIds.delete(id);
  else selectedCampaignIds.add(id);
  applySelectionFilter();
}

function toggleSelectAllCamps(checked) {
  const filtered = getFilteredData("camp");
  if (checked) {
    filtered.forEach(c => selectedCampaignIds.add(c.id));
  } else {
    filtered.forEach(c => selectedCampaignIds.delete(c.id));
  }
  applySelectionFilter();
  renderTable("camp", filtered, getActiveCols("camp"));
}

function clearCampSelection() {
  selectedCampaignIds.clear();
  applySelectionFilter();
  renderTable("camp", getFilteredData("camp"), getActiveCols("camp"));
}

function tdClass(f) { return f==="money"?"td-money":f==="roas"?"td-roas":f==="muted"||f==="id"?"td-muted":""; }

function fmtCell(v, f) {
  if (v==null||v==="") return `<span style="color:var(--dim)">—</span>`;
  switch(f) {
    case "status": {
      const s = String(v).toUpperCase();
      const cls = s==="ACTIVE"?"active":s==="PAUSED"?"paused":"archived";
      const lbl = s==="ACTIVE"?"LIVE":s==="PAUSED"?"OFFLINE":s;
      return `<span class="badge badge-${cls}">${lbl}</span>`;
    }
    case "money": return `₹${fmtM(v)}`;
    case "roas":  return `${v}×`;
    case "pct":   return `${v}%`;
    case "big":   return fmtBig(v);
    case "id":    return `<span style="font-family:var(--ff-mono);font-size:10.5px;color:var(--muted)">${v}</span>`;
    default:      return String(v);
  }
}

async function manualRefresh() {
  const btn = document.getElementById("refreshBtn");
  btn.disabled = true;
  btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" style="animation:spin 0.8s linear infinite"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg> Refreshing`;
  try { await fetch(`${API}/refresh`,{method:"POST"}); } catch(_){}
  setTimeout(()=>{
    btn.disabled=false;
    btn.innerHTML=`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg> Refresh`;
  }, 2500);
}

function fmtM(v) { return parseFloat(v||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtBig(v) {
  const n = parseFloat(v||0);
  if (n>=1e7) return (n/1e7).toFixed(2)+"Cr";
  if (n>=1e5) return (n/1e5).toFixed(2)+"L";
  if (n>=1e3) return (n/1e3).toFixed(1)+"K";
  return n.toLocaleString("en-IN");
}