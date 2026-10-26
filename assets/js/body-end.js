  // Global-reach readout: surfaces where the work is being read without
  // publishing raw traffic counts.
  fetch('/data/visitor_stats.json')
    .then(response => response.json())
    .then(data => {
      data = data || {};
      data.top_locations = data.top_locations || [];
      data.top_pages = data.top_pages || [];

      const cities = data.top_locations.length > 0
        ? data.top_locations.slice(0, 3).map(l => l.city).filter(c => c && c !== '(not set)').join(", ")
        : "";

      let topPage = data.top_pages.length > 0 ? data.top_pages[0].path : "";
      if (topPage === "/") topPage = "Home Page";

      let detailsHtml = "";
      if (cities) {
        detailsHtml += `Recently read in: <strong>${cities}</strong>&hellip;<br>`;
      }
      if (topPage) {
        detailsHtml += `Most-read this month: <code>${topPage}</code>`;
      }

      const target = document.getElementById('visitor-details');
      if (target) target.innerHTML = detailsHtml;
    })
    .catch(() => { /* silently omit when stats are unavailable */ });

