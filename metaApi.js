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
  const v = parseFloat(f?.value || 0);
  return isNaN(v) ? "0" : v.toFixed(2);
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
    'OUTCOME_SALES': [
      'purchase', 'onsite_conversion.purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase', 
      'add_to_cart', 'complete_registration', 'offsite_conversion.fb_pixel_complete_registration', 'submit_application'
    ],
    'OUTCOME_LEADS': [
      'lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'omni_lead', 
      'onsite_conversion.total_lead_value', 'complete_registration', 'offsite_conversion.fb_pixel_complete_registration', 
      'submit_application', 'offsite_conversion.fb_pixel_custom'
    ],
    'OUTCOME_ENGAGEMENT': [
      'onsite_conversion.messaging_conversation_started_7d', 'post_engagement', 'page_engagement', 
      'onsite_conversion.messaging_conversation_started_1d', 'contact', 'onsite_conversion.messaging_conversation_started_grouped'
    ],
    'OUTCOME_TRAFFIC': ['landing_page_view', 'link_click'],
    'OUTCOME_AWARENESS': ['reach', 'impressions'],
    'OUTCOME_APP_PROMOTION': ['app_install']
  };

  // 1. If specific objective is known, sum the relevant action types
  if (obj && map[obj]) {
    const types = map[obj];
    let totalValue = 0;
    let foundAny = false;
    for (const t of types) {
      const f = actions.find(a => a.action_type === t);
      if (f) {
        totalValue += parseFloat(f.value || 0);
        foundAny = true;
      }
    }
    // If it's a Sales/Lead/Messaging objective, return the sum (even if 0) to match campaign goal
    if (['OUTCOME_SALES', 'OUTCOME_LEADS', 'OUTCOME_ENGAGEMENT'].includes(obj)) {
      return totalValue;
    }
    if (foundAny && totalValue > 0) return totalValue;
  }

  // 2. Fallback: Sum core conversion metrics if objective is unknown or fallback needed
  const coreConversions = [
    'purchase', 'onsite_conversion.purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase',
    'lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'omni_lead',
    'onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.messaging_conversation_started_1d',
    'complete_registration', 'offsite_conversion.fb_pixel_complete_registration'
  ];

  let coreSum = 0;
  let foundCore = false;
  coreConversions.forEach(t => {
    const f = actions.find(a => a.action_type === t);
    if (f) {
      coreSum += parseFloat(f.value || 0);
      foundCore = true;
    }
  });

  if (foundCore && coreSum > 0) return coreSum;

  // 3. Last fallback (Traffic ads etc)
  const lp = actions.find(a => a.action_type === 'landing_page_view');
  if (lp && parseFloat(lp.value) > 0) return parseFloat(lp.value);
  
  const lc = actions.find(a => a.action_type === 'link_click');
  return parseFloat(lc?.value || 0);
}

function applyDate(params, datePreset, isNested = false) {
  if (isNested) return params; // Nested insights handle their own daterange via field string
  
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
  "actions", "action_values", "impressions", "clicks", "spend", "reach",
  "frequency", "cpm", "cpc", "cpp", "purchase_roas", "website_purchase_roas",
  "quality_ranking", "engagement_rate_ranking", "conversion_rate_ranking",
  "video_p100_watched_actions", "date_start", "date_stop"
].join(",");

const ITEM_FIELDS = [
  "actions", "action_values", "impressions", "clicks", "spend", "reach",
  "frequency", "cpm", "cpc", "cpp", "purchase_roas", "website_purchase_roas",
  "quality_ranking", "engagement_rate_ranking", "conversion_rate_ranking",
  "video_p100_watched_actions", "date_start", "date_stop"
].join(",");



function getSum(actions = [], types = []) {
  let sum = 0;
  types.forEach(t => {
    const f = actions.find(a => a.action_type === t);
    if (f) sum += parseFloat(f.value || 0);
  });
  return sum.toFixed(2);
}

