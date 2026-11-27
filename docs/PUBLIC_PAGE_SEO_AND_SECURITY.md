# Public-page SEO and frontend security

This guide describes the static frontend SEO and browser security controls used by the Render static site and the optional Vercel frontend.

## Required build setting

Set \`VITE_PUBLIC_SITE_URL\` to the verified HTTPS origin of the public website, without a path, query, fragment, or credentials. The frontend build fails closed when the value is missing or invalid.

The build writes route-specific HTML metadata for:

- \`/\`
- \`/about\`
- \`/contact\`
- \`/faq\`
- \`/explore\`
- \`/pricing\`
- \`/legal\`

Each generated route document contains a unique title, description, Open Graph and Twitter summary metadata, a public canonical URL, and an indexable robots directive. This makes the public page metadata available in the initial HTML response instead of relying only on React mounting.

The build also generates:

- \`/robots.txt\`, which identifies the sitemap and disallows admin, authentication, account, billing, learner, and API route families.
- \`/sitemap.xml\`, which contains only the stable public canonical routes above. Dynamic course detail URLs and policy slugs are not guessed or fabricated; they are not added to the sitemap by this static generator.

The React route metadata component keeps client-side navigation metadata in sync. Private and unknown routes receive \`noindex,nofollow\` in the document head and do not retain a canonical tag.

## Frontend response headers

Both \`client/vercel.json\` and the Render static-site section of \`render.yaml\` set:

- Content Security Policy, with scripts limited to the application, Google Identity Services, Razorpay Checkout, and the YouTube IFrame API.
- Google Fonts stylesheet and font origins.
- YouTube and Razorpay frame origins.
- HTTPS/WSS connections for the configured API and external services.
- HSTS (one-year max age), MIME sniffing protection, clickjacking protection, strict-origin referrer policy, and a restrictive camera/geolocation permissions policy.
- \`Cross-Origin-Opener-Policy: same-origin-allow-popups\` to preserve the Google OAuth popup flow.

The CSP keeps \`style-src 'unsafe-inline'\` because the existing application uses inline style attributes, while it does not allow inline scripts or \`unsafe-eval\`. The theme initializer was moved to a same-origin external script so it works under the policy. The connection source allows HTTPS/WSS origins because the API origin is supplied at build time and third-party service endpoints are not all fixed in the static host configuration.

When adding any third-party browser integration, update both hosting configurations and the CSP regression test. Verify Google sign-in, YouTube playback, and Razorpay checkout in staging before deployment; CI mocks authentication and does not validate live provider credentials.

## Performance review

The About, Contact, and FAQ/Help Centre pages remain route-level lazy imports in \`App.tsx\`. Their current layouts do not introduce large hero images. Existing hashed Vite assets retain immutable one-year caching. The SEO generator copies the already-built Vite HTML shell into route folders; it does not duplicate JavaScript bundles.

This phase intentionally avoids adding a new framework, metadata dependency, image library, or speculative bundle optimisation. The production build output and CI bundle-size warnings should be reviewed after each material UI dependency change.

## Current limitations

- Course detail routes are data-driven and are not included in the static sitemap; dynamic course-level metadata and canonical handling require a trusted course inventory/API or server-side rendering.
- Dynamic legal-policy slugs are not placed in the sitemap because publication status is controlled by admin content and cannot be safely inferred at build time.
- The CSP connection directive permits HTTPS/WSS destinations broadly to support the configurable API and provider calls. Tightening it requires a complete deployed-origin inventory and staging verification.
- Static social metadata uses the platform's current public name, BuddyForStudy. Changing the public brand name requires a frontend rebuild to refresh pre-rendered metadata.
- Headers and provider allowlists must be verified on the deployed static host before production release; a green CI run is not proof of live OAuth, video, or payment integration health.
