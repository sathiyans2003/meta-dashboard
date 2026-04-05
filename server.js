require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");
const { fetchAccountSummary, fetchCampaigns, fetchAdSets, fetchAds } = require("./metaApi");

const app = express();
app.set("trust proxy", 1);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ─── Middleware: Extract User Session from Headers ──────────────────────────
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    const token = req.headers["x-meta-token"] || req.query.token;
    const accId = req.headers["x-meta-account-id"] || req.query.accountId;
    const datePreset = req.headers["x-meta-date-preset"] || req.query.datePreset || "today";
    if (token && accId) {
      req.userSession = { token, accId, datePreset };
    }
  }
  next();
});

// ─── Page Routes ─────────────────────────────────────────────────────────────
app.get("/",           (_, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/dashboard",  (_, res) => res.sendFile(path.join(__dirname, "dashboard.html")));
app.get("/explorer",   (_, res) => res.sendFile(path.join(__dirname, "explorer.html")));

// ─── API: Fetch Complete Data ────────────────────────────────────────────────
app.get("/api/data", async (req, res) => {
  if (!req.userSession) return res.status(401).json({ error: "No session." });
  const { token, accId, datePreset } = req.userSession;
  try {
    const data = await fetchAllMeta(token, accId, datePreset);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── OAuth Routes ────────────────────────────────────────────────────────────
app.get("/auth/facebook", (req, res) => {
  const appId = process.env.META_APP_ID;
  const host = req.get("host");
  const protocol = (host.includes("localhost") || host.includes("127.0.0.1")) ? "http" : "https";
  const redirect = encodeURIComponent(`${protocol}://${host}/auth/callback`);
  const scope = "ads_read,ads_management,business_management,pages_read_engagement";
  res.redirect(`https://www.facebook.com/dialog/oauth?client_id=${appId}&redirect_uri=${redirect}&scope=${scope}&response_type=code`);
});

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const host = req.get("host");
  const protocol = (host.includes("localhost") || host.includes("127.0.0.1")) ? "http" : "https";
  const redirect = `${protocol}://${host}/auth/callback`;
  const axios = require("axios");

  try {
    const tokenRes = await axios.get(`https://graph.facebook.com/v19.0/oauth/access_token`, {
      params: { client_id: appId, redirect_uri: redirect, client_secret: appSecret, code: code }
    });
    const longRes = await axios.get(`https://graph.facebook.com/v19.0/oauth/access_token`, {
      params: { grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: tokenRes.data.access_token }
    });
    const token = longRes.data.access_token;
    const accRes = await axios.get(`https://graph.facebook.com/v19.0/me/adaccounts`, { 
      params: { fields: "id,name,account_status,currency,timezone_name,timezone_offset_hours_utc", access_token: token, limit: 500 } 
    });
    const accounts = accRes.data?.data || [];

    res.send(`<html><body><script>
      if (window.opener) { 
        window.opener.postMessage({ type: 'fb_connected', token: '${token}', accounts: ${JSON.stringify(accounts)} }, '*'); 
      }
      window.close();
    </script></body></html>`);
  } catch (err) {
    const errorMsg = err.response?.data?.error?.message || err.message;
    console.error("Auth Callback Error:", errorMsg);
    res.status(400).send(`<h3>OAuth Error</h3><p>${errorMsg}</p><p><a href="/">Try Again</a></p>`);
  }
});

// ─── WebSocket Logic (Multi-user) ───────────────────────────────────────────
wss.on("connection", (ws) => {
  ws.isAlive = true;

  ws.on("pong", () => { ws.isAlive = true; });

  ws.on("message", async (msgStr) => {
    try {
      const msg = JSON.parse(msgStr);

      if (msg.type === "auth") {
        ws.token = msg.token;
        ws.accountId = msg.accountId;
        ws.datePreset = msg.datePreset || "today";
        ws.runCount = 1;
        console.log(`[WS] AUTH → Account: ${ws.accountId} | Date: ${ws.datePreset}`);
        
        const axios = require("axios");
        try {
          const accRes = await axios.get(`https://graph.facebook.com/v19.0/me/adaccounts`, { 
            params: { fields: "id,name,account_status,currency,timezone_name,timezone_offset_hours_utc", access_token: ws.token, limit: 500 } 
          });
          const allAccounts = accRes.data?.data || [];
          const activeAcc = allAccounts.find(a => a.id === ws.accountId) || allAccounts[0];

          ws.send(JSON.stringify({ 
            type: "connected", 
            accountInfo: { ...activeAcc, allAccounts }
          }));

          console.log(`[WS] Connected | Accounts: ${allAccounts.length} | Active: ${activeAcc?.name}`);
        } catch (e) {
          const apiErr = e.response?.data?.error;
          const errMsg = apiErr?.message || e.message;
          const errCode = apiErr?.code || 0;
          console.error(`[WS] Account Fetch Error (${errCode}): ${errMsg}`);

          // Token expired or invalid
          if (errCode === 190 || errMsg.includes("Invalid OAuth") || errMsg.includes("expired")) {
            ws.send(JSON.stringify({ type: "fatal_error", code: "TOKEN_EXPIRED", message: errMsg }));
            return;
          }
          ws.send(JSON.stringify({ type: "status", status: "error", error: errMsg, code: errCode }));
        }

        await syncNow(ws);
        startSyncWorker(ws);
      }

      if (msg.type === "update_date") {
        ws.datePreset = msg.datePreset;
        ws.runCount = 1;
        await syncNow(ws);
      }

      if (msg.type === "refresh") {
        ws.send(JSON.stringify({ type: "status", status: "fetching" }));
        await syncNow(ws);
      }

      if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong" }));

    } catch(e) {
      console.error("[WS] Message parse error:", e.message);
    }
  });

  ws.on("close", () => {
    console.log(`[WS] Disconnected: ${ws.accountId || "unknown"}`);
    clearInterval(ws.syncTimer);
  });

  ws.on("error", (err) => {
    console.error("[WS] Socket error:", err.message);
    clearInterval(ws.syncTimer);
  });
});

// ─── Heartbeat: Kill dead connections ─────────────────────────────────────
const heartbeat = setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on("close", () => clearInterval(heartbeat));

// ─── Sync Logic ─────────────────────────────────────────────────────────────
async function syncNow(ws) {
  if (!ws.token || !ws.accountId) return;
  try {
    console.log(`[SYNC] Fetching → ${ws.accountId} | ${ws.datePreset} | Run #${ws.runCount}`);
    const data = await fetchAllMeta(ws.token, ws.accountId, ws.datePreset);
    ws.send(JSON.stringify({ type: "data", data, runCount: ws.runCount || 1 }));
    ws.runCount = (ws.runCount || 1) + 1;
    console.log(`[SYNC] ✅ Done → ${ws.accountId} | Campaigns: ${data.campaigns?.length} | Ads: ${data.ads?.length}`);
  } catch(e) {
    const apiErr = e.response?.data?.error;
    const errMsg = apiErr?.message || e.message;
    const errCode = apiErr?.code || 0;
    const errSubCode = apiErr?.error_subcode || 0;
    const errType = apiErr?.type || "";

    console.error(`[SYNC] ❌ FAILED → ${ws.accountId} | Code: ${errCode} | ${errMsg}`);

    // Classify the error for the client
    let clientErr = errMsg;
    if (errCode === 190 || errMsg.includes("Invalid OAuth") || errMsg.includes("expired") || errMsg.includes("access token")) {
      clientErr = "Access token expired or invalid. Please reconnect your Facebook account.";
      ws.send(JSON.stringify({ type: "fatal_error", code: "TOKEN_EXPIRED", message: clientErr }));
      return;
    } else if (errCode === 17 || errMsg.includes("rate limit") || errMsg.includes("too many calls")) {
      clientErr = "Meta API rate limit reached. Please wait 1-2 minutes and refresh.";
    } else if (errCode === 100) {
      clientErr = "Invalid ad account ID or insufficient permissions.";
    } else if (errCode === 4) {
      clientErr = "Meta API is busy. Auto-retrying in 60 seconds.";
    }

    ws.send(JSON.stringify({ 
      type: "sync_error", 
      error: clientErr,
      raw: errMsg,
      code: errCode,
      subcode: errSubCode,
      errorType: errType
    }));
  }
}

function startSyncWorker(ws) {
  clearInterval(ws.syncTimer);
  ws.syncTimer = setInterval(() => syncNow(ws), 60000);
}

async function fetchAllMeta(token, accId, datePreset) {
  const [summary, campaigns, adsets, ads] = await Promise.all([
    fetchAccountSummary(accId, token, datePreset),
    fetchCampaigns(accId, token, datePreset),
    fetchAdSets(accId, token, datePreset),
    fetchAds(accId, token, datePreset),
  ]);
  return { summary, campaigns, adsets, ads };
}

// 404 Catch-all
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Meta Dashboard running on port ${PORT}`));