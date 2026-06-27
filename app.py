"""
CLV & RFM Analytics Dashboard — Flask Backend
============================================================
Author : BCA Minor Project
Dataset: Online Retail (UCI / Kaggle)
Run    : python app.py
Open   : http://127.0.0.1:5000
============================================================
Requirements (install once):
    pip install flask pandas
============================================================
"""

from flask import Flask, jsonify, render_template, request
import pandas as pd
import os

app = Flask(__name__)

# ─────────────────────────────────────────────
# 1.  LOAD & CLEAN DATA  (runs once at startup)
# ─────────────────────────────────────────────
DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "Online_Retail.csv")

def load_data():
    """Load CSV, clean it, and return a ready-to-use DataFrame."""
    df = pd.read_csv(DATA_PATH, encoding="ISO-8859-1")

    # ── Basic cleaning ──────────────────────────────────────
    df.dropna(subset=["CustomerID"], inplace=True)       # drop rows with no customer
    df = df[df["Quantity"] > 0]                          # remove returns / cancellations
    df = df[df["UnitPrice"] > 0]                         # remove zero-price rows
    df["CustomerID"] = df["CustomerID"].astype(int).astype(str)

    # ── Revenue column ──────────────────────────────────────
    df["Revenue"] = df["Quantity"] * df["UnitPrice"]

    # ── Parse dates & extract Month ─────────────────────────
    df["InvoiceDate"] = pd.to_datetime(df["InvoiceDate"], dayfirst=True, errors="coerce")
    df.dropna(subset=["InvoiceDate"], inplace=True)
    df["Month"] = df["InvoiceDate"].dt.to_period("M").astype(str)   # e.g. "2011-03"
    df["DayOfWeek"] = df["InvoiceDate"].dt.day_name()

    return df


# Load once globally
DF_RAW = load_data()

SNAPSHOT_DATE = DF_RAW["InvoiceDate"].max() + pd.Timedelta(days=1)


# ─────────────────────────────────────────────
# 2.  RFM CALCULATION
# ─────────────────────────────────────────────
def compute_rfm(df):
    """Return a per-customer RFM DataFrame with Segment column."""
    snapshot = SNAPSHOT_DATE

    rfm = df.groupby("CustomerID").agg(
        Recency   = ("InvoiceDate", lambda x: (snapshot - x.max()).days),
        Frequency = ("CustomerID", "count"),
        Monetary  = ("Revenue",     "sum"),
    ).reset_index()

    # ── Score each dimension 1-5 ────────────────────────────
    rfm["R_Score"] = pd.qcut(rfm["Recency"],   5, labels=[5,4,3,2,1], duplicates="drop").astype(int)
    rfm["F_Score"] = pd.qcut(rfm["Frequency"].rank(method="first"), 5, labels=[1,2,3,4,5]).astype(int)
    rfm["M_Score"] = pd.qcut(rfm["Monetary"].rank(method="first"),  5, labels=[1,2,3,4,5]).astype(int)
    rfm["RFM_Score"] = rfm["R_Score"].astype(str) + rfm["F_Score"].astype(str) + rfm["M_Score"].astype(str)

    # ── Segment mapping ─────────────────────────────────────
    def segment(row):
        r, f, m = row["R_Score"], row["F_Score"], row["M_Score"]
        if r >= 4 and f >= 4 and m >= 4:
            return "Champions"
        elif r >= 3 and f >= 3:
            return "Loyal Customers"
        elif r >= 4 and f <= 2:
            return "Potential Loyalist"
        elif r >= 3 and f <= 2:
            return "New Customers"
        elif r <= 2 and f >= 3:
            return "At Risk"
        elif r <= 2 and f <= 2 and m >= 3:
            return "Can't Lose Them"
        elif r == 1 and f == 1:
            return "Lost Customers"
        else:
            return "Hibernating"

    rfm["Segment"] = rfm.apply(segment, axis=1)
    return rfm


# ─────────────────────────────────────────────
# 3.  FILTER HELPERS
# ─────────────────────────────────────────────
def filter_df(country=None, month_from=None, month_to=None):
    df = DF_RAW.copy()
    if country and country != "All":
        df = df[df["Country"] == country]
    if month_from:
        df = df[df["Month"] >= month_from]
    if month_to:
        df = df[df["Month"] <= month_to]
    return df


# ─────────────────────────────────────────────
# 4.  ROUTES
# ─────────────────────────────────────────────

@app.route("/")
def index():
    """Serve the main dashboard page."""
    return render_template("index.html")


@app.route("/api/filters")
def api_filters():
    """Return all unique countries and months for dropdown population."""
    countries = sorted(DF_RAW["Country"].dropna().unique().tolist())
    months    = sorted(DF_RAW["Month"].unique().tolist())
    return jsonify({"countries": countries, "months": months})


