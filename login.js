const API = (window.location.protocol === "file:" || window.location.hostname === "" || window.location.hostname === "localhost") ? "http://localhost:4000/api" : window.location.origin + "/api";
let oauthToken = null;


// FB Popup Open
function startFBOAuth() {
  const btn = document.getElementById("fbOAuthBtn");
  const btnText = document.getElementById("fbOAuthBtnText");
  btn.disabled = true;
  btnText.textContent = "Opening Facebook...";

  // Check if App ID is placeholder (optional but helpful)
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
  const list = document.getElementById("oauthAccList");
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

// Auto-navigate to dashboard if ALREADY connected
window.onload = async () => {
  const checkStatus = async () => {
    try {
      const r = await fetch(`${API}/status`);
      const s = await r.json();
      if (s.connected) {
        showAutoConnecting("Redirecting to Dashboard...");
        window.location.href = "dashboard.html";
        return true;
      }
    } catch(e) {}
    return false;
  };

  // Check immediately
  if (await checkStatus()) return;

  // Retry once after 2s for auto-connect systems
  setTimeout(checkStatus, 2000);
};

function showAutoConnecting(msg) {
  document.getElementById("fbLoading").classList.add("show");
  document.getElementById("fbLoadingText").textContent = msg || "Auto-connecting...";
}
function hideAutoConnecting() {
  document.getElementById("fbLoading").classList.remove("show");
}
