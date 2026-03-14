require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");
const { validateToken, validateAccount, fetchAccountSummary, fetchCampaigns, fetchAdSets, fetchAds } = require("./metaApi");
const { syncAll } = require("./sheetsApi");

const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const PORT = process.env.PORT || 4000;
const INTERVAL = parseInt(process.env.UPDATE_INTERVAL_SECONDS || "10") * 1000;

// ─── State ────────────────────────────────────────────────────────────────────
let CONFIG = {
  token: null,
  accountId: null,
  datePreset: process.env.DATE_PRESET || "today",
};
let latestData  = null;
let lastUpdated = null;
let status      = "idle";
let runCount    = 0;
let loopTimer   = null;
let accountInfo = null;
let nextSync    = Date.now() + INTERVAL;

// ─── Broadcast ────────────────────────────────────────────────────────────────
function broadcast(payload) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach((c) => { if (c.readyState === 1) c.send(msg); });
}

// ─── Main Fetch Cycle ─────────────────────────────────────────────────────────
async function runCycle() {
  if (!CONFIG.token || !CONFIG.accountId) return;

  runCount++;
  status = "fetching";
  broadcast({ type: "status", status: "fetching", runCount });

  try {
    const [summary, campaigns, adsets, ads] = await Promise.all([
      fetchAccountSummary(CONFIG.accountId, CONFIG.token, CONFIG.datePreset),
      fetchCampaigns(CONFIG.accountId, CONFIG.token, CONFIG.datePreset),
      fetchAdSets(CONFIG.accountId, CONFIG.token, CONFIG.datePreset),
      fetchAds(CONFIG.accountId, CONFIG.token, CONFIG.datePreset),
    ]);

    latestData  = { summary, campaigns, adsets, ads };
    lastUpdated = new Date().toISOString();
    status      = "ok";

    if (process.env.GOOGLE_SHEET_ID) {
      syncAll(process.env.GOOGLE_SHEET_ID, latestData).catch(e => console.error("Sheet sync error:", e.message));
    }

    broadcast({ type: "data", status: "ok", lastUpdated, runCount, accountInfo, data: latestData });
    console.log(`[#${runCount}] ✅  ${campaigns.length} campaigns | ${adsets.length} adsets | ${ads.length} ads | ₹${summary.spend}`);
    nextSync = Date.now() + INTERVAL;
  } catch (err) {
    status = "error";
    const errMsg = err.response?.data?.error?.message || err.message;
    console.error(`[#${runCount}] ❌  ${errMsg}`);
    broadcast({ type: "status", status: "error", error: errMsg, runCount });
  }
}

function startLoop() {
  clearInterval(loopTimer);
  runCycle();
  loopTimer = setInterval(runCycle, INTERVAL);
}

