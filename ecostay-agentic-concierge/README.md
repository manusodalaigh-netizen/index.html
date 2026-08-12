# EcoStay Ireland AI Travel Concierge

This repository supports the H9CEAI Final Project: **Build an Agentic Organisation**.

## Organisation

EcoStay Ireland is a fictional sustainable short-break platform for Irish eco-travel. The project addresses customer decision friction: users want sustainable travel options, but they must compare price, availability, location, eco-score and weather suitability before choosing.

## Prototype

The working prototype is a customer-facing AI-supported travel concierge. It recommends an EcoStay package using:

1. Live package data from a published Google Sheet CSV.
2. Live weather data from Open-Meteo.

The package data is not hardcoded into the code. The app fetches it at runtime from the published Google Sheet URL in `app.js`.

## Agentic organisation

The project uses five agents in one handoff chain:

1. Researcher - identifies the opportunity.
2. Designer - creates the solution concept and customer journey.
3. Maker - builds the prototype.
4. Communicator - writes disclosure, messaging and go-to-market copy.
5. Manager - reviews the work, checks ethics and produces an operational plan.

## Live data source

Primary live source:

https://docs.google.com/spreadsheets/d/e/2PACX-1vQTSG7mXF31DN0TdGq0yVnq7iq840j6L5BiTWz1T0OUPOfW9VIKWRx_J57LcU1QzhDd3bP5VQMuG6Ba/pub?gid=455463878&single=true&output=csv

Second live source:

https://api.open-meteo.com/

## Local testing

Open `index.html` in a browser. For best results, use a simple local server:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Deployment

Deploy the repository to GitHub Pages and submit the live `github.io` URL in the final document.
