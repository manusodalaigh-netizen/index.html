# EcoStay Verification Log

## 2026-08-11 - Project setup
- Created EcoStay Ireland project structure.
- Created published Google Sheet data source called EcoStay Packages.
- Added six package rows in the Packages sheet.

## 2026-08-11 - Live data test
- First local browser test opened with `file://` and showed zero fetched rows.
- Cause: local-file testing can block or delay cross-origin Google Sheet fetches.
- Fix applied: the prototype now tries three live runtime fetch methods:
  1. direct published Google Sheet CSV fetch,
  2. Google Visualization JSONP fallback,
  3. published CSV through a CORS proxy fallback.
- A timeout was added so the interface does not stay stuck on "Fetching live Google Sheet data..." indefinitely.

## Evidence to capture later
- Screenshot of Google Sheet with package rows.
- Screenshot of live GitHub Pages URL showing `Rows fetched: 6`.
- Screenshot of recommendation generated from fetched sheet data.
- Screenshot of Open-Meteo weather note in a recommendation.
