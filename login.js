const API = (window.location.protocol === "file:" || window.location.hostname === "" || window.location.hostname === "localhost") ? "http://localhost:4000/api" : window.location.origin + "/api";
let oauthToken = null;

// FB Popup Open
function startFBOAuth() {
  const btn = document.getElementById("fbOAuthBtn");
  const btnText = document.getElementById("fbOAuthBtnText");
  btn.disabled = true;
  btnText.textContent = "Opening Facebook...";

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
        // Multi-user logic: Save to LocalStorage and Redirect
        saveSession(oauthToken, accounts[0].id, "today");
        window.location.href = "dashboard.html";
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

function saveSession(token, accountId, datePreset) {
  localStorage.setItem("meta_token", token);
  localStorage.setItem("meta_account_id", accountId);
  localStorage.setItem("meta_date_preset", datePreset || "today");
}

// Auto-navigate to dashboard if session exists
window.onload = () => {
  const token = localStorage.getItem("meta_token");
  const accId = localStorage.getItem("meta_account_id");

  if (token && accId) {
    document.getElementById("fbLoading").classList.add("show");
    document.getElementById("fbLoadingText").textContent = "Redirecting to Dashboard...";
    window.location.href = "dashboard.html";
  }
};
