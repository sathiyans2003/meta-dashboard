const BASE = (window.location.protocol === "file:" || !window.location.hostname || window.location.hostname === "localhost")
  ? "http://localhost:4000"
  : window.location.origin;

const API = BASE + "/api";

// ── Save session to localStorage ─────────────────────────────────────────────
function saveSession(token, accountId, datePreset, userId, userName, userPicture) {
  localStorage.setItem("meta_token", token);
  localStorage.setItem("meta_account_id", accountId);
  localStorage.setItem("meta_date_preset", datePreset || "today");
  if (userId)      localStorage.setItem("meta_user_id", userId);
  if (userName)    localStorage.setItem("meta_user_name", userName);
  if (userPicture) localStorage.setItem("meta_user_picture", userPicture);
}

// ── Fetch saved users from server ─────────────────────────────────────────────
async function fetchSavedUsers() {
  try {
    const res = await fetch(`${API}/users`);
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

// ── Switch to a saved user ────────────────────────────────────────────────────
async function switchToUser(userId) {
  showLoading("Account load ஆகுது...");
  try {
    const res = await fetch(`${API}/users/switch/${userId}`, { method: "POST" });
    if (!res.ok) throw new Error("Switch failed");
    const data = await res.json();
    // Token is loaded — go to dashboard; account will be fetched via WS
    saveSession(data.token, localStorage.getItem("meta_account_id") || "", "today", data.userId, data.name, data.picture);
    window.location.href = "dashboard.html";
  } catch (e) {
    hideLoading();
    showErr("User switch failed: " + e.message);
  }
}

// ── Remove a saved user ───────────────────────────────────────────────────────
async function removeUser(userId, event) {
  event.stopPropagation();
  if (!confirm("இந்த user-ஐ remove பண்ணணுமா?")) return;
  await fetch(`${API}/users/${userId}`, { method: "DELETE" });
  await renderUserPicker(); // re-render
}

// ── Render the user picker section ───────────────────────────────────────────
async function renderUserPicker() {
  const users = await fetchSavedUsers();
  const section = document.getElementById("userPickerSection");
  const fbSection = document.getElementById("fbSection");
  if (!section) return;

  if (users.length === 0) {
    section.style.display = "none";
    fbSection.style.display = "block";
    return;
  }

  section.style.display = "block";

  const currentUserId = localStorage.getItem("meta_user_id");

  section.innerHTML = `
    <div style="font-size:11px;color:var(--dim);font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">
      Saved Accounts
    </div>
    <div id="userCardList" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
      ${users.map(u => `
        <div class="user-card ${u.id === currentUserId ? 'user-card-active' : ''}"
             onclick="switchToUser('${u.id}')"
             title="Click to login as ${u.name}">
          <div class="user-card-avatar">
            ${u.picture
              ? `<img src="${u.picture}" alt="${u.name}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
              : ""}
            <div class="user-card-initials" style="${u.picture ? 'display:none' : 'display:flex'}">${u.name ? u.name[0].toUpperCase() : "?"}</div>
          </div>
          <div class="user-card-info">
            <div class="user-card-name">${u.name || "Unknown"}</div>
            <div class="user-card-sub">${u.id === currentUserId ? "Current Session" : "Click to switch"}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            ${u.id === currentUserId ? `<span style="font-size:10px;padding:2px 8px;background:var(--fb-dim);color:var(--fb);border-radius:99px;font-weight:700;">Active</span>` : ""}
            <button class="user-card-remove" onclick="removeUser('${u.id}', event)" title="Remove">✕</button>
          </div>
        </div>
      `).join("")}
    </div>
    <div style="text-align:center;">
      <button class="connect-btn-secondary" onclick="showAddAccount()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add New Account
      </button>
    </div>
  `;
}

// ── Show the FB OAuth button ───────────────────────────────────────────────────
function showAddAccount() {
  document.getElementById("fbSection").style.display = "block";
  document.getElementById("fbSection").scrollIntoView({ behavior: "smooth" });
}

// ── Facebook OAuth popup ──────────────────────────────────────────────────────
function startFBOAuth() {
  const btn = document.getElementById("fbOAuthBtn");
  const btnText = document.getElementById("fbOAuthBtnText");
  btn.disabled = true;
  btnText.textContent = "Opening Facebook...";

  const authUrl = BASE + "/auth/facebook";
  const popup = window.open(authUrl, "fbAuth", "width=600,height=700,scrollbars=yes,resizable=yes");

  showLoading("Facebook login-க்கு காத்திருக்கிறோம்...");

  window.addEventListener("message", function handler(e) {
    if (e.data && e.data.type === "fb_connected") {
      const { token, userId, userName, userPicture, accounts } = e.data;
      const firstAccId = accounts.length > 0 ? accounts[0].id : "";
      saveSession(token, firstAccId, "today", userId, userName, userPicture);
      window.removeEventListener("message", handler);
      window.location.href = "dashboard.html";
    } else if (e.data && e.data.type === "fb_error") {
      hideLoading();
      btn.disabled = false;
      btnText.textContent = "Continue with Facebook →";
      showErr("⚠️ " + e.data.error);
      window.removeEventListener("message", handler);
    }
  });

  const popupCheck = setInterval(() => {
    if (popup && popup.closed) {
      clearInterval(popupCheck);
      hideLoading();
      btn.disabled = false;
      btnText.textContent = "Continue with Facebook →";
    }
  }, 800);
}

function showLoading(msg) {
  document.getElementById("fbLoading").classList.add("show");
  document.getElementById("fbLoadingText").textContent = msg || "Loading...";
}

function hideLoading() {
  document.getElementById("fbLoading").classList.remove("show");
}

function showErr(msg) {
  const el = document.getElementById("connectErr");
  if (el) { el.textContent = msg; el.classList.add("show"); }
}

// ── On page load ──────────────────────────────────────────────────────────────
window.onload = async () => {
  const users = await fetchSavedUsers();
  const token = localStorage.getItem("meta_token");
  const accId = localStorage.getItem("meta_account_id");

  // Single saved user + already has session → auto-redirect
  if (users.length === 1 && token && accId) {
    showLoading("Redirecting to Dashboard...");
    window.location.href = "dashboard.html";
    return;
  }

  // Multiple users or no session → show picker
  await renderUserPicker();

  // If no saved users and has a legacy token → redirect directly (backward compat)
  if (users.length === 0 && token && accId) {
    showLoading("Redirecting to Dashboard...");
    window.location.href = "dashboard.html";
  }
};
