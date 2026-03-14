const API = (window.location.protocol === "file:" || window.location.hostname === "" || window.location.hostname === "localhost") ? "http://localhost:4000/api" : window.location.origin + "/api";

const EXPLORER_CATS = [
  {id:"all",      label:"All",            color:"#546882"},
  {id:"basic",    label:"Dimensions",     color:"#22c55e"},
  {id:"delivery", label:"Delivery",       color:"#1877F2"},
  {id:"cost",     label:"Cost & Spend",   color:"#a78bfa"},
  {id:"conv",     label:"Conversions",    color:"#f472b6"},
  {id:"engage",   label:"Engagement",     color:"#f59e0b"},
  {id:"video",    label:"Video",          color:"#2dd4bf"},
  {id:"audience", label:"Audience",       color:"#f87171"},
  {id:"action",   label:"Actions",        color:"#fb923c"},
];

const EXPLORER_FIELDS = [
  {cat:"basic",    name:"Account ID",            api:"account_id",                              type:"str", desc:"Your ad account identifier"},
  {cat:"basic",    name:"Account Name",          api:"account_name",                            type:"str", desc:"Name of the ad account"},
  {cat:"basic",    name:"Campaign ID",           api:"campaign_id",                             type:"str", desc:"Unique ID of the campaign"},
  {cat:"basic",    name:"Campaign Name",         api:"campaign_name",                           type:"str", desc:"Name of the campaign"},
  {cat:"basic",    name:"Campaign Status",       api:"status",                                  type:"str", desc:"ACTIVE / PAUSED / ARCHIVED / DELETED"},
  {cat:"basic",    name:"Objective",             api:"objective",                               type:"str", desc:"Campaign goal: CONVERSIONS, REACH, etc."},
  {cat:"basic",    name:"Ad Set ID",             api:"adset_id",                                type:"str", desc:"Unique ID of the ad set"},
  {cat:"basic",    name:"Ad Set Name",           api:"adset_name",                              type:"str", desc:"Name of the ad set"},
  {cat:"basic",    name:"Ad ID",                 api:"ad_id",                                   type:"str", desc:"Unique ID of the individual ad"},
  {cat:"basic",    name:"Ad Name",               api:"ad_name",                                 type:"str", desc:"Name of the individual ad"},
  {cat:"basic",    name:"Date Start",            api:"date_start",                              type:"date",desc:"Start date of the reporting period"},
  {cat:"basic",    name:"Date Stop",             api:"date_stop",                               type:"date",desc:"End date of the reporting period"},
  {cat:"basic",    name:"Buying Type",           api:"buying_type",                             type:"str", desc:"AUCTION or RESERVED"},
  {cat:"delivery", name:"Impressions",           api:"impressions",                             type:"num", desc:"Total times your ads were shown"},
  {cat:"delivery", name:"Reach",                 api:"reach",                                   type:"num", desc:"Unique people who saw your ad"},
  {cat:"delivery", name:"Frequency",             api:"frequency",                               type:"num", desc:"Average times each person saw your ad"},
  {cat:"delivery", name:"Clicks (All)",          api:"clicks",                                  type:"num", desc:"Total clicks including likes, shares, comments"},
  {cat:"delivery", name:"Unique Clicks",         api:"unique_clicks",                           type:"num", desc:"Unique people who clicked"},
  {cat:"delivery", name:"CTR (All)",             api:"ctr",                                     type:"pct", desc:"Click-through rate = Clicks / Impressions × 100"},
  {cat:"delivery", name:"Unique CTR",            api:"unique_ctr",                              type:"pct", desc:"Unique clicks / Reach × 100"},
  {cat:"delivery", name:"Outbound Clicks",       api:"outbound_clicks",                         type:"arr", desc:"Clicks going to destination outside Facebook"},
  {cat:"delivery", name:"Outbound CTR",          api:"outbound_clicks_ctr",                     type:"arr", desc:"Outbound clicks / Impressions"},
  {cat:"delivery", name:"Inline Link Clicks",    api:"inline_link_clicks",                      type:"num", desc:"Clicks on links in the ad body"},
  {cat:"delivery", name:"Inline CTR",            api:"inline_link_click_ctr",                   type:"pct", desc:"Inline link clicks / Impressions"},
  {cat:"delivery", name:"Quality Ranking",       api:"quality_ranking",                         type:"str", desc:"How quality ranks vs competing ads"},
  {cat:"delivery", name:"Engagement Ranking",    api:"engagement_rate_ranking",                 type:"str", desc:"How engagement ranks vs similar ads"},
  {cat:"delivery", name:"Conversion Ranking",    api:"conversion_rate_ranking",                 type:"str", desc:"How conversion rate ranks vs similar ads"},
  {cat:"cost",     name:"Spend",                 api:"spend",                                   type:"cur", desc:"Total amount spent on your ads (₹)"},
  {cat:"cost",     name:"CPC (All)",             api:"cpc",                                     type:"cur", desc:"Cost per click (all clicks)"},
  {cat:"cost",     name:"CPM",                   api:"cpm",                                     type:"cur", desc:"Cost per 1,000 impressions"},
  {cat:"cost",     name:"CPP",                   api:"cpp",                                     type:"cur", desc:"Cost per 1,000 people reached"},
  {cat:"cost",     name:"Cost Per Result",       api:"cost_per_action_type",                    type:"arr", desc:"Cost per specific action (purchase, lead, etc.)"},
  {cat:"cost",     name:"Cost Per Unique Click", api:"cost_per_unique_click",                   type:"cur", desc:"Spend / unique people who clicked"},
  {cat:"cost",     name:"Cost Per Lead",         api:"cost_per_action_type[lead]",              type:"arr", desc:"Filter action_type = lead"},
  {cat:"cost",     name:"Budget Remaining",      api:"budget_remaining",                        type:"cur", desc:"Amount left in campaign budget"},
  {cat:"cost",     name:"Daily Budget",          api:"daily_budget",                            type:"cur", desc:"Set daily spend limit"},
  {cat:"cost",     name:"Lifetime Budget",       api:"lifetime_budget",                         type:"cur", desc:"Total campaign lifetime budget"},
  {cat:"conv",     name:"Purchases",             api:"actions[purchase]",                       type:"arr", desc:"Total purchase conversions"},
  {cat:"conv",     name:"Purchase Value",        api:"action_values[purchase]",                 type:"arr", desc:"Total revenue from purchases"},
  {cat:"conv",     name:"Purchase ROAS",         api:"purchase_roas",                           type:"arr", desc:"Revenue / Spend — return on ad spend"},
  {cat:"conv",     name:"Leads",                 api:"actions[lead]",                           type:"arr", desc:"Lead form submissions"},
  {cat:"conv",     name:"Add to Cart",           api:"actions[add_to_cart]",                    type:"arr", desc:"Product add-to-cart events"},
  {cat:"conv",     name:"Initiate Checkout",     api:"actions[initiate_checkout]",              type:"arr", desc:"Checkout started events"},
  {cat:"conv",     name:"Add Payment Info",      api:"actions[add_payment_info]",               type:"arr", desc:"Payment info entered"},
  {cat:"conv",     name:"Complete Registration", api:"actions[complete_registration]",          type:"arr", desc:"Registration completions"},
  {cat:"conv",     name:"App Installs",          api:"actions[app_install]",                    type:"arr", desc:"Mobile app install events"},
  {cat:"conv",     name:"Conversions",           api:"conversions",                             type:"arr", desc:"All conversion events combined"},
  {cat:"conv",     name:"Conversion Value",      api:"conversion_values",                       type:"arr", desc:"Total value of all conversions"},
  {cat:"conv",     name:"View Content",          api:"actions[view_content]",                   type:"arr", desc:"Product page view events"},
  {cat:"conv",     name:"Subscribe",             api:"actions[subscribe]",                      type:"arr", desc:"Newsletter / subscription events"},
  {cat:"conv",     name:"Contact",               api:"actions[contact]",                        type:"arr", desc:"Contact form / call events"},
  {cat:"conv",     name:"Search",                api:"actions[search]",                         type:"arr", desc:"On-site search events"},
  {cat:"engage",   name:"Post Engagement",       api:"actions[post_engagement]",                type:"arr", desc:"Total interactions with your post"},
  {cat:"engage",   name:"Post Reactions",        api:"actions[post_reaction]",                  type:"arr", desc:"Like, Love, Haha, Wow, Sad, Angry"},
  {cat:"engage",   name:"Post Comments",         api:"actions[comment]",                        type:"arr", desc:"Comments on your ad post"},
  {cat:"engage",   name:"Post Shares",           api:"actions[post]",                           type:"arr", desc:"Shares of your ad"},
  {cat:"engage",   name:"Page Likes",            api:"actions[like]",                           type:"arr", desc:"New page likes from the ad"},
  {cat:"engage",   name:"Page Follows",          api:"actions[follow]",                         type:"arr", desc:"New page follows from the ad"},
  {cat:"engage",   name:"Link Clicks",           api:"actions[link_click]",                     type:"arr", desc:"Clicks on links in the ad"},
  {cat:"engage",   name:"Photo Views",           api:"actions[photo_view]",                     type:"arr", desc:"Clicks to view photo in full screen"},
  {cat:"engage",   name:"Event Responses",       api:"actions[rsvp]",                           type:"arr", desc:"People who responded to an event ad"},
  {cat:"engage",   name:"Messaging Replies",     api:"actions[onsite_conversion.messaging_first_reply]", type:"arr", desc:"First replies to Messenger ads"},
  {cat:"video",    name:"Video Views",           api:"actions[video_view]",                     type:"arr", desc:"3-second or more video views"},
  {cat:"video",    name:"Video Views (2s)",      api:"video_continuous_2_sec_watched_actions",  type:"arr", desc:"2+ second continuous views"},
  {cat:"video",    name:"ThruPlay Views",        api:"video_thruplay_watched_actions",          type:"arr", desc:"Complete views or 15s+ (whichever is shorter)"},
  {cat:"video",    name:"Video Watched 25%",     api:"video_p25_watched_actions",               type:"arr", desc:"Views where 25% of video was watched"},
  {cat:"video",    name:"Video Watched 50%",     api:"video_p50_watched_actions",               type:"arr", desc:"Views where 50% of video was watched"},
  {cat:"video",    name:"Video Watched 75%",     api:"video_p75_watched_actions",               type:"arr", desc:"Views where 75% of video was watched"},
  {cat:"video",    name:"Video Watched 100%",    api:"video_p100_watched_actions",              type:"arr", desc:"Views where 100% (complete) was watched"},
  {cat:"video",    name:"Avg Watch Time",        api:"video_avg_time_watched_actions",          type:"arr", desc:"Average seconds per view"},
  {cat:"video",    name:"Cost Per ThruPlay",     api:"cost_per_thruplay",                       type:"arr", desc:"Spend / ThruPlay views"},
  {cat:"video",    name:"Cost Per Video View",   api:"cost_per_action_type[video_view]",        type:"arr", desc:"Spend per 3-second video view"},
  {cat:"audience", name:"Age Breakdown",         api:"age",                                     type:"str", desc:"Breakdown by age group (18-24, 25-34, etc.)"},
  {cat:"audience", name:"Gender Breakdown",      api:"gender",                                  type:"str", desc:"Breakdown by male / female / unknown"},
  {cat:"audience", name:"Country",              api:"country",                                  type:"str", desc:"Breakdown by country code"},
  {cat:"audience", name:"Region",               api:"region",                                   type:"str", desc:"Breakdown by state / province"},
  {cat:"audience", name:"Impression Device",    api:"impression_device",                        type:"str", desc:"desktop / mobile_app / ipad / iphone / android"},
  {cat:"audience", name:"Platform Position",    api:"publisher_platform",                       type:"str", desc:"facebook / instagram / audience_network / messenger"},
  {cat:"audience", name:"Device Platform",      api:"device_platform",                          type:"str", desc:"mobile / desktop"},
  {cat:"audience", name:"Placement",            api:"platform_position",                        type:"str", desc:"feed / story / reel / right_hand_column / etc."},
  {cat:"audience", name:"Product ID",           api:"product_id",                               type:"str", desc:"Dynamic product ad item breakdown"},
  {cat:"audience", name:"Hourly Stats",         api:"hourly_stats_aggregated_by_advertiser_time_zone", type:"str", desc:"Hour-by-hour delivery breakdown"},
  {cat:"action",   name:"Actions (All)",        api:"actions",                                  type:"arr", desc:"Array of all action types with counts"},
  {cat:"action",   name:"Action Values",        api:"action_values",                            type:"arr", desc:"Revenue value per action type"},
  {cat:"action",   name:"Cost Per Action",      api:"cost_per_action_type",                     type:"arr", desc:"Cost per each action type"},
  {cat:"action",   name:"Unique Actions",       api:"unique_actions",                           type:"arr", desc:"Unique people per action type"},
  {cat:"action",   name:"Mobile App ROAS",      api:"mobile_app_purchase_roas",                 type:"arr", desc:"ROAS from mobile app purchases"},
  {cat:"action",   name:"Offline Conversions",  api:"actions[offline_conversion.purchase]",     type:"arr", desc:"In-store / phone conversions tracked offline"},
  {cat:"action",   name:"On-Facebook Leads",    api:"actions[onsite_conversion.lead_grouped]",  type:"arr", desc:"Lead forms submitted on Facebook"},
];

