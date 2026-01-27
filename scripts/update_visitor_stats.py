import os
import json
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import (
    RunReportRequest,
    DateRange,
    Metric,
    Dimension,
    OrderBy
)
from google.oauth2 import service_account

# --- CONFIG ---
OUTPUT_FILE = "static/data/visitor_stats.json"
PROPERTY_ID = os.environ.get("GA4_PROPERTY_ID")
KEY_JSON_STR = os.environ.get("GA4_KEY_JSON")

def fetch_analytics():
    if not PROPERTY_ID or not KEY_JSON_STR:
        print("Error: Missing GA4_PROPERTY_ID or GA4_KEY_JSON environment variables.")
        return None

    try:
        info = json.loads(KEY_JSON_STR)
        credentials = service_account.Credentials.from_service_account_info(info)
        client = BetaAnalyticsDataClient(credentials=credentials)
    except Exception as e:
        print(f"Auth Error: {e}")
        return None

    # 1. Monthly Trend (Existing)
    monthly_req = RunReportRequest(
        property=f"properties/{PROPERTY_ID}",
        dimensions=[Dimension(name="yearMonth")],
        metrics=[Metric(name="activeUsers")],
        date_ranges=[DateRange(start_date="365daysAgo", end_date="today")],
        order_bys=[OrderBy(dimension=OrderBy.DimensionOrderBy(dimension_name="yearMonth"))]
    )
    monthly_resp = client.run_report(monthly_req)
    monthly_data = [{"month": r.dimension_values[0].value, "visitors": int(r.metric_values[0].value)} for r in monthly_resp.rows]

    # 2. Locations (Existing - City & Country)
    geo_req = RunReportRequest(
        property=f"properties/{PROPERTY_ID}",
        dimensions=[Dimension(name="city"), Dimension(name="country")],
        metrics=[Metric(name="activeUsers")],
        date_ranges=[DateRange(start_date="30daysAgo", end_date="today")],
        limit=20
    )
    geo_resp = client.run_report(geo_req)
    location_data = [{"city": r.dimension_values[0].value, "country": r.dimension_values[1].value, "visitors": int(r.metric_values[0].value)} for r in geo_resp.rows]

    # 3. Top Pages (NEW: What are they reading?)
    page_req = RunReportRequest(
        property=f"properties/{PROPERTY_ID}",
        dimensions=[Dimension(name="pagePath")],
        metrics=[Metric(name="screenPageViews")],
        date_ranges=[DateRange(start_date="30daysAgo", end_date="today")],
        limit=10,
        order_bys=[OrderBy(metric=OrderBy.MetricOrderBy(metric_name="screenPageViews", desc=True))]
    )
    page_resp = client.run_report(page_req)
    page_data = [{"path": r.dimension_values[0].value, "views": int(r.metric_values[0].value)} for r in page_resp.rows]

    # 4. Device Category (NEW: Mobile vs Desktop)
    device_req = RunReportRequest(
        property=f"properties/{PROPERTY_ID}",
        dimensions=[Dimension(name="deviceCategory")],
        metrics=[Metric(name="activeUsers")],
        date_ranges=[DateRange(start_date="30daysAgo", end_date="today")]
    )
    device_resp = client.run_report(device_req)
    device_data = [{"device": r.dimension_values[0].value, "users": int(r.metric_values[0].value)} for r in device_resp.rows]

    # 5. Lifetime Total Visitors (All-time)
    lifetime_req = RunReportRequest(
        property=f"properties/{PROPERTY_ID}",
        metrics=[Metric(name="totalUsers")],
        date_ranges=[DateRange(start_date="2020-01-01", end_date="today")]
    )
    lifetime_resp = client.run_report(lifetime_req)
    lifetime_total = 0
    if lifetime_resp.rows:
        lifetime_total = int(lifetime_resp.rows[0].metric_values[0].value)

    return {
        "monthly_trend": monthly_data,
        "top_locations": location_data,
        "top_pages": page_data,
        "devices": device_data,
        "total_last_30_days": sum(d['visitors'] for d in location_data), # Approximation
        "lifetime_total": lifetime_total
    }

if __name__ == "__main__":
    stats = fetch_analytics()
    if stats:
        os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
        with open(OUTPUT_FILE, "w") as f:
            json.dump(stats, f, indent=2)
        print(f"Success: Detailed stats saved to {OUTPUT_FILE}")