const { google } = require("googleapis");

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
let _sheets = null;

async function getSheets() {
  if (_sheets) return _sheets;
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_CREDENTIALS_FILE || "./credentials.json",
    scopes: SCOPES,
  });
  _sheets = google.sheets({ version: "v4", auth });
  return _sheets;
}

const TABS = ["📊 Summary", "📁 Campaigns", "🎯 Ad Sets", "📢 Ads", "🕒 Log"];

async function ensureTabs(sheetId) {
  const sheets = await getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const existing = meta.data.sheets.map((s) => s.properties.title);
  const missing = TABS.filter((t) => !existing.includes(t));
  if (missing.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
      },
    });
  }
}

async function writeTab(sheetId, tabName, rows) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.clear({
    spreadsheetId: sheetId,
    range: `'${tabName}'!A1:ZZ9999`,
  });
  if (!rows || !rows.length) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `'${tabName}'!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: rows },
  });
}

async function syncAll(sheetId, data) {
  if (!sheetId || sheetId === "your_google_sheet_id_here") return;
  
  await ensureTabs(sheetId);
  
  const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  
  // Summary Tab
  const summaryRows = [
    ["🚀 META ADS — LIVE ACCOUNT SUMMARY", ""],
    ["Last Updated", now],
    ["Date Range", `${data.summary.dateStart} → ${data.summary.dateStop}`],
    [""],
    ["METRIC", "VALUE"],
    ["Impressions", data.summary.impressions],
    ["Clicks", data.summary.clicks],
    ["CTR (%)", data.summary.ctr],
    ["Total Spend (₹)", data.summary.spend],
    ["Reach", data.summary.reach],
    ["ROAS", data.summary.purchaseRoas],
    [""],
    ["CONVERSIONS", ""],
    ["Purchases", data.summary.purchases],
    ["Leads", data.summary.leads],
    ["Add to Cart", data.summary.addToCart]
  ];

  // Campaign Tab
  const campHeaders = ["ID", "Name", "Status", "Objective", "Spend", "ROAS", "Purchases", "Impressions", "Clicks"];
  const campRows = data.campaigns.map(c => [c.id, c.name, c.status, c.objective, c.spend, c.purchaseRoas, c.purchases, c.impressions, c.clicks]);

  await Promise.all([
    writeTab(sheetId, "📊 Summary", summaryRows),
    writeTab(sheetId, "📁 Campaigns", [campHeaders, ...campRows]),
  ]);
}

module.exports = { syncAll };