function parseMetrics(d) {
  const ac = d.actions || [];
  const av = d.action_values || [];
  const roas = d.purchase_roas || d.website_purchase_roas || [];
  const spend = parseFloat(d.spend || 0);
  const imps = parseInt(d.impressions || 0);

  // Always use our custom result calculation logic to ensure accuracy
  const resCount = getResultsCount(ac, d.objective);

  const cpRes = resCount > 0 ? (spend / resCount) : 0;
  const resRate = imps > 0 ? ((resCount / imps) * 100).toFixed(2) : "0";

  const purchCount = parseFloat(getSum(ac, ['purchase', 'onsite_conversion.purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase']));
  const cpPurch = purchCount > 0 ? (spend / purchCount) : 0;

  const leadCount = parseFloat(getSum(ac, ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'omni_lead', 'onsite_conversion.total_lead_value']));
  const cpLead = leadCount > 0 ? (spend / leadCount) : 0;

  const msgCount = parseFloat(getSum(ac, ['onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.messaging_conversation_started_1d']));
  const cpMsg = msgCount > 0 ? (spend / msgCount) : 0;

  const purchValue = getSum(av, ['purchase', 'onsite_conversion.purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase']);

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
    purchaseValue: purchValue,
    purchaseRoas: getRoas(roas),

    leads: String(leadCount),
    costPerLead: fmt(cpLead),

    messagingConversations: String(msgCount),
    costPerConversation: fmt(cpMsg),

    linkClicks: getAction(ac, "link_click"),

    addToCart: getSum(ac, ['add_to_cart', 'onsite_conversion.add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart']),
    initiateCheckout: getSum(ac, ['initiate_checkout', 'onsite_conversion.initiate_checkout', 'offsite_conversion.fb_pixel_initiate_checkout']),
    landingPageViews: getAction(ac, "landing_page_view"),

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

function getInsightsField(datePreset) {
  if (!datePreset || datePreset === "today") return `insights.date_preset(today){${ITEM_FIELDS}}`;
  if (typeof datePreset === "string") return `insights.date_preset(${datePreset}){${ITEM_FIELDS}}`;
  if (datePreset?.since && datePreset?.until) {
    // Stringify JSON carefully for inline GraphQL-like syntax
    const tr = JSON.stringify({ since: datePreset.since, until: datePreset.until });
    return `insights.time_range(${tr}){${ITEM_FIELDS}}`;
  }
  return `insights{${ITEM_FIELDS}}`;
}

// ─── Campaigns ────────────────────────────────────────────────────────────────

async function fetchCampaigns(accountId, token, datePreset = "today") {
  const params = applyDate({
    fields: `id,name,status,objective,daily_budget,lifetime_budget,${getInsightsField(datePreset)}`,
    limit: 100,
  }, datePreset, true); // true = isNested, don't pass date_preset to top level if handled in fields

  const raw = await fetchAll(accountId, token, "campaigns", params);

  return raw.map((c) => {
    const insight = c.insights?.data?.[0] || {};
    const budget = c.daily_budget || c.lifetime_budget || "0";
    const metrics = parseMetrics({ ...insight, budget, objective: c.objective });
    return {
      ...metrics,
      id: c.id,
      name: c.name,
      objective: c.objective || "",
      status: c.status || "UNKNOWN"
    };
  });
}

// ─── Ad Sets ──────────────────────────────────────────────────────────────────

async function fetchAdSets(accountId, token, datePreset = "today") {
  const params = applyDate({
    fields: `id,name,status,campaign{name},daily_budget,lifetime_budget,${getInsightsField(datePreset)}`,
    limit: 100,
  }, datePreset, true);

  const raw = await fetchAll(accountId, token, "adsets", params);

  return raw.map((s) => {
    const insight = s.insights?.data?.[0] || {};
    const budget = s.daily_budget || s.lifetime_budget || "0";
    const metrics = parseMetrics({ ...insight, budget });
    return {
      ...metrics,
      id: s.id,
      name: s.name,
      campaignName: s.campaign?.name || "",
      status: s.status || "UNKNOWN"
    };
  });
}

// ─── Ads ──────────────────────────────────────────────────────────────────────

async function fetchAds(accountId, token, datePreset = "today") {
  const params = applyDate({
    fields: `id,name,status,adset{name},campaign{name},${getInsightsField(datePreset)}`,
    limit: 100,
  }, datePreset, true);

  const raw = await fetchAll(accountId, token, "ads", params);

  return raw.map((a) => {
    const insight = a.insights?.data?.[0] || {};
    const metrics = parseMetrics({ ...insight });
    return {
      ...metrics,
      id: a.id,
      name: a.name,
      adsetName: a.adset?.name || "",
      campaignName: a.campaign?.name || "",
      status: a.status || "UNKNOWN"
    };
  });
}

module.exports = { validateToken, validateAccount, fetchAccountSummary, fetchCampaigns, fetchAdSets, fetchAds };