// ─── Facebook OAuth — Auto Connect ───────────────────────────────────────────
app.get("/auth/facebook", (req, res) => {
  const appId = process.env.META_APP_ID;
  if (!appId) return res.status(400).send("META_APP_ID not set in .env");
  const redirect = encodeURIComponent(`${req.protocol}://${req.get("host")}/auth/callback`);
  const scope = "ads_read,ads_management,business_management,pages_read_engagement";
  res.redirect(`https://www.facebook.com/dialog/oauth?client_id=${appId}&redirect_uri=${redirect}&scope=${scope}&response_type=code`);
});

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("No code received from Facebook");

  try {
    const appId     = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const redirect  = encodeURIComponent(`${req.protocol}://${req.get("host")}/auth/callback`);

    // Exchange code → short-lived token
    const tokenRes = await require("axios").get(
      `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&redirect_uri=${redirect}&client_secret=${appSecret}&code=${code}`
    );
    const shortToken = tokenRes.data.access_token;

    // Exchange for long-lived token
    const longRes = await require("axios").get(
      `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`
    );
    const token = longRes.data.access_token;

    // Validate token
    const tokenCheck = await validateToken(token);
    if (!tokenCheck.ok) return res.status(401).send("Token validation failed: " + tokenCheck.error);

    // Scan all ad accounts
    const axios = require("axios");
    const accRes = await axios.get(`https://graph.facebook.com/v19.0/me/adaccounts`, {
      params: { fields: "id,name,account_status,currency,timezone_name", access_token: token, limit: 50 }
    });
    const accounts = (accRes.data?.data || []).filter(a => a.account_status === 1);

    if (!accounts.length) {
      return res.send(`<script>window.opener && window.opener.postMessage({type:'fb_error',error:'No active ad accounts found'},'*'); window.close();</script>`);
    }

    // Auto-connect to first active account
    const firstAcc = accounts[0];
    const accountId = firstAcc.id.replace("act_", "");
    const accountCheck = await validateAccount(`act_${accountId}`, token);

    CONFIG = { token, accountId: `act_${accountId}`, datePreset: process.env.DATE_PRESET || "today" };
    accountInfo = { ...accountCheck, allAccounts: accounts };
    nextSync = Date.now() + INTERVAL;

    broadcast({ type: "connected", accountInfo, config: { datePreset: CONFIG.datePreset } });
    startLoop();

    // Send all accounts list to frontend via postMessage
    res.send(`
      <html><head><title>Connected!</title></head><body style="background:#0c1220;color:#e4eaf5;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;">
        <div>
          <div style="font-size:48px;margin-bottom:16px;">✅</div>
          <div style="font-size:18px;font-weight:700;margin-bottom:8px;">Connected!</div>
          <div style="font-size:13px;color:#546882;margin-bottom:20px;">Found ${accounts.length} active account(s). Syncing data...</div>
          <div style="font-size:12px;color:#22c55e;">${firstAcc.name}</div>
        </div>
        <script>
          if(window.opener) {
            window.opener.postMessage({
              type:'fb_connected',
              token:'${token}',
              accounts: ${JSON.stringify(accounts)},
              activeAccount: ${JSON.stringify(firstAcc)}
            }, '*');
          }
          setTimeout(()=>window.close(), 2000);
        </script>
      </body></html>
    `);
  } catch (err) {
    console.error("OAuth callback error:", err.response?.data || err.message);
    res.send(`<script>window.opener && window.opener.postMessage({type:'fb_error',error:'${(err.response?.data?.error?.message || err.message).replace(/'/g,"\\'")}'},'*'); window.close();</script>`);
  }
});

// ─── API: Scan Ad Accounts from token ────────────────────────────────────────
app.post("/api/scan-accounts", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ ok: false, error: "Token required" });
  try {
    const axios = require("axios");
    const r = await axios.get(`https://graph.facebook.com/v19.0/me/adaccounts`, {
      params: { fields: "id,name,account_status,currency,timezone_name,business", access_token: token, limit: 50 }
    });
    const all = r.data?.data || [];
    const active = all.filter(a => a.account_status === 1);
    res.json({ ok: true, accounts: active, total: all.length });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.response?.data?.error?.message || err.message });
  }
});

// ─── API: Status (Check if connected) ─────────────────────────────────────────
app.get("/api/status", (req, res) => {
  res.json({
    connected: !!CONFIG.token,
    account: accountInfo || null,
    allAccounts: accountInfo?.allAccounts || [],
    config: CONFIG
  });
});

// ─── API: Connect (Token only — No App ID needed!) ────────────────────────────
app.post("/api/connect", async (req, res) => {
  const { token, accountId, datePreset } = req.body;

  if (!token || !accountId) {
    return res.status(400).json({ ok: false, error: "token and accountId required" });
  }

  const tokenCheck = await validateToken(token);
  if (!tokenCheck.ok) {
    return res.status(401).json({ ok: false, error: "Invalid token: " + tokenCheck.error });
  }

  const accountCheck = await validateAccount(accountId, token);
  if (!accountCheck.ok) {
    return res.status(400).json({ ok: false, error: "Account error: " + accountCheck.error });
  }

  // Preserve allAccounts if already known or fetch them so the dropdown works
  let allAccounts = accountInfo?.allAccounts || [];
  if (allAccounts.length === 0) {
    try {
      const axios = require("axios");
      const r = await axios.get(`https://graph.facebook.com/v19.0/me/adaccounts`, {
        params: { fields: "id,name,account_status,currency,timezone_name,business", access_token: token, limit: 50 }
      });
      allAccounts = (r.data?.data || []).filter(a => a.account_status === 1);
    } catch (e) {}
  }

  CONFIG = { token, accountId, datePreset: datePreset || "today" };
  accountInfo = { ...accountCheck, allAccounts };
  nextSync = Date.now() + INTERVAL;

  broadcast({ type: "connected", accountInfo, config: { datePreset: CONFIG.datePreset } });
  startLoop();

  res.json({
    ok: true,
    message: "Connected! Live data streaming started.",
    user: tokenCheck,
    account: accountCheck,
  });
});

