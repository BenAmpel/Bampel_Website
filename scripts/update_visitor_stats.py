import os
import json
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import (
    BatchRunReportsRequest,
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

    property_name = f"properties/{PROPERTY_ID}"

    def build_request(**kwargs):
        return RunReportRequest(
            property=property_name,
            **kwargs
        )

    def build_location_request(start_date, end_date="today", limit=20):
        return build_request(
            dimensions=[Dimension(name="city"), Dimension(name="region"), Dimension(name="country")],
            metrics=[Metric(name="totalUsers")],
            date_ranges=[DateRange(start_date=start_date, end_date=end_date)],
            limit=limit,
            order_bys=[OrderBy(metric=OrderBy.MetricOrderBy(metric_name="totalUsers"), desc=True)],
        )

    requests = [
        # 1. Monthly Trend
        build_request(
        dimensions=[Dimension(name="yearMonth")],
        metrics=[Metric(name="activeUsers")],
        date_ranges=[DateRange(start_date="365daysAgo", end_date="today")],
        order_bys=[OrderBy(dimension=OrderBy.DimensionOrderBy(dimension_name="yearMonth"))]
        ),
        # 2. Locations
        build_location_request("30daysAgo"),
        build_location_request("90daysAgo"),
        build_location_request(EARLIEST_DATE),
        # 3. Top Pages
        build_request(
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
        ),
        # 4. Device Category
        build_request(
            dimensions=[Dimension(name="deviceCategory")],
            metrics=[Metric(name="totalUsers")],
            date_ranges=[DateRange(start_date="30daysAgo", end_date="today")]
        ),
        # 5. Total Visitors (Last 30 Days)
        build_request(
            metrics=[Metric(name="totalUsers")],
            date_ranges=[DateRange(start_date="30daysAgo", end_date="today")]
        ),
        # 6. Lifetime Total Visitors
        build_request(
            metrics=[Metric(name="totalUsers")],
            date_ranges=[DateRange(start_date=EARLIEST_DATE, end_date="today")]
        )
    ]

    # GA4 batch API limit is 5 requests per call — split into two calls.
    responses = []
    for chunk in [requests[:5], requests[5:]]:
        if chunk:
            responses += client.batch_run_reports(
                BatchRunReportsRequest(property=property_name, requests=chunk)
            ).reports

    monthly_resp = responses[0]
    monthly_data = [{"month": r.dimension_values[0].value, "visitors": int(r.metric_values[0].value)} for r in monthly_resp.rows]

    # 2. Locations (City, Region, Country) across ranges
    def parse_locations(resp):
        return [
            {
                "city": r.dimension_values[0].value,
                "region": r.dimension_values[1].value,
                "country": r.dimension_values[2].value,
                "visitors": int(r.metric_values[0].value)
            }
            for r in resp.rows
        ]

    location_data_30 = parse_locations(responses[1])
    location_data_90 = parse_locations(responses[2])
    location_data_all = parse_locations(responses[3])

    # 3. Top Pages
    page_resp = responses[4]
    page_data = [{"path": r.dimension_values[0].value, "views": int(r.metric_values[0].value)} for r in page_resp.rows]

    # 4. Device Category (Mobile vs Desktop)
    device_resp = responses[5]
    device_data = [{"device": r.dimension_values[0].value, "users": int(r.metric_values[0].value)} for r in device_resp.rows]

    # 5. Total Visitors (Last 30 Days)
    last30_resp = responses[6]
    total_last_30_days = 0
    if last30_resp.rows:
        total_last_30_days = int(last30_resp.rows[0].metric_values[0].value)

    # 6. Lifetime Total Visitors (All-time)
    lifetime_resp = responses[7]
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
