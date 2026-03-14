# 🚀 Meta Ads Live Dashboard

Full-stack real-time Meta Ads reporting dashboard with:
- **Live Frontend Dashboard** (dark UI, auto-updates)
- **Backend API** (Express + WebSocket)
- **Google Sheets Auto-Sync**

---

## 📁 Project Structure

```
meta-ads-dashboard/
├── backend/
│   ├── src/
│   │   ├── server.js      ← Express + WebSocket server
│   │   ├── metaApi.js     ← Meta Ads API fetcher
│   │   └── sheetsApi.js   ← Google Sheets writer
│   ├── .env.example       ← Copy to .env and fill in values
│   ├── credentials.json   ← (You place this here)
│   └── package.json
├── frontend/
│   ├── index.html         ← Open this in browser
│   ├── css/style.css
│   └── js/app.js
└── README.md
```

---

## ✅ STEP 1 — Install Node.js

Download LTS version: https://nodejs.org

Verify:
```bash
node --version
npm --version
```

---

## ✅ STEP 2 — Install Backend Dependencies

```bash
cd backend
npm install
```

---

## ✅ STEP 3 — Get Meta Access Token

1. Go to → https://developers.facebook.com/tools/explorer/
2. Select your App
3. Click **Generate Access Token**
4. Add permissions: `ads_read`, `ads_management`, `read_insights`
5. Copy the token

> **For long-term use**: Create a System User in Meta Business Manager → Assign to your Ad Account → Generate a System User Token (never expires)

---

## ✅ STEP 4 — Get Ad Account ID

1. Go to → https://adsmanager.facebook.com
2. Look at the URL: `act_XXXXXXXXXX`
3. Copy just the number **without** `act_`

---

## ✅ STEP 5 — Google Sheets Setup

### a. Create Google Cloud Project
1. Go to → https://console.cloud.google.com
2. Create project: "Meta Ads Dashboard"

### b. Enable Sheets API
1. APIs & Services → Enable APIs
2. Search "Google Sheets API" → Enable

### c. Create Service Account
1. APIs & Services → Credentials → Create Credentials → Service Account
2. Name: `meta-ads-reporter`
3. Click Done

### d. Download JSON Key
1. Click on the service account
2. Keys → Add Key → Create new key → JSON
3. Download → Rename to **credentials.json**
4. Place it inside the `backend/` folder

### e. Share your Google Sheet
1. Open/create your Google Sheet
2. Click Share
3. Paste the service account email (found in credentials.json as `client_email`)
4. Give **Editor** access → Done

---

## ✅ STEP 6 — Configure .env

```bash
cd backend
cp .env.example .env
```

Edit `.env` and fill in:
```
META_ACCESS_TOKEN=your_token_here
META_AD_ACCOUNT_ID=123456789
GOOGLE_SHEET_ID=1BxiMVs0XRA5nF...
GOOGLE_CREDENTIALS_FILE=./credentials.json
PORT=4000
UPDATE_INTERVAL_SECONDS=10
DATE_PRESET=today
```

> **Sheet ID** is in the URL:
> `https://docs.google.com/spreadsheets/d/THIS_IS_YOUR_ID/edit`

---

## ✅ STEP 7 — Start Backend

```bash
cd backend
npm start
```

You should see:
```
╔═══════════════════════════════════════════╗
║   META ADS LIVE REPORTER — BACKEND API   ║
╚═══════════════════════════════════════════╝

  API    → http://localhost:4000/api
  WS     → ws://localhost:4000
  Refresh→ every 10s

[Run #1] ✅  5 campaigns | 12 adsets | 28 ads | Spend: ₹4250.00
```

---

## ✅ STEP 8 — Open Frontend

Just open this file in your browser:
```
frontend/index.html
```

Or use VS Code → Right click → Open with Live Server

You'll see the live dashboard auto-updating every 10 seconds!

---

## 📊 Dashboard Tabs

| Tab | Content |
|-----|---------|
| Overview | KPI cards: Spend, ROAS, Impressions, CTR + Conversions + Engagement |
| Campaigns | Full campaign-level data table |
| Ad Sets | Ad set breakdown |
| Ads | Individual ad performance |

## 🔌 API Endpoints

| Endpoint | Description |
|----------|-------------|
| GET /api/health | Server status |
| GET /api/data | Full data snapshot |
| GET /api/summary | Account summary |
| GET /api/campaigns | All campaigns |
| GET /api/adsets | All ad sets |
| GET /api/ads | All ads |
| POST /api/refresh | Trigger manual refresh |

---

## 🔁 Run 24/7 with PM2

```bash
npm install -g pm2
cd backend
pm2 start src/server.js --name meta-ads
pm2 save
pm2 startup
```

---

## ❓ Common Errors

| Error | Fix |
|-------|-----|
| `Invalid OAuth access token` | Regenerate Meta Access Token |
| `The caller does not have permission` | Share Google Sheet with service account email |
| `Cannot connect to WebSocket` | Make sure backend is running on port 4000 |
| `Ad account not found` | Check AD_ACCOUNT_ID (no `act_` prefix) |
| `Cannot find module` | Run `npm install` in backend folder |