// ─── API: DISCONNECT — Facebook logout → all state cleared ────────────────────
app.post("/api/disconnect", (req, res) => {
  try {
    // 1. Stop the polling loop
    clearInterval(loopTimer);
    loopTimer = null;

    // 2. Reset all in-memory state
    CONFIG      = { token: null, accountId: null, datePreset: "today" };
    latestData  = null;
    lastUpdated = null;
    status      = "idle";
    runCount    = 0;
    accountInfo = null;

    // 3. Broadcast disconnect event to all connected browsers
    broadcast({ type: "disconnected", message: "Facebook disconnected. All data cleared." });

    console.log("🔴 Facebook disconnected — all state cleared.");
    res.json({ ok: true, message: "Disconnected successfully." });
  } catch (err) {
    console.error("Disconnect error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── API: Date Range ──────────────────────────────────────────────────────────
app.post("/api/daterange", (req, res) => {
  const { datePreset } = req.body;
  CONFIG.datePreset = datePreset || "today";
  broadcast({ type: "dateChanged", datePreset: CONFIG.datePreset });
  runCycle();
  res.json({ ok: true, datePreset: CONFIG.datePreset });
});

// ─── API: Misc ────────────────────────────────────────────────────────────────
app.get("/api/health",   (_, res) => res.json({ ok: true, status, lastUpdated, runCount, accountInfo }));
app.get("/api/config",   (_, res) => res.json({ datePreset: CONFIG.datePreset, hasToken: !!CONFIG.token, hasAccount: !!CONFIG.accountId, accountInfo }));
app.get("/api/data",     (_, res) => latestData ? res.json({ status, lastUpdated, runCount, data: latestData }) : res.status(503).json({ error: "No data yet" }));
app.get("/api/summary",  (_, res) => latestData ? res.json(latestData.summary)   : res.status(503).json({ error: "No data yet" }));
app.get("/api/campaigns",(_, res) => latestData ? res.json(latestData.campaigns) : res.status(503).json({ error: "No data yet" }));
app.get("/api/adsets",   (_, res) => latestData ? res.json(latestData.adsets)    : res.status(503).json({ error: "No data yet" }));
app.get("/api/ads",      (_, res) => latestData ? res.json(latestData.ads)       : res.status(503).json({ error: "No data yet" }));

app.post("/api/refresh", async (_, res) => {
  res.json({ ok: true });
  await runCycle();
});

// ─── WebSocket ────────────────────────────────────────────────────────────────
wss.on("connection", (ws) => {
  console.log("🔌 Client connected");

  if (latestData) {
    ws.send(JSON.stringify({ type: "data", status, lastUpdated, runCount, accountInfo, data: latestData }));
  } else if (CONFIG.token) {
    ws.send(JSON.stringify({ type: "status", status: "fetching" }));
  } else {
    ws.send(JSON.stringify({ type: "status", status: "waiting_for_token" }));
  }

  // Countdown broadcast
  ws.on("message", (msg) => {
    try {
      const p = JSON.parse(msg);
      if (p.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
    } catch (_) {}
  });

  ws.on("close", () => console.log("🔌 Client disconnected"));
});

// ─── Countdown broadcast every second ────────────────────────────────────────
setInterval(() => {
  if (!CONFIG.token) return;
  const remaining = Math.max(0, Math.ceil((nextSync - Date.now()) / 1000));
  broadcast({ type: "countdown", remaining });
}, 1000);

// ─── Start Server ─────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  META ADS LIVE REPORTER — BACKEND API   ║`);
  console.log(`╚══════════════════════════════════════════╝`);
  console.log(`\n  Dashboard → http://localhost:${PORT}`);
  console.log(`  API       → http://localhost:${PORT}/api`);
  console.log(`  WS        → ws://localhost:${PORT}`);
  console.log(`  Refresh   → every ${INTERVAL / 1000}s\n`);
  console.log(`  ⏳ Waiting for token via POST /api/connect\n`);
  console.log(`  💡 No META_APP_ID needed — token only!\n`);
});