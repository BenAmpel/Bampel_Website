# Deployment security headers

`netlify.toml` is the source of truth for response headers. The site-wide policy is deliberately strict for scripts and
frames; route-specific lab policies permit only the media and network access the participant and researcher pages need.
Do not widen an origin or directive without checking the pages that use it and the CI header/link checks.

## Site-wide policy

- `script-src` allows this site, Google Analytics, and the Altmetric and Dimensions badge endpoints. Site JavaScript,
  fonts, and ordinary assets are self-hosted.
- `style-src` allows inline styles because Wowchemy and some current widgets emit style attributes or style blocks.
  Keep this exception scoped to styles; scripts do not allow `unsafe-inline`.
- `img-src` and `connect-src` list analytics, citation badges, and ArcGIS map tiles used by the public pages.
- `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, and `form-action 'self'` restrict embedding and
  unsafe document behaviors.
- `X-Frame-Options`, `Cross-Origin-Opener-Policy`, `Permissions-Policy`, and the generated `_headers` rules add
  browser protections and cache policy.

## Route-specific policies

- `/lab/*` allows HTTPS media and network requests for participant studies and researcher tools. That is broader than a
  host allowlist; narrow it only after checking the study templates and gateway integrations. Researcher sign-in and
  account routes separately disable caching, suppress referrers, and send `X-Robots-Tag: noindex`.
- `/ccair/*` uses its own self-hosted app policy and cache rules. Hashed app assets can be cached for a year; page data
  and HTML revalidate.
- Old `/care/*` paths redirect to `/ccair/*`; they do not need their own policy.

The CSP strings and route patterns live in `netlify.toml` so the deployed headers remain explicit. CI exercises lab
header behavior and checks generated internal links; review this inventory and the corresponding route when changing a
policy.
