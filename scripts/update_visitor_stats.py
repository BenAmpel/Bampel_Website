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

    # Authenticate from the JSON string stored in GitHub Secrets
    info = json.loads(KEY_JSON_STR)
    credentials = service_account.Credentials.from_service_account_info(info)
    client = BetaAnalyticsDataClient(credentials=credentials)

    # 1. Monthly Unique Visitors (Last 12 months)
    monthly_request = RunReportRequest(
        property=f"properties/{PROPERTY_ID}",
        dimensions=[Dimension(name="yearMonth")],
        metrics=[Metric(name="activeUsers")],
        date_ranges=[DateRange(start_date="365daysAgo", end_date="today")],
        order_bys=[OrderBy(dimension=OrderBy.DimensionOrderBy(dimension_name="yearMonth"))]
    )
    monthly_response = client.run_report(monthly_request)

    monthly_data = []
    for row in monthly_response.rows:
        monthly_data.append({
            "month": row.dimension_values[0].value, # Format: YYYYMM
            "visitors": int(row.metric_values[0].value)
        })

    # 2. Location Data (Top 20 Cities with Country)
    geo_request = RunReportRequest(
        property=f"properties/{PROPERTY_ID}",
        dimensions=[Dimension(name="city"), Dimension(name="country")],
        metrics=[Metric(name="activeUsers")],
        date_ranges=[DateRange(start_date="30daysAgo", end_date="today")],
        limit=20
    )
    geo_response = client.run_report(geo_request)

    location_data = []
    for row in geo_response.rows:
        location_data.append({
            "city": row.dimension_values[0].value,
            "country": row.dimension_values[1].value,
            "visitors": int(row.metric_values[0].value)
        })

    return {
        "monthly_trend": monthly_data,
        "top_locations": location_data,
        "total_last_30_days": sum(d['visitors'] for d in location_data) # Approximation
    }

if __name__ == "__main__":
    stats = fetch_analytics()
    if stats:
        os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
        with open(OUTPUT_FILE, "w") as f:
            json.dump(stats, f, indent=2)
        print(f"Success: Stats saved to {OUTPUT_FILE}")