let explorerCat = "all";

function explorerBuild() {
  const counts = {};
  EXPLORER_FIELDS.forEach(f => { counts[f.cat] = (counts[f.cat]||0)+1; });
  document.getElementById("explorerCatBar").innerHTML = EXPLORER_CATS.map(c => {
    const cnt = c.id==="all" ? EXPLORER_FIELDS.length : (counts[c.id]||0);
    const isActive = c.id === explorerCat;
    return `<div class="cat-btn ${isActive?"active":""}" onclick="setExplorerCat('${c.id}')"
      style="${isActive?`background:${c.color}22;border-color:${c.color}55;color:${c.color};`:""}">
      <div class="cat-dot" style="background:${c.color};"></div>
      ${c.label} <span style="opacity:.55;font-weight:400">${cnt}</span>
    </div>`;
  }).join("");
}

function setExplorerCat(id) { explorerCat = id; explorerBuild(); explorerRender(); }

function explorerRender() {
  const q = (document.getElementById("explorerSearch")?.value||"").toLowerCase();
  const filtered = EXPLORER_FIELDS.filter(f => {
    const catOk  = explorerCat==="all" || f.cat===explorerCat;
    const matchOk = !q || f.name.toLowerCase().includes(q) || f.api.toLowerCase().includes(q) || f.desc.toLowerCase().includes(q);
    return catOk && matchOk;
  });

  document.getElementById("explorerCount").textContent = filtered.length + " fields";

  if (!filtered.length) {
    document.getElementById("explorerBody").innerHTML = `<div class="exp-empty"><div style="font-size:32px;margin-bottom:10px;">🔍</div><div style="font-size:14px;font-weight:600;">No fields match "${q}"</div></div>`;
    return;
  }

  const catOrder = ["basic","delivery","cost","conv","engage","video","audience","action"];
  const catNames = { basic:"Dimensions", delivery:"Delivery Metrics", cost:"Cost & Spend", conv:"Conversions", engage:"Engagement", video:"Video Analytics", audience:"Audience Breakdown", action:"Action Breakdown" };
  const catColors = { basic:"#22c55e", delivery:"#1877F2", cost:"#a78bfa", conv:"#f472b6", engage:"#f59e0b", video:"#2dd4bf", audience:"#f87171", action:"#fb923c" };
  const typeMap   = { num:"Number", str:"String", pct:"Percent", cur:"Currency", arr:"Array", date:"Date" };
  const typeClass  = { num:"t-num", str:"t-str", pct:"t-pct", cur:"t-cur", arr:"t-arr", date:"t-date" };

  const groups = {};
  filtered.forEach(f => { if (!groups[f.cat]) groups[f.cat]=[]; groups[f.cat].push(f); });

  let html = "";
  catOrder.forEach(cat => {
    if (!groups[cat]) return;
    const color = catColors[cat];
    html += `<div class="exp-section">
      <div class="exp-sec-hdr">
        <div class="exp-sec-dot" style="background:${color};box-shadow:0 0 8px ${color}77;"></div>
        <div class="exp-sec-title">${catNames[cat]}</div>
        <div class="exp-sec-count">${groups[cat].length} fields</div>
      </div>
      <div class="fields-grid">
        ${groups[cat].map(f => `
          <div class="field-card" style="border-left-color:${color}44;" onmouseenter="this.style.borderLeftColor='${color}bb'" onmouseleave="this.style.borderLeftColor='${color}44'">
            <div class="field-top">
              <div>
                <div class="field-name">${f.name}</div>
                <div class="field-api">${f.api}</div>
              </div>
              <div class="type-badge ${typeClass[f.type]}">${typeMap[f.type]}</div>
            </div>
            <div class="field-desc">${f.desc}</div>
          </div>`).join("")}
      </div>
    </div>`;
  });

  document.getElementById("explorerBody").innerHTML = html;
}

function toggleSidebar() { document.getElementById("sidebar").classList.toggle("open"); }

// Connect to status / web socket passively to show account info
window.onload = async () => {
  try {
    const r = await fetch(`${API}/status`);
    const s = await r.json();
    if (!s.connected) {
      window.location.href = "index.html"; 
    } else {
      document.getElementById("sidebarAccName").textContent = s.account?.name || "—";
      document.getElementById("sidebarAccId").textContent   = s.account?.id || "—";
    }
  } catch(e) {}
  
  explorerBuild();
  explorerRender();
};

async function disconnectFacebook() {
  if (!confirm("Disconnect pannida virumbugireergala?")) return;
  try {
    const res = await fetch(`${API}/disconnect`, { method:"POST" });
    const json = await res.json();
    if (json.ok) window.location.href = "index.html";
  } catch(err) { alert("Error: " + err.message); }
}
