/* =====================================================
   script.js — CLV & RFM Analytics Dashboard
   Fetches data from Flask API and renders all charts.
   ===================================================== */

"use strict";

// ─────────────────────────────────────────────────────
// 1. GLOBAL STATE
// ─────────────────────────────────────────────────────
const CHARTS = {};                     // stores Chart.js instances

const SEG_COLORS = [
  "#4f8ef7","#34d399","#fbbf24","#f87171",
  "#a78bfa","#22d3ee","#fb923c","#e879f9"
];

const SEG_PILL_STYLE = {
  "Champions":          "background:rgba(52,211,153,.15);color:#34d399;border-color:rgba(52,211,153,.3)",
  "Loyal Customers":    "background:rgba(79,142,247,.15);color:#4f8ef7;border-color:rgba(79,142,247,.3)",
  "Potential Loyalist": "background:rgba(167,139,250,.15);color:#a78bfa;border-color:rgba(167,139,250,.3)",
  "New Customers":      "background:rgba(34,211,238,.15);color:#22d3ee;border-color:rgba(34,211,238,.3)",
  "At Risk":            "background:rgba(251,191,36,.15);color:#fbbf24;border-color:rgba(251,191,36,.3)",
  "Can't Lose Them":    "background:rgba(248,113,113,.15);color:#f87171;border-color:rgba(248,113,113,.3)",
  "Lost Customers":     "background:rgba(156,63,63,.15);color:#e05252;border-color:rgba(156,63,63,.3)",
  "Hibernating":        "background:rgba(100,100,120,.15);color:#8888aa;border-color:rgba(100,100,120,.3)"
};

const SEG_ACTIONS = {
  "Champions":          "🎁 Reward & retain — VIP program",
  "Loyal Customers":    "💌 Upsell premium products",
  "Potential Loyalist": "🌱 Nurture with offers",
  "New Customers":      "👋 Onboard & welcome",
  "At Risk":            "⚠️ Send win-back emails NOW",
  "Can't Lose Them":    "🚨 Priority re-engagement",
  "Lost Customers":     "💔 Last-chance discount",
  "Hibernating":        "💤 Low-cost reactivation"
};

// Global Chart.js defaults (dark theme)
Chart.defaults.color         = "#7a80a0";
Chart.defaults.borderColor   = "rgba(42,47,69,.6)";
Chart.defaults.font.family   = "Inter, sans-serif";
Chart.defaults.font.size     = 11;

