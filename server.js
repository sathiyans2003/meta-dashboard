require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { validateToken, validateAccount, fetchAccountSummary, fetchCampaigns, fetchAdSets, fetchAds } = require("./metaApi");
const { syncAll } = require("./sheetsApi");

const app = express();
app.set("trust proxy", 1);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ─── Middleware: Extract User Session from Headers ──────────────────────────
// Multi-user Support: Each request must carry its own token and account ID
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    const token = req.headers["x-meta-token"];
    const accId = req.headers["x-meta-account-id"];
    const datePreset = req.headers["x-meta-date-preset"] || "today";

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

// ─── API: Fetch Complete Data (On-Demand for Multi-user) ──────────────────────
app.get("/api/data", async (req, res) => {
  if (!req.userSession) return res.status(401).json({ error: "No session. Please connect again." });
  const { token, accId, datePreset } = req.userSession;

  try {
    const [summary, campaigns, adsets, ads] = await Promise.all([
      fetchAccountSummary(accId, token, datePreset),
      fetchCampaigns(accId, token, datePreset),
      fetchAdSets(accId, token, datePreset),
      fetchAds(accId, token, datePreset),
    ]);

    const latestData = { summary, campaigns, adsets, ads };
    
    // Process summary logic (same as before)
    if (campaigns && campaigns.length > 0) {
      let s = { spend: 0, results: 0, purchases: 0, leads: 0, messagingConversations: 0, purchaseValue: 0, impressions: 0, clicks: 0, reach: 0, linkClicks: 0, landingPageViews: 0, uniqueClicks: 0, videoViews: 0, postEngagement: 0, v100: 0 };
      campaigns.forEach(c => {
        s.spend += parseFloat(c.spend || 0); s.results += parseFloat(c.results || 0); s.purchases += parseFloat(c.purchases || 0); s.leads += parseFloat(c.leads || 0); s.messagingConversations += parseFloat(c.messagingConversations || 0); s.purchaseValue += parseFloat(c.purchaseValue || 0); s.impressions += parseFloat(c.impressions || 0); s.clicks += parseFloat(c.clicks || 0); s.reach += parseFloat(c.reach || 0); s.linkClicks += parseFloat(c.linkClicks || 0); s.landingPageViews += parseFloat(c.landingPageViews || 0); s.uniqueClicks += parseFloat(c.uniqueClicks || 0); s.videoViews += parseFloat(c.videoViews || 0); s.postEngagement += parseFloat(c.postEngagement || 0); s.v100 += parseFloat(c.v100 || 0);
      });
      Object.assign(summary, {
        spend: s.spend.toFixed(2), results: String(s.results), purchases: String(s.purchases), leads: String(s.leads), messagingConversations: String(s.messagingConversations), purchaseValue: s.purchaseValue.toFixed(2), impressions: String(s.impressions), clicks: String(s.clicks), reach: String(s.reach), linkClicks: String(s.linkClicks), landingPageViews: String(s.landingPageViews), uniqueClicks: String(s.uniqueClicks), videoViews: String(s.videoViews), postEngagement: String(s.postEngagement), v100: String(s.v100),
        ctr: s.impressions > 0 ? ((s.clicks / s.impressions) * 100).toFixed(2) : "0.00",
        cpc: s.clicks > 0 ? (s.spend / s.clicks).toFixed(2) : "0.00",
        cpm: s.impressions > 0 ? (s.spend / (s.impressions / 1000)).toFixed(2) : "0.00",
        costPerResult: s.results > 0 ? (s.spend / s.results).toFixed(2) : "0.00",
        purchaseRoas: s.spend > 0 ? (s.purchaseValue / s.spend).toFixed(2) : "0.00"
      });
    }

    // Google Sheet Sync (Conditional)
    const sheetId = req.headers["x-google-sheets-id"] || process.env.GOOGLE_SHEET_ID;
    if (sheetId && sheetId !== "your_google_sheet_id_here") {
      syncAll(sheetId, latestData).catch(e => console.error("Sheet sync error:", e.message));
    }

    res.json({ ok: true, status: "ok", lastUpdated: new Date().toISOString(), data: latestData });
  } catch (err) {
    const errMsg = err.response?.data?.error?.message || err.message;
    res.status(400).json({ error: errMsg });
  }
});

// ─── OAuth Routes (Modified for Multi-user flow) ──────────────────────────────
app.get("/auth/facebook", (req, res) => {
  const appId = process.env.META_APP_ID;
  if (!appId || appId === "your_meta_app_id_here") return res.status(400).send("App ID Missing");
  const host = req.get("host");
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const redirect = encodeURIComponent(`${protocol}://${host}/auth/callback`);
  const scope = "ads_read,ads_management,business_management,pages_read_engagement";
  res.redirect(`https://www.facebook.com/dialog/oauth?client_id=${appId}&redirect_uri=${redirect}&scope=${scope}&response_type=code`);
});

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  try {
    const appId = process.env.META_APP_ID; 
    const appSecret = process.env.META_APP_SECRET;
    const host = req.get("host"); 
    const redirect = `https://${host}/auth/callback`;
    const axios = require("axios");

    console.log("OAuth Redirecting with URI:", redirect);

    try {
      const tokenRes = await axios.get(`https://graph.facebook.com/v19.0/oauth/access_token`, {
        params: {
          client_id: appId,
          redirect_uri: redirect,
          client_secret: appSecret,
          code: code
        }
      });

      const longRes = await axios.get(`https://graph.facebook.com/v19.0/oauth/access_token`, {
        params: {
          grant_type: "fb_exchange_token",
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: tokenRes.data.access_token
        }
      });
      const token = longRes.data.access_token;

      const accRes = await axios.get(`https://graph.facebook.com/v19.0/me/adaccounts`, { 
        params: { fields: "id,name,account_status,currency,timezone_name", access_token: token, limit: 50 } 
      });
      const accounts = (accRes.data?.data || []).filter(a => a.account_status === 1);

      res.send(`
        <html><body><script>
          if (window.opener) {
            window.opener.postMessage({ type: 'fb_connected', token: '${token}', accounts: ${JSON.stringify(accounts)} }, '*');
          }
          window.close();
        </script></body></html>
      `);
    } catch (apiErr) {
      console.error("Meta API Error:", apiErr.response?.data || apiErr.message);
      res.status(400).send(`
        <h3>OAuth Error</h3>
        <p><b>Message:</b> ${apiErr.response?.data?.error?.message || apiErr.message}</p>
        <p><b>Redirect URI used:</b> ${redirect}</p>
        <hr>
        <p>Please ensure this URI is added to your Meta App Settings under "Valid OAuth Redirect URIs".</p>
      `);
    }
  } catch (err) { res.send(`OAuth Error: ${err.message}`); }
});

// ─── API: Validation & Other Endpoints ────────────────────────────────────────
app.post("/api/scan-accounts", async (req, res) => {
  const { token } = req.body;
  try {
    const axios = require("axios");
    const r = await axios.get(`https://graph.facebook.com/v19.0/me/adaccounts`, { params: { fields: "id,name,account_status,currency,timezone_name", access_token: token, limit: 50 } });
    res.json({ ok: true, accounts: (r.data?.data || []).filter(a => a.account_status === 1) });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.get("/api/env-config", (_, res) => {
  res.json({ hasAppId: !!process.env.META_APP_ID });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Multi-user Dashboard running on port ${PORT}`));

module.exports = app;