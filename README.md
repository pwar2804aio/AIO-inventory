# AIO Inventory System

A lightweight, zero-dependency inventory management system for AIO App. Tracks hardware devices, SIM cards, and physical goods by serial number with full stock-in / stock-out history, location tracking, low stock alerts, and CSV export.

## Features

- **Serial number tracking** — every unit is tracked individually
- **Stock In** — receive goods with product, category, location/warehouse, supplier, PO reference, and configurable low-stock threshold
- **Stock Out** — dispatch to a customer/account; serials validated in real time against current stock
- **Inventory view** — live stock counts per product + location, filterable by category and location
- **Serial Lookup** — scan or type any serial to see its current status and full movement history
- **Movement History** — full audit trail, searchable and filterable, CSV export
- **Dashboard** — summary stats, recent movements, low stock alerts, stock-by-location breakdown
- **Dark mode** — automatic via `prefers-color-scheme`
- **Persistent storage** — all data saved in `localStorage` (no server required)

## Tech stack

Plain HTML + CSS + vanilla JavaScript. No build step, no dependencies, no framework.

## Running locally

Open `index.html` directly in your browser — it works as a static file.

```bash
# Or serve with any static server, e.g.:
npx serve .
# or
python3 -m http.server 8080
```

## Deploying to GitHub Pages

1. Push this folder to a GitHub repository
2. Go to **Settings → Pages**
3. Set source to **Deploy from a branch → main → / (root)**
4. Your app will be live at `https://<username>.github.io/<repo-name>/`

## File structure

```
aio-inventory/
├── index.html        # App shell and view templates
├── css/
│   └── styles.css    # All styles (light + dark mode)
├── js/
│   ├── db.js         # localStorage read/write layer
│   ├── inventory.js  # Business logic (pure functions)
│   ├── ui.js         # DOM rendering helpers
│   └── app.js        # Event wiring and navigation
└── README.md
```

## Data storage

All data is stored in `localStorage` under the key `aio_inventory_v1`. To back up or migrate data, open the browser console and run:

```js
// Export
console.log(DB.exportJSON());

// Import (paste JSON string)
DB.importJSON('{ "movements": [...], "thresholds": {...} }');
```

## Low stock alerts

Set a threshold per product+location on the Stock In form. The default is 3 units. When stock falls to or below the threshold, the item appears on the Dashboard low stock panel and triggers the warning banner.