// ─────────────────────────────────────────────────────
// 2. FORMATTING HELPERS
// ─────────────────────────────────────────────────────
const fmt   = n => "£" + Number(n).toLocaleString("en-GB", {maximumFractionDigits: 0});
const fmtFull = n => "£" + Number(n).toLocaleString("en-GB", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const fmtK  = n => n >= 1_000_000 ? "£"+(n/1_000_000).toFixed(2)+"M"
                  : n >= 1_000    ? "£"+(n/1_000).toFixed(1)+"K"
                  : fmt(n);

// ─────────────────────────────────────────────────────
// 3. CHART HELPER — destroy old, create new
// ─────────────────────────────────────────────────────
function destroyChart(key) {
  if (CHARTS[key]) { CHARTS[key].destroy(); delete CHARTS[key]; }
}

// ─────────────────────────────────────────────────────
// 4. POPULATE FILTER DROPDOWNS FROM /api/filters
// ─────────────────────────────────────────────────────
async function populateFilters() {
  const res  = await fetch("/api/filters");
  const data = await res.json();

  // Countries
  const cSel = document.getElementById("countryFilter");
  data.countries.forEach(c => {
    const opt = document.createElement("option");
    opt.value = opt.textContent = c;
    cSel.appendChild(opt);
  });

  // Months
  const fromSel = document.getElementById("monthFrom");
  const toSel   = document.getElementById("monthTo");
  data.months.forEach(m => {
    [fromSel, toSel].forEach(sel => {
      const opt = document.createElement("option");
      opt.value = opt.textContent = m;
      sel.appendChild(opt);
    });
  });
  // Default "To" = last month
  toSel.value = data.months[data.months.length - 1] || "";
}

// ─────────────────────────────────────────────────────
// 5. APPLY FILTERS → FETCH DATA
// ─────────────────────────────────────────────────────
async function applyFilters() {
  const country   = document.getElementById("countryFilter").value;
  const monthFrom = document.getElementById("monthFrom").value;
  const monthTo   = document.getElementById("monthTo").value;

  const params = new URLSearchParams();
  if (country)   params.set("country",    country);
  if (monthFrom) params.set("month_from", monthFrom);
  if (monthTo)   params.set("month_to",   monthTo);

  // Show filter bar
  const isFiltered = country !== "All" || monthFrom || monthTo;
  const filterBar  = document.getElementById("filterBar");
  if (isFiltered) {
    const parts = [];
    if (country !== "All") parts.push(country);
    if (monthFrom)         parts.push("From " + monthFrom);
    if (monthTo)           parts.push("To " + monthTo);
    document.getElementById("filterBarText").textContent = parts.join("  ·  ");
    filterBar.classList.remove("hidden");
  } else {
    filterBar.classList.add("hidden");
  }

  // Update subtitle
  const cLabel = country === "All" ? "All Countries" : country;
  const range  = (monthFrom && monthTo)  ? `${monthFrom} – ${monthTo}`
                : monthFrom              ? `From ${monthFrom}`
                : monthTo                ? `To ${monthTo}`
                : "All Time";
  document.getElementById("pageSub").textContent = `${cLabel} · ${range}`;

  try {
    const res  = await fetch("/api/data?" + params.toString());
    const data = await res.json();
    if (data.error) { alert("API error: " + data.error); return; }
    renderDashboard(data);
  } catch (err) {
    console.error("Fetch error:", err);
    alert("Could not reach Flask API. Is app.py running?");
  }
}

// ─────────────────────────────────────────────────────
// 6. MASTER RENDER
// ─────────────────────────────────────────────────────
function renderDashboard(d) {
  renderKPIs(d);
  renderOverviewCharts(d);
  renderRFMPage(d);
  renderRevenuePage(d);
  renderCustomersPage(d);
  renderInsightsPage(d);
}

// ─────────────────────────────────────────────────────
// 7. KPI CARDS
// ─────────────────────────────────────────────────────
function renderKPIs(d) {
  document.getElementById("kpiRevenue").textContent   = fmtK(d.total_revenue);
  document.getElementById("kpiCustomers").textContent = d.total_customers.toLocaleString();
  document.getElementById("kpiOrders").textContent    = d.total_orders.toLocaleString();
  document.getElementById("kpiAOV").textContent       = fmt(d.avg_order_value);

  // Insight notes
  document.getElementById("kpiRevenueNote").innerHTML  = `<span>📦</span> Across all invoices`;
  document.getElementById("kpiCustomersNote").innerHTML = `<span>👤</span> Unique buyer IDs`;
  document.getElementById("kpiOrdersNote").innerHTML    = `<span>🛒</span> Unique invoices`;
  document.getElementById("kpiAOVNote").innerHTML       = `<span>💰</span> Revenue ÷ Orders`;
}

// ─────────────────────────────────────────────────────
// 8. OVERVIEW PAGE CHARTS
// ─────────────────────────────────────────────────────
function renderOverviewCharts(d) {
  const monthly = d.monthly_revenue;

  // ── Monthly Revenue Line ──
  destroyChart("revLine");
  CHARTS["revLine"] = new Chart(document.getElementById("chartRevenueLine"), {
    type: "line",
    data: {
      labels: monthly.labels,
      datasets: [{
        data: monthly.values,
        borderColor: "#4f8ef7",
        backgroundColor: "rgba(79,142,247,.1)",
        fill: true,
        tension: .4,
        pointRadius: 3,
        pointHoverRadius: 6,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: {
          grid: { color: "rgba(42,47,69,.5)" },
          ticks: { callback: v => fmtK(v) }
        }
      }
    }
  });
  document.getElementById("overviewMonthBadge").textContent = monthly.labels.length + " Months";

  // ── Segment Bars (sidebar) ──
  const segs = d.rfm_segments;
  const maxCount = Math.max(...segs.map(s => s.Count));
  const segCont = document.getElementById("segBars");
  segCont.innerHTML = "";
  segs.forEach((s, i) => {
    const pct = maxCount > 0 ? Math.round(s.Count / maxCount * 100) : 0;
    const div = document.createElement("div");
    div.className = "seg-row";
    div.innerHTML = `
      <div class="seg-meta">
        <span class="seg-name" style="color:${SEG_COLORS[i % SEG_COLORS.length]}">${s.Segment}</span>
        <span style="color:var(--muted)">${s.Count.toLocaleString()}</span>
      </div>
      <div class="seg-bar-bg">
        <div class="seg-bar-fill" style="width:0%;background:${SEG_COLORS[i % SEG_COLORS.length]}"
             data-pct="${pct}%"></div>
      </div>`;
    segCont.appendChild(div);
  });
  requestAnimationFrame(() => {
    document.querySelectorAll(".seg-bar-fill").forEach(el => {
      el.style.width = el.dataset.pct;
    });
  });
  document.getElementById("overviewSegBadge").textContent = d.total_customers.toLocaleString() + " Customers";

  // ── Revenue by Country (Horizontal Bar) ──
  const rbc = d.revenue_by_country;
  destroyChart("country");
  CHARTS["country"] = new Chart(document.getElementById("chartCountry"), {
    type: "bar",
    data: {
      labels: rbc.labels.map(l => l.length > 14 ? l.slice(0,14)+"…" : l),
      datasets: [{
        data: rbc.values,
        backgroundColor: rbc.labels.map((_, i) => i === 0 ? "#4f8ef7" : "rgba(79,142,247,.35)"),
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true, indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { color: "rgba(42,47,69,.5)" },
          ticks: { callback: v => fmtK(v) }
        },
        y: { grid: { display: false } }
      }
    }
  });

  // ── Segment Donut ──
  destroyChart("donut");
  CHARTS["donut"] = new Chart(document.getElementById("chartDonut"), {
    type: "doughnut",
    data: {
      labels: segs.map(s => s.Segment),
      datasets: [{
        data: segs.map(s => s.Count),
        backgroundColor: SEG_COLORS,
        borderWidth: 2,
        borderColor: "#181c27",
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "right", labels: { boxWidth: 10, padding: 8 } }
      },
      cutout: "62%"
    }
  });

  // ── Orders by Day of Week ──
  const obd = d.orders_by_day;
  destroyChart("weekday");
  CHARTS["weekday"] = new Chart(document.getElementById("chartWeekday"), {
    type: "bar",
    data: {
      labels: obd.labels.map(l => l.slice(0, 3)),
      datasets: [{
        data: obd.values,
        backgroundColor: obd.labels.map((_, i) => i === 0 ? "#34d399" : "rgba(52,211,153,.4)"),
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: "rgba(42,47,69,.5)" } }
      }
    }
  });
}

// ─────────────────────────────────────────────────────
// 9. RFM PAGE
// ─────────────────────────────────────────────────────
function renderRFMPage(d) {
  const segs = d.rfm_segments;

  // Average RFM metrics
  const totalCust  = segs.reduce((a, s) => a + s.Count, 0) || 1;
  const avgRecency = segs.reduce((a, s) => a + s.AvgRecency  * s.Count, 0) / totalCust;
  const avgFreq    = segs.reduce((a, s) => a + s.AvgFrequency * s.Count, 0) / totalCust;
  const avgMon     = segs.reduce((a, s) => a + s.AvgMonetary  * s.Count, 0) / totalCust;

  document.getElementById("rfmAvgR").textContent = Math.round(avgRecency) + " days";
  document.getElementById("rfmAvgF").textContent = avgFreq.toFixed(1) + " orders";
  document.getElementById("rfmAvgM").textContent = fmt(avgMon);
  document.getElementById("rfmSegBadge").textContent = totalCust.toLocaleString() + " Customers";

  // ── Segment Bar Chart ──
  destroyChart("segBar");
  CHARTS["segBar"] = new Chart(document.getElementById("chartSegBar"), {
    type: "bar",
    data: {
      labels: segs.map(s => s.Segment),
      datasets: [{
        label: "Customers",
        data: segs.map(s => s.Count),
        backgroundColor: SEG_COLORS,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false },
             ticks: { maxRotation: 30 } },
        y: { grid: { color: "rgba(42,47,69,.5)" } }
      }
    }
  });

  // ── Revenue Share Donut ──
  destroyChart("revShare");
  CHARTS["revShare"] = new Chart(document.getElementById("chartRevShare"), {
    type: "doughnut",
    data: {
      labels: segs.map(s => s.Segment),
      datasets: [{
        data: segs.map(s => s.TotalRevenue),
        backgroundColor: SEG_COLORS,
        borderWidth: 2,
        borderColor: "#181c27",
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "right", labels: { boxWidth: 10, padding: 8 } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${fmtFull(ctx.parsed)}`
          }
        }
      },
      cutout: "58%"
    }
  });

  // ── CLV by Segment Bar Chart (NEW) ──
  const clv = d.clv_by_segment;
  destroyChart("clvSeg");
  CHARTS["clvSeg"] = new Chart(document.getElementById("chartCLVSegment"), {
    type: "bar",
    data: {
      labels: clv.labels,
      datasets: [{
        label: "Avg CLV (£)",
        data: clv.values,
        backgroundColor: SEG_COLORS,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` Avg CLV: ${fmtFull(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 30 } },
        y: {
          grid: { color: "rgba(42,47,69,.5)" },
          ticks: { callback: v => fmtK(v) }
        }
      }
    }
  });

  // ── Top 10 Customers Table (NEW) ──
  const tbody = document.getElementById("topCustomersTable");
  tbody.innerHTML = "";
  d.top_customers.forEach((c, i) => {
    const rankClass = i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "";
    const pillStyle = SEG_PILL_STYLE[c.Segment] || "";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="rank-badge ${rankClass}">${c.rank}</span></td>
      <td><strong>${c.CustomerID}</strong></td>
      <td>${c.Recency} days</td>
      <td>${c.Frequency} orders</td>
      <td><strong style="color:var(--green)">${fmtFull(c.Monetary)}</strong></td>
      <td><span class="score-chip">${c.RFM_Score}</span></td>
      <td><span class="pill" style="${pillStyle}">${c.Segment}</span></td>`;
    tbody.appendChild(tr);
  });
}

// ─────────────────────────────────────────────────────
// 10. REVENUE TRENDS PAGE
// ─────────────────────────────────────────────────────
function renderRevenuePage(d) {
  const monthly = d.monthly_revenue;
  const labels  = monthly.labels;
  const values  = monthly.values;

  // Compute stats
  const peakVal   = Math.max(...values);
  const peakIdx   = values.indexOf(peakVal);
  const peakLabel = labels[peakIdx] || "—";
  const avgRev    = values.reduce((a, v) => a + v, 0) / (values.length || 1);

  // MoM Growth %
  const growth = values.map((v, i) =>
    i === 0 ? 0 : parseFloat(((v - values[i-1]) / (values[i-1] || 1) * 100).toFixed(1))
  );
  const bestGrowthVal = Math.max(...growth.slice(1));
  const bestGrowthIdx = growth.indexOf(bestGrowthVal);
  const bestGrowthLabel = labels[bestGrowthIdx] || "—";

  // Update KPIs
  document.getElementById("trendPeakMonth").textContent      = peakLabel;
  document.getElementById("trendPeakRev").textContent        = fmtK(peakVal);
  document.getElementById("trendAvgRev").textContent         = fmtK(avgRev);
  document.getElementById("trendBestGrowth").textContent     = "+" + bestGrowthVal + "%";
  document.getElementById("trendBestGrowthNote").textContent = "In " + bestGrowthLabel;
  document.getElementById("revBarBadge").textContent         = labels.length + " Months";

  // ── Monthly Revenue Bar ──
  destroyChart("revBar");
  CHARTS["revBar"] = new Chart(document.getElementById("chartRevBar"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Revenue",
        data: values,
        backgroundColor: values.map((v, i) =>
          i === peakIdx ? "#fbbf24" : "rgba(79,142,247,.55)"
        ),
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => " " + fmtFull(ctx.parsed.y) } }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          grid: { color: "rgba(42,47,69,.5)" },
          ticks: { callback: v => fmtK(v) }
        }
      }
    }
  });

  // ── Cumulative Revenue ──
  const cumul = values.reduce((acc, v) => {
    acc.push((acc[acc.length - 1] || 0) + v);
    return acc;
  }, []);
  destroyChart("cumul");
  CHARTS["cumul"] = new Chart(document.getElementById("chartCumul"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        data: cumul,
        borderColor: "#34d399",
        backgroundColor: "rgba(52,211,153,.1)",
        fill: true,
        tension: .3,
        pointRadius: 0,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: {
          grid: { color: "rgba(42,47,69,.5)" },
          ticks: { callback: v => fmtK(v) }
        }
      }
    }
  });

  // ── MoM Growth % ──
  destroyChart("growth");
  CHARTS["growth"] = new Chart(document.getElementById("chartGrowth"), {
    type: "bar",
    data: {
      labels: labels.slice(1),
      datasets: [{
        data: growth.slice(1),
        backgroundColor: growth.slice(1).map(g =>
          g >= 0 ? "rgba(52,211,153,.65)" : "rgba(248,113,113,.65)"
        ),
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: {
          grid: { color: "rgba(42,47,69,.5)" },
          ticks: { callback: v => v + "%" }
        }
      }
    }
  });
}

// ─────────────────────────────────────────────────────
// 11. CUSTOMERS PAGE
// ─────────────────────────────────────────────────────
function renderCustomersPage(d) {
  // ── New Customers per Month ──
  const nc = d.new_customers_monthly;
  destroyChart("newCust");
  CHARTS["newCust"] = new Chart(document.getElementById("chartNewCust"), {
    type: "bar",
    data: {
      labels: nc.labels,
      datasets: [{
        data: nc.values,
        backgroundColor: "rgba(167,139,250,.6)",
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: "rgba(42,47,69,.5)" } }
      }
    }
  });

  // ── Customers by Country ──
  const cbc = d.customers_by_country;
  destroyChart("custCountry");
  CHARTS["custCountry"] = new Chart(document.getElementById("chartCustCountry"), {
    type: "bar",
    data: {
      labels: cbc.labels.map(l => l.length > 13 ? l.slice(0,13)+"…" : l),
      datasets: [{
        data: cbc.values,
        backgroundColor: cbc.labels.map((_, i) => i === 0 ? "#22d3ee" : "rgba(34,211,238,.35)"),
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true, indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: "rgba(42,47,69,.5)" } },
        y: { grid: { display: false } }
      }
    }
  });

  // ── Segment Health Table ──
  const tbody = document.getElementById("segHealthTable");
  tbody.innerHTML = "";
  d.rfm_segments.forEach((s, i) => {
    const action = SEG_ACTIONS[s.Segment] || "—";
    const pill   = SEG_PILL_STYLE[s.Segment] || "";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="pill" style="${pill}">${s.Segment}</span></td>
      <td><strong>${s.Count.toLocaleString()}</strong></td>
      <td>${s.Pct}</td>
      <td>${s.AvgRecency} days</td>
      <td>${s.AvgFrequency} orders</td>
      <td style="color:var(--green);font-weight:600">${fmtFull(s.AvgMonetary)}</td>
      <td style="color:${SEG_COLORS[i % SEG_COLORS.length]};font-size:12px">${action}</td>`;
    tbody.appendChild(tr);
  });
}

// ─────────────────────────────────────────────────────
// 12. INSIGHTS PAGE
// ─────────────────────────────────────────────────────
function renderInsightsPage(d) {
  const segs    = d.rfm_segments;
  const country = document.getElementById("countryFilter").value;
  const cLabel  = country === "All" ? "all countries" : country;

  const champs = segs.find(s => s.Segment === "Champions")       || {Count:0, Pct:"0%", AvgMonetary:0};
  const atRisk = segs.find(s => s.Segment === "At Risk")         || {Count:0, Pct:"0%"};
  const lost   = segs.find(s => s.Segment === "Lost Customers")  || {Count:0};
  const potLoy = segs.find(s => s.Segment === "Potential Loyalist") || {Count:0};

  const monthly = d.monthly_revenue;
  const peakVal = Math.max(...monthly.values);
  const peakLab = monthly.labels[monthly.values.indexOf(peakVal)] || "—";

  const topCtry    = d.revenue_by_country.labels[0] || "—";
  const topCtryRev = d.revenue_by_country.values[0] || 0;
  const topCtryPct = d.total_revenue > 0
    ? Math.round(topCtryRev / d.total_revenue * 100) : 0;

  document.getElementById("insightsSub").textContent =
    `Derived from RFM analysis of ${d.total_customers.toLocaleString()} customers in ${cLabel}.`;

  document.getElementById("insightsGrid").innerHTML = `
    <div class="insight">
      <div class="insight-num">01</div>
      <h4>🏆 Champion Customers Drive Revenue</h4>
      <p>${champs.Count.toLocaleString()} customers (${champs.Pct}) are Champions. They buy frequently,
      recently, and spend the most — averaging ${fmt(champs.AvgMonetary)} each.
      Reward them with loyalty programs, early access, or VIP discounts to maintain retention.</p>
      <span class="insight-tag" style="background:rgba(52,211,153,.12);color:var(--green)">High Priority</span>
    </div>
    <div class="insight">
      <div class="insight-num">02</div>
      <h4>⚠️ ${atRisk.Count.toLocaleString()} Customers Are At Risk of Churning</h4>
      <p>At Risk customers (${atRisk.Pct}) once bought actively but haven't returned recently.
      Send personalised discount codes or "We miss you" emails within 30 days
      before they cross into the Lost segment permanently.</p>
      <span class="insight-tag" style="background:rgba(251,191,36,.12);color:var(--amber)">Urgent Action</span>
    </div>
    <div class="insight">
      <div class="insight-num">03</div>
      <h4>📈 Peak Revenue Month: ${peakLab}</h4>
      <p>Revenue peaked at ${fmtFull(peakVal)} in ${peakLab}, driven by seasonal shopping demand.
      The business should increase inventory and marketing spend 4–6 weeks before
      this window every year to capitalise on demand.</p>
      <span class="insight-tag" style="background:rgba(251,191,36,.12);color:var(--amber)">Seasonal</span>
    </div>
    <div class="insight">
      <div class="insight-num">04</div>
      <h4>🌍 ${topCtry} Leads with ${topCtryPct}% of Revenue</h4>
      <p>${topCtry} contributes ${fmtFull(topCtryRev)} — approximately ${topCtryPct}% of total revenue.
      ${topCtryPct > 75
        ? "High concentration risk. Diversifying into secondary markets reduces dependency."
        : "Good regional spread. Continue strengthening secondary markets."}</p>
      <span class="insight-tag" style="background:rgba(79,142,247,.12);color:var(--accent)">Geographic</span>
    </div>
    <div class="insight">
      <div class="insight-num">05</div>
      <h4>🌱 Grow Potential Loyalists into Champions</h4>
      <p>${potLoy.Count.toLocaleString()} Potential Loyalists show decent engagement but haven't fully
      committed. Cross-selling complementary products, loyalty points, and personalised
      recommendations can push them into the Loyal or Champion tier.</p>
      <span class="insight-tag" style="background:rgba(167,139,250,.12);color:var(--purple)">Growth</span>
    </div>
    <div class="insight">
      <div class="insight-num">06</div>
      <h4>💔 ${lost.Count.toLocaleString()} Lost Customers Need Win-Back</h4>
      <p>Lost customers score low on all RFM dimensions. A targeted campaign with a strong
      incentive (e.g. 25–30% discount, free shipping) could reactivate 10–15% of them.
      After 3 failed attempts, remove from active mailing lists to reduce cost.</p>
      <span class="insight-tag" style="background:rgba(34,211,238,.12);color:var(--cyan)">Win-Back</span>
    </div>`;
}

// ─────────────────────────────────────────────────────
// 13. PAGE NAVIGATION
// ─────────────────────────────────────────────────────
const PAGE_TITLES = {
  overview  : "Business Overview",
  rfm       : "RFM Analysis",
  revenue   : "Revenue Trends",
  customers : "Customer Analysis",
  insights  : "Insights & Recommendations"
};

function showPage(id, btn) {
  document.querySelectorAll(".content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
  document.getElementById("page-" + id).classList.add("active");
  btn.classList.add("active");
  document.getElementById("pageTitle").textContent = PAGE_TITLES[id] || id;
}

// ─────────────────────────────────────────────────────
// 14. LOADING STEPS ANIMATION
// ─────────────────────────────────────────────────────
function markStep(id) {
  return new Promise(res => {
    setTimeout(() => {
      document.getElementById(id).classList.add("done");
      res();
    }, 400);
  });
}

// ─────────────────────────────────────────────────────
// 15. INIT
// ─────────────────────────────────────────────────────
async function initDashboard() {
  await markStep("ls1");
  await populateFilters();
  await markStep("ls2");
  await applyFilters();         // fetch data with default (All / All)
  await markStep("ls3");
  await markStep("ls4");

  // Fade out loader
  const loader = document.getElementById("loaderOverlay");
  loader.style.transition = "opacity .4s";
  loader.style.opacity = "0";
  setTimeout(() => loader.classList.add("hidden"), 420);
}

// Kick off!
initDashboard();
