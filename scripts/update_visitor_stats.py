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
EARLIEST_DATE = (os.environ.get("GA4_EARLIEST_DATE") or "").strip() or "2015-08-14"
assert EARLIEST_DATE, "EARLIEST_DATE resolved to empty; check GA4_EARLIEST_DATE env var"

def fetch_analytics():
    if not PROPERTY_ID or not KEY_JSON_STR:
        print("Error: Missing GA4_PROPERTY_ID or GA4_KEY_JSON environment variables.")
        return None

    try:
        info = json.loads(KEY_JSON_STR)
        credentials = service_account.Credentials.from_service_account_info(info, scopes=["https://www.googleapis.com/auth/analytics.readonly"])
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

    # 2. Locations (City, Region, Country) across ranges
    def fetch_locations(start_date, end_date="today", limit=20):
        req = RunReportRequest(
            property=f"properties/{PROPERTY_ID}",
            dimensions=[Dimension(name="city"), Dimension(name="region"), Dimension(name="country")],
            metrics=[Metric(name="totalUsers")],
            date_ranges=[DateRange(start_date=start_date, end_date=end_date)],
            limit=limit,
            order_bys=[OrderBy(metric=OrderBy.MetricOrderBy(metric_name="totalUsers"), desc=True)],
        )
        resp = client.run_report(req)
        return [
            {
                "city": r.dimension_values[0].value,
                "region": r.dimension_values[1].value,
                "country": r.dimension_values[2].value,
                "visitors": int(r.metric_values[0].value)
            }
            for r in resp.rows
        ]

    location_data_30 = fetch_locations("30daysAgo")
    location_data_90 = fetch_locations("90daysAgo")
    location_data_all = fetch_locations(EARLIEST_DATE)

    # 3. Top Pages (FIXED: Moved desc=True to OrderBy parent)
    page_req = RunReportRequest(
        property=f"properties/{PROPERTY_ID}",
        dimensions=[Dimension(name="pagePath")],
        metrics=[Metric(name="screenPageViews")],
        date_ranges=[DateRange(start_date="30daysAgo", end_date="today")],
        limit=10,
        order_bys=[
            OrderBy(
                metric=OrderBy.MetricOrderBy(metric_name="screenPageViews"),
                desc=True
            )
        ]
    )
    page_resp = client.run_report(page_req)
    page_data = [{"path": r.dimension_values[0].value, "views": int(r.metric_values[0].value)} for r in page_resp.rows]

    # 4. Device Category (Mobile vs Desktop)
    device_req = RunReportRequest(
        property=f"properties/{PROPERTY_ID}",
        dimensions=[Dimension(name="deviceCategory")],
        metrics=[Metric(name="totalUsers")],
        date_ranges=[DateRange(start_date="30daysAgo", end_date="today")]
    )
    device_resp = client.run_report(device_req)
    device_data = [{"device": r.dimension_values[0].value, "users": int(r.metric_values[0].value)} for r in device_resp.rows]

    # 5. Total Visitors (Last 30 Days)
    last30_req = RunReportRequest(
        property=f"properties/{PROPERTY_ID}",
        metrics=[Metric(name="totalUsers")],
        date_ranges=[DateRange(start_date="30daysAgo", end_date="today")]
    )
    last30_resp = client.run_report(last30_req)
    total_last_30_days = 0
    if last30_resp.rows:
        total_last_30_days = int(last30_resp.rows[0].metric_values[0].value)

    # 6. Lifetime Total Visitors (All-time)
    lifetime_req = RunReportRequest(
        property=f"properties/{PROPERTY_ID}",
        metrics=[Metric(name="totalUsers")],
        date_ranges=[DateRange(start_date=EARLIEST_DATE, end_date="today")]
    )
    lifetime_resp = client.run_report(lifetime_req)
    lifetime_total = 0
    if lifetime_resp.rows:
        lifetime_total = int(lifetime_resp.rows[0].metric_values[0].value)

    return {
        "monthly_trend": monthly_data,
        "top_locations": location_data_30,
        "top_locations_30": location_data_30,
        "top_locations_90": location_data_90,
        "top_locations_all": location_data_all,
        "top_pages": page_data,
        "devices": device_data,
        "total_last_30_days": total_last_30_days,
        "lifetime_total": lifetime_total
    }

if __name__ == "__main__":
    stats = fetch_analytics()
    if stats:
        os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
        with open(OUTPUT_FILE, "w") as f:
            json.dump(stats, f, indent=2)
        print(f"Success: Detailed stats saved to {OUTPUT_FILE}")