@app.route("/api/data")
def api_data():
    """
    Main analytics endpoint.
    Query params:
        country     — e.g. "United Kingdom" or "All"
        month_from  — e.g. "2011-01"
        month_to    — e.g. "2011-12"
    Returns:
        total_revenue, total_customers, total_orders, avg_order_value,
        rfm_segments, monthly_revenue,
        top_customers (Top 10 by CLV / Monetary),
        revenue_by_country (Top 10),
        clv_by_segment (Average CLV per segment)
    """
    country    = request.args.get("country",    "All")
    month_from = request.args.get("month_from", None)
    month_to   = request.args.get("month_to",   None)

    df = filter_df(country, month_from, month_to)

    if df.empty:
        return jsonify({"error": "No data for selected filters"}), 400

   
    # ── KPIs ────────────────────────────────────────────────
    total_revenue = float(round(df["Revenue"].sum(), 2))
    total_orders = int(df["CustomerID"].count())
    total_customers = int(df["CustomerID"].nunique())
    avg_order_value = float(round(total_revenue / total_orders, 2)) if total_orders else 0

    # ── Monthly Revenue ─────────────────────────────────────
    monthly = (
        df.groupby("Month")["Revenue"]
          .sum()
          .reset_index()
          .sort_values("Month")
    )
    monthly_revenue = {
        "labels": monthly["Month"].tolist(),
        "values": [float(x) for x in monthly["Revenue"].round(2)],
    }

    # ── Revenue by Country (Top 10) ──────────────────────────
    rev_by_country = (
        df.groupby("Country")["Revenue"]
          .sum()
          .sort_values(ascending=False)
          .head(10)
          .reset_index()
    )
    revenue_by_country = {
        "labels": rev_by_country["Country"].tolist(),
        "values": [float(x) for x in rev_by_country["Revenue"].round(2)],
    }

    # ── RFM + Segments ──────────────────────────────────────
    rfm = compute_rfm(df)

    seg_counts = (
        rfm.groupby("Segment")
           .agg(
               Count     = ("CustomerID", "count"),
               AvgR      = ("Recency",    "mean"),
               AvgF      = ("Frequency",  "mean"),
               AvgM      = ("Monetary",   "mean"),
               TotalM    = ("Monetary",   "sum"),
           )
           .reset_index()
    )
    rfm_segments = []
    for _, row in seg_counts.iterrows():
        pct = round(row["Count"] / len(rfm) * 100, 1) if len(rfm) else 0
        rfm_segments.append({
            "Segment":      row["Segment"],
            "Count":        int(row["Count"]),
            "Pct":          f"{pct}%",
            "AvgRecency":   round(row["AvgR"], 1),
            "AvgFrequency": round(row["AvgF"], 1),
            "AvgMonetary":  round(row["AvgM"], 2),
            "TotalRevenue": round(row["TotalM"], 2),
        })

    # ── Average CLV per Segment ──────────────────────────────
    clv_by_segment = {
        "labels": [s["Segment"]   for s in rfm_segments],
        "values": [s["AvgMonetary"] for s in rfm_segments],
    }

    # ── Top 10 Customers by CLV (Monetary) ──────────────────
    top10 = (
        rfm.nlargest(10, "Monetary")[
            ["CustomerID", "Recency", "Frequency", "Monetary", "RFM_Score", "Segment"]
        ]
    )
    top_customers = [
        {
            "rank":       i + 1,
            "CustomerID": row["CustomerID"],
            "Recency":    int(row["Recency"]),
            "Frequency":  int(row["Frequency"]),
            "Monetary":   round(row["Monetary"], 2),
            "RFM_Score":  row["RFM_Score"],
            "Segment":    row["Segment"],
        }
        for i, (_, row) in enumerate(top10.iterrows())
    ]

    # ── Orders by Day of Week ────────────────────────────────
    dow_order  = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
    orders_dow = (
        df.groupby("DayOfWeek")["CustomerID"]
          .count()
          .reindex(dow_order, fill_value=0)
    )
    orders_by_day = {
        "labels": orders_dow.index.tolist(),
        "values": [int(x) for x in orders_dow.values],
    }

    # ── Customers by Country (Top 10) ───────────────────────
    cust_by_country = (
        df.groupby("Country")["CustomerID"]
          .nunique()
          .sort_values(ascending=False)
          .head(10)
          .reset_index()
    )
    customers_by_country = {
        "labels": cust_by_country["Country"].tolist(),
        "values": [int(x) for x in cust_by_country["CustomerID"]],
    }

    # ── New customers per month ──────────────────────────────
    first_purchase = df.groupby("CustomerID")["Month"].min().reset_index()
    first_purchase.columns = ["CustomerID", "FirstMonth"]
    new_per_month  = (
        first_purchase.groupby("FirstMonth")["CustomerID"]
                      .count()
                      .reset_index()
                      .sort_values("FirstMonth")
    )
    new_customers_monthly = {
        "labels": new_per_month["FirstMonth"].tolist(),
        "values": [int(x) for x in new_per_month["CustomerID"]],
    }

    return jsonify({
        # KPIs
        "total_revenue":    total_revenue,
        "total_customers":  total_customers,
        "total_orders":     total_orders,
        "avg_order_value":  avg_order_value,

        # Charts
        "monthly_revenue":        monthly_revenue,
        "revenue_by_country":     revenue_by_country,
        "rfm_segments":           rfm_segments,
        "clv_by_segment":         clv_by_segment,
        "top_customers":          top_customers,
        "orders_by_day":          orders_by_day,
        "customers_by_country":   customers_by_country,
        "new_customers_monthly":  new_customers_monthly,
    })


# ─────────────────────────────────────────────
# 5.  ENTRY POINT
# ─────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)