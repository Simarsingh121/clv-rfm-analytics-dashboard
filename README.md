# CLV & RFM Analytics Dashboard — Flask Project

## Folder Structure
```
your_project/
├── app.py                    ← Flask backend
├── data/
│   └── Online_Retail.csv     ← Your dataset (rename your CSV to this)
├── templates/
│   └── index.html            ← Dashboard HTML (Jinja2 template)
└── static/
    ├── style.css             ← Dark theme styles
    └── script.js             ← Chart rendering + API calls
```

## Setup (One Time)
```bash
pip install flask pandas
```

## Run the Dashboard
```bash
python app.py
```
Then open: **http://127.0.0.1:5000**

## API Endpoints
| Route | Description |
|---|---|
| `GET /` | Serves the dashboard HTML |
| `GET /api/filters` | Returns all countries & months for dropdowns |
| `GET /api/data` | Returns all analytics (KPIs, charts, RFM, CLV) |

### `/api/data` Query Parameters
| Param | Example | Default |
|---|---|---|
| `country` | `United Kingdom` | `All` |
| `month_from` | `2011-01` | *(none)* |
| `month_to` | `2011-11` | *(none)* |

## What's New (Upgraded Features)
1. **Monthly Revenue fix** — uses `pd.to_period('M')` on `InvoiceDate`
2. **Top 10 Customers by CLV** — table with gold/silver/bronze rank badges
3. **Revenue by Country** — top 10 horizontal bar chart  
4. **Average CLV per Segment** — dedicated bar chart on RFM page
5. **Month filter** — From/To dropdowns in topbar
6. **Revenue Trend KPIs** — Peak month, Peak revenue, Avg monthly, Best growth %
7. **MoM Growth %** — green/red bar chart showing month-on-month change
8. **Cumulative Revenue** — running total area chart
9. **Dark professional UI** — sidebar navigation, filter bar, animated loading

## Viva Talking Points
- RFM segmentation uses **quantile-based scoring (1-5)** per dimension
- CLV is estimated via **Monetary (total spend per customer)**
- Segment thresholds follow **standard RFM marketing strategy**
- Dashboard fetches **live data from Flask API** — filters trigger new API calls
- All charts use **Chart.js 4.4** with custom dark theme styling
