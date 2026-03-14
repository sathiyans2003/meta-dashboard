/**
 * Meta Ads API — Access Token மட்டும் போதும்
 * App ID தேவையில்லை!
 *
 * தேவையானது:
 *  1. Access Token  → https://developers.facebook.com/tools/explorer/
 *  2. Ad Account ID → Ads Manager URL-ல் இருக்கும்
 */

const axios = require("axios");

const API_VERSION = "v19.0";
const BASE = `https://graph.facebook.com/${API_VERSION}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanId(id) {
  return String(id).replace(/[^0-9]/g, "");
}

function getAction(actions = [], type) {
  if (!Array.isArray(actions)) return "0";
  const f = actions.find((a) => a.action_type === type);
  return f ? parseFloat(f.value).toFixed(2) : "0";
}

function getRoas(list = []) {
  if (!Array.isArray(list) || !list.length) return "0";
  return parseFloat(list[0].value).toFixed(2);
}

function fmt(val, d = 2) {
  return parseFloat(val || 0).toFixed(d);
}

function getResultsCount(actions = [], objective) {
  if (!Array.isArray(actions)) return 0;
  const obj = String(objective || "").toUpperCase();
  const map = {
    'OUTCOME_SALES':      ['purchase'],
    'OUTCOME_LEADS':      ['lead', 'onsite_conversion.lead_grouped'],
    'OUTCOME_ENGAGEMENT': ['onsite_conversion.messaging_conversation_started_7d', 'post_engagement', 'page_engagement'],
    'OUTCOME_TRAFFIC':    ['link_click', 'landing_page_view'],
    'OUTCOME_AWARENESS':  ['reach'],
    'OUTCOME_APP_PROMOTION': ['app_install']
  };
  const types = map[obj] || ['link_click'];
  let val = 0;
  // Pick the first found action type from the prioritized list to avoid double counting
  for (const t of types) {
    const f = actions.find(a => a.action_type === t);
    if (f && parseFloat(f.value) > 0) {
      val = parseFloat(f.value);
      break; 
    }
  }
  return val;
}

function applyDate(params, datePreset) {
  if (!datePreset || datePreset === "today") {
    params.date_preset = "today";
  } else if (typeof datePreset === "string") {
    params.date_preset = datePreset;
  } else if (datePreset?.since && datePreset?.until) {
    params.time_range = JSON.stringify({ since: datePreset.since, until: datePreset.until });
  }
  return params;
}

async function fetchAll(accountId, token, endpoint, params) {
  let results = [];
  let url = `${BASE}/act_${cleanId(accountId)}/${endpoint}`;
  let currentParams = { ...params, access_token: token };
  while (url) {
    const res = await axios.get(url, { params: currentParams });
    results = results.concat(res.data.data || []);
    url = res.data.paging?.next || null;
    currentParams = null;
  }
  return results;
}

// ─── Validate Token — App ID தேவையில்லை ──────────────────────────────────────

async function validateToken(token) {
  try {
    const res = await axios.get(`${BASE}/me`, {
      params: { access_token: token, fields: "id,name,email" },
    });
    return { ok: true, name: res.data.name, id: res.data.id };
  } catch (err) {
    return { ok: false, error: err.response?.data?.error?.message || err.message };
  }
}

async function validateAccount(accountId, token) {
  try {
    const res = await axios.get(`${BASE}/act_${cleanId(accountId)}`, {
      params: { access_token: token, fields: "id,name,currency,account_status,timezone_name" },
    });
    const statusMap = { 1: "Active", 2: "Disabled", 3: "Unsettled", 7: "Pending Review", 9: "In Grace Period", 100: "Pending Closure", 101: "Closed", 201: "Any Active", 202: "Any Closed" };
    return {
      ok: true,
      id: res.data.id,
      name: res.data.name,
      currency: res.data.currency,
      status: statusMap[res.data.account_status] || "Unknown",
      timezone: res.data.timezone_name,
    };
  } catch (err) {
    return { ok: false, error: err.response?.data?.error?.message || err.message };
  }
}

// ─── Account Summary ──────────────────────────────────────────────────────────

const SUMMARY_FIELDS = [
  "objective", "impressions", "clicks", "unique_clicks", "unique_ctr", "ctr",
  "spend", "reach", "frequency", "cpm", "cpc", "cpp",
  "actions", "action_values",
  "purchase_roas", "website_purchase_roas", "cost_per_action_type",
  "quality_ranking", "engagement_rate_ranking", "conversion_rate_ranking",
  "video_thruplay_watched_actions", "video_p25_watched_actions", 
  "video_p50_watched_actions", "video_p75_watched_actions", 
  "video_p95_watched_actions", "video_p100_watched_actions", 
  "outbound_clicks", "outbound_clicks_ctr",
  "inline_link_clicks", "inline_link_click_ctr", "cost_per_unique_click",
  "date_start", "date_stop"
].join(",");

const ITEM_FIELDS = [
  "objective", "account_currency", "results",
  "impressions", "clicks", "unique_clicks", "unique_ctr", "ctr",
  "spend", "reach", "frequency", "cpm", "cpc", "cpp",
  "actions", "action_values",
  "purchase_roas", "website_purchase_roas", "cost_per_action_type",
  "quality_ranking", "engagement_rate_ranking", "conversion_rate_ranking",
  "video_thruplay_watched_actions", "video_p25_watched_actions", 
  "video_p50_watched_actions", "video_p75_watched_actions", 
  "video_p95_watched_actions", "video_p100_watched_actions", 
  "outbound_clicks", "outbound_clicks_ctr",
  "inline_link_clicks", "inline_link_click_ctr", "cost_per_unique_click",
  "date_start", "date_stop"
].join(",");



function parseMetrics(d) {
  const ac = d.actions || [];
  const av = d.action_values || [];
  const roas = d.purchase_roas || d.website_purchase_roas || [];
  const spend = parseFloat(d.spend || 0);
  const imps = parseInt(d.impressions || 0);
  
  // Prioritize actual 'results' field from API if available
  let resCount = 0;
  if (d.results && Array.isArray(d.results)) {
    resCount = d.results.reduce((acc, r) => acc + parseFloat(r.values?.[0]?.value || r.value || 0), 0);
  } else {
    resCount = getResultsCount(ac, d.objective);
  }

  const cpRes = resCount > 0 ? (spend / resCount) : 0;
  const resRate = imps > 0 ? ((resCount / imps) * 100).toFixed(2) : "0";

  const purchCount = parseFloat(getAction(ac, "purchase"));
  const cpPurch = purchCount > 0 ? (spend / purchCount) : 0;

  const leadCount = parseFloat(getAction(ac, "lead"));
  const cpLead = leadCount > 0 ? (spend / leadCount) : 0;

  const msgCount = parseFloat(getAction(ac, "onsite_conversion.messaging_conversation_started_7d"));
  const cpMsg = msgCount > 0 ? (spend / msgCount) : 0;

  return {
    status: d.status || "UNKNOWN",
    impressions: d.impressions || "0", clicks: d.clicks || "0",
    uniqueClicks: d.unique_clicks || "0", uniqueCtr: fmt(d.unique_ctr),
    ctr: fmt(d.ctr), spend: fmt(d.spend), reach: d.reach || "0",
    frequency: fmt(d.frequency), cpm: fmt(d.cpm), cpc: fmt(d.cpc), cpp: fmt(d.cpp),
    budget: d.budget || "0",

    results: String(resCount),
    costPerResult: fmt(cpRes),
    resultRate: resRate,

    purchases: String(purchCount),
    costPerPurchase: fmt(cpPurch),
    purchaseValue: getAction(av, "purchase"),
    purchaseRoas: getRoas(roas),

    leads: String(leadCount),
    costPerLead: fmt(cpLead),

    addToCart: getAction(ac, "add_to_cart"),
    initiateCheckout: getAction(ac, "initiate_checkout"),
    landingPageViews: getAction(ac, "landing_page_view"),

    messagingConversations: String(msgCount),
    costPerConversation: fmt(cpMsg),

    linkClicks: getAction(ac, "link_click"),
    postEngagement: getAction(ac, "post_engagement"),
    videoViews: getAction(ac, "video_view"),
    v100: d.video_p100_watched_actions?.[0]?.value || "0",

    qualityRanking: d.quality_ranking || "N/A",
    engagementRanking: d.engagement_rate_ranking || "N/A",
    conversionRanking: d.conversion_rate_ranking || "N/A",

    dateStart: d.date_start || "", dateStop: d.date_stop || ""
  };
}

async function fetchAccountSummary(accountId, token, datePreset = "today") {
  let params = applyDate({
    access_token: token,
    fields: SUMMARY_FIELDS,
  }, datePreset);

  const res = await axios.get(`${BASE}/act_${cleanId(accountId)}/insights`, { params });
  const d = res.data.data?.[0] || {};
  return parseMetrics(d);
}

// ─── Campaigns ────────────────────────────────────────────────────────────────

async function fetchCampaigns(accountId, token, datePreset = "today") {
  const params = applyDate({
    level: "campaign",
    fields: `campaign_id,campaign_name,${ITEM_FIELDS}`,
    limit: 500,
  }, datePreset);

  const raw = await fetchAll(accountId, token, "insights", params);
  
  // We need to fetch campaign metadata for budget if insights don't have it
  // But for now let's try mapping from insights if fields allowed
  return raw.map((c) => {
    const budget = c.daily_budget || c.lifetime_budget || "0";
    return {
      id: c.campaign_id || "", name: c.campaign_name || "", objective: c.objective || "",
      ...parseMetrics({ ...c, budget })
    };
  });
}

// ─── Ad Sets ──────────────────────────────────────────────────────────────────

async function fetchAdSets(accountId, token, datePreset = "today") {
  const params = applyDate({
    level: "adset",
    fields: `adset_id,adset_name,campaign_name,${ITEM_FIELDS}`,
    limit: 500,
  }, datePreset);

  const raw = await fetchAll(accountId, token, "insights", params);
  return raw.map((a) => ({
    id: a.adset_id || "", name: a.adset_name || "", campaignName: a.campaign_name || "",
    ...parseMetrics(a)
  }));
}

// ─── Ads ──────────────────────────────────────────────────────────────────────

async function fetchAds(accountId, token, datePreset = "today") {
  const params = applyDate({
    level: "ad",
    fields: `ad_id,ad_name,adset_name,campaign_name,${ITEM_FIELDS}`,
    limit: 500,
  }, datePreset);

  const raw = await fetchAll(accountId, token, "insights", params);
  return raw.map((a) => ({
    id: a.ad_id || "", name: a.ad_name || "", adsetName: a.adset_name || "",
    campaignName: a.campaign_name || "",
    ...parseMetrics(a)
  }));
}

module.exports = { validateToken, validateAccount, fetchAccountSummary, fetchCampaigns, fetchAdSets, fetchAds };