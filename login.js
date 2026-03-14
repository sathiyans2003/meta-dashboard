const API = (window.location.protocol === "file:" || window.location.hostname === "" || window.location.hostname === "localhost") ? "http://localhost:4000/api" : window.location.origin + "/api";
let oauthToken = null;

// Connect mode
function switchMode(mode) {
  document.getElementById("modeTabFB").classList.toggle("active", mode === "fb");
  document.getElementById("modeTabToken").classList.toggle("active", mode === "token");
  document.getElementById("modePanelFB").classList.toggle("active", mode === "fb");
  document.getElementById("modePanelToken").classList.toggle("active", mode === "token");
}

// FB Popup Open
function startFBOAuth() {
  const btn = document.getElementById("fbOAuthBtn");
  btn.disabled = true;
  document.getElementById("fbOAuthBtnText").textContent = "Opening Facebook...";

  const authUrl = (window.location.protocol === "file:" || window.location.hostname === "" || window.location.hostname === "localhost") ? "http://localhost:4000/auth/facebook" : window.location.origin + "/auth/facebook";
  const popup = window.open(authUrl, "fbAuth", "width=600,height=700,scrollbars=yes,resizable=yes");

  document.getElementById("fbLoading").classList.add("show");
  document.getElementById("fbLoadingText").textContent = "Facebook login-க்கு காத்திருக்கிறோம்...";

  window.addEventListener("message", function handler(e) {
    const expectedOrigin = (window.location.protocol === "file:" || window.location.hostname === "" || window.location.hostname === "localhost") ? "http://localhost:4000" : window.location.origin;
    if (e.origin !== expectedOrigin) return;
    window.removeEventListener("message", handler);
    document.getElementById("fbLoading").classList.remove("show");
    btn.disabled = false;
    document.getElementById("fbOAuthBtnText").textContent = "Continue with Facebook →";

    if (e.data.type === "fb_connected") {
      oauthToken = e.data.token;
      const accounts = e.data.accounts || [];
      if (accounts.length > 0) {
        connectAccount(oauthToken, accounts[0].id, "today");
      } else {
        const errEl = document.getElementById("connectErr");
        errEl.textContent = "⚠️ Active accounts இல்லை!";
        errEl.classList.add("show");
      }
    } else if (e.data.type === "fb_error") {
      const errEl = document.getElementById("connectErr");
      errEl.textContent = "⚠️ " + e.data.error;
      errEl.classList.add("show");
    }
  });

  const popupCheck = setInterval(() => {
    if (popup && popup.closed) {
      clearInterval(popupCheck);
      document.getElementById("fbLoading").classList.remove("show");
      btn.disabled = false;
      document.getElementById("fbOAuthBtnText").textContent = "Continue with Facebook →";
    }
  }, 800);
}

function showOAuthAccPicker(accounts) {
  const picker = document.getElementById("oauthAccPicker");
  const list   = document.getElementById("oauthAccList");
  picker.classList.add("show");
  list.innerHTML = accounts.map(a => `
    <div class="acc-item" onclick="connectAccount('${oauthToken}','${a.id}','today')">
      <div>
        <div class="acc-name">${a.name}</div>
        <div class="acc-id">${a.id} · ${a.currency}</div>
      </div>
      <span class="acc-active">Connect</span>
    </div>
  `).join("");
}

// Manual Token Scan
async function scanAndPick() {
  const token = document.getElementById("tokenInp").value.trim();
  const errEl = document.getElementById("scanErr");
  const btn   = document.getElementById("scanBtnText");
  errEl.classList.remove("show");

  if (!token) { errEl.textContent = "Token paste பண்ணுங்கள்!"; errEl.classList.add("show"); return; }
  btn.textContent = "Scanning...";

  try {
    const res = await fetch(`${API}/scan-accounts`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token })
    });
    const json = await res.json();
    if (!json.ok) { errEl.textContent = json.error; errEl.classList.add("show"); btn.textContent = "Scan Ad Accounts"; return; }

    oauthToken = token;
    const accounts = json.accounts;
    if (!accounts.length) {
      errEl.textContent = "Active ad accounts இல்லை! Account status-ஐ check பண்ணுங்கள்.";
      errEl.classList.add("show"); btn.textContent = "Scan Ad Accounts"; return;
    }

    connectAccount(token, accounts[0].id, "today");
  } catch (err) {
    errEl.textContent = "Error: " + err.message;
    errEl.classList.add("show");
  }
  btn.textContent = "Scan Ad Accounts";
}

function showTokenAccPicker(accounts, token) {
  const picker = document.getElementById("tokenAccPicker");
  const list   = document.getElementById("tokenAccList");
  picker.classList.add("show");
  list.innerHTML = accounts.map(a => `
    <div class="acc-item" onclick="connectAccount('${token}','${a.id}','today')">
      <div>
        <div class="acc-name">${a.name}</div>
        <div class="acc-id">${a.id} · ${a.currency || ""}</div>
      </div>
      <span class="acc-active">Select</span>
    </div>
  `).join("");
}

// Connect Account Logic (Final logic block on Login page)
async function connectAccount(token, accountId, datePreset) {
  document.getElementById("fbLoading").classList.add("show");
  document.getElementById("fbLoadingText").textContent = "Account connect ஆகுது...";
  const errEl = document.getElementById("connectErr");
  errEl.classList.remove("show");

  try {
    const res = await fetch(`${API}/connect`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, accountId, datePreset: datePreset || "today" })
    });
    const json = await res.json();
    
    document.getElementById("fbLoading").classList.remove("show");
    
    if (!json.ok) {
      errEl.textContent = json.error || "Connection failed";
      errEl.classList.add("show"); return;
    }

    // REDIRECT TO DASHBOARD!!!
    window.location.href = "dashboard.html";

  } catch (e) {
    document.getElementById("fbLoading").classList.remove("show");
    errEl.textContent = "Backend error: " + e.message;
    errEl.classList.add("show");
  }
}

// Redirect on Enter if token mode
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && document.getElementById("modePanelToken").classList.contains("active")) {
    scanAndPick();
  }
});

// Auto-navigate to dashboard if ALREADY connected
window.onload = async () => {
  try {
    const r = await fetch(`${API}/status`);
    const s = await r.json();
    if (s.connected) {
      window.location.href = "dashboard.html";
    }
  } catch(e) {}
};

// Token field visibility toggle
function toggleTokenVis() {
  const inp = document.getElementById("tokenInp");
  const btn = document.getElementById("tokenVisBtn");
  if (!inp || !btn) return;
  
  if (inp.type === "password") {
    inp.type = "text";
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
  } else {
    inp.type = "password";
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  }
}
