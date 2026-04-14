# Booked Events Widget — Project Context

## Overview

**Booked Events Widget** is a Nextcloud app (v1.1.3) that provides a dashboard widget and a full event management interface for planning and coordinating events. It targets Nextcloud 30–32 and is licensed under AGPL.

### Core Features

- **Dashboard Widget** — Shows upcoming events on the Nextcloud dashboard with date, title, and location. Clicking an event opens a detail dialog.
- **Event Management UI** — A full-featured management interface accessible via the "Event Manager" navigation entry. Supports:
  - Creating, editing, and deleting events
  - Staff assignment (with roles like "Eventansvarig")
  - Internal chat per event (message + system messages)
  - Document upload/download/delete per event
  - Material and marketing planning (demo event)
  - **Budget tracking** — Income/cost entries with status (planned/booked/received), owner assignment, live totals
- **WordPress API Integration** — Fetches events from a WordPress REST API (`https://ambitionsverige.se/wp-json/amb/v1/events`) via `getevent.sh`, normalizes the data, and merges it with manually created events.
- **Hybrid Event Sources** — Events can be:
  - **API-sourced** — Imported from WordPress, with overrides stored in `manual_state.json` (description, sort_order, staff, documents, chat, soft-delete)
  - **Manual** — Created directly in the UI, stored in `manual_state.json`

## Project Structure

```
enbart-app/
├── booked_events_widget/          # Nextcloud app source
│   ├── appinfo/
│   │   ├── info.xml               # App metadata (version, deps, navigation)
│   │   └── routes.php             # Route definitions
│   ├── lib/
│   │   ├── AppInfo/Application.php     # App bootstrap, registers dashboard widget
│   │   ├── Controller/PageController.php  # All HTTP endpoints
│   │   ├── Service/EventService.php     # Core business logic, JSON file storage
│   │   ├── Dashboard/BookedEventsWidget.php  # Dashboard widget registration
│   │   └── Migration/                     # Database migrations (if any)
│   ├── js/
│   │   ├── dashboard.js             # Dashboard widget frontend
│   │   └── manage.js                # Management UI frontend
│   ├── css/
│   │   ├── dashboard.css            # Widget styles
│   │   └── manage.css               # Management UI styles
│   ├── templates/
│   │   └── manage.php               # Main management page template
│   ├── data/                        # Runtime data (api_events.json, manual_state.json)
│   ├── getevent.sh                  # API fetch + normalization script
│   └── app.svg                      # App icon
├── setup_nextcloud_integration.sh   # Main setup script (prepare + deploy + cron)
├── deploy_to_nextcloud.sh           # Docker-based deploy script
├── create_cronjob_for_api.sh        # Installs cronjob for periodic API sync
├── prepare_persistent_data.sh       # Sets up persistent data directories
└── adminpage.html                   # Standalone admin page (legacy?)
```

## Architecture

### Backend (PHP)

- **`PageController`** — Handles all routes:
  - `GET /` — Main management page (`index`)
  - `GET /state` — JSON state for live updates
  - `POST /events` — Create event
  - `POST /events/{id}` — Update event
  - `POST /events/{id}/staff` — Save staff assignments
  - `POST /events/{id}/chat` — Save chat messages
  - `POST /events/{id}/budget` — Save budget entries
  - `POST /events/{id}/documents` — Upload document
  - `GET /events/{id}/documents/{documentId}` — Download document
  - `POST /events/{id}/documents/{documentId}/delete` — Delete document
  - `POST /events/{id}/delete` — Delete event

- **`EventService`** — Core business logic:
  - Reads from `data/api_events.json` (API events) and `data/manual_state.json` (manual events + overrides)
  - Merges both sources, applies overrides, filters soft-deleted events
  - Falls back to default events if no data exists
  - Determines past events using Swedish month names
  - Stores documents on the filesystem under `data/documents/{eventId}/`

### Frontend (JavaScript + PHP templates)

- **`dashboard.js`** — Registers with `OCA.Dashboard` API, renders upcoming events list with a detail dialog
- **`manage.js`** — Full management UI with tabs (Översikt, Personal, Material, Marknadsföring, Budget, Dokument), chat panel, and unsaved-changes modal
- **`manage.php`** — Server-rendered template that embeds initial state as JSON and provides the sidebar + main layout structure

### Data Flow

```
WordPress API → getevent.sh → data/api_events.json
                                         ↓
                                    EventService → merge with manual_state.json → UI
                                         ↓
                              User edits → manual_state.json (overrides/manual events)
```

## Key Commands

### Setup & Deploy (Docker-based)

```bash
# Full setup (deploy + cronjob)
./setup_nextcloud_integration.sh

# Deploy only
./setup_nextcloud_integration.sh --only-deploy

# Cronjob only
./setup_nextcloud_integration.sh --only-cron

# With persistent data preparation
./setup_nextcloud_integration.sh --with-prepare
```

### Manual API Import

```bash
cd booked_events_widget
./getevent.sh data/api_events.json
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `CONTAINER_NAME` | `nextcloud` | Docker container name |
| `OCC_USER` | `www-data` | User for `occ` commands |
| `EVENT_SOURCE_URL` | `https://ambitionsverde.se/wp-json/amb/v1/events` | WordPress API endpoint |
| `APP_SOURCE_DIR` | `$SCRIPT_DIR/booked_events_widget` | Source app directory |
| `TARGET_APPS_DIR` | `/var/www/html/custom_apps` | Target directory in container |

## Storage

All data is stored in JSON files under `booked_events_widget/data/`:

- **`api_events.json`** — Raw events from the WordPress API (normalized)
- **`manual_state.json`** — Manual events + API overrides (descriptions, staff, documents, chat, budget, soft-deletes)
- **`documents/{eventId}/`** — Uploaded document files per event

The `deploy_to_nextcloud.sh` script preserves these files across deploys by copying them out and back.

## Development Notes

- The app uses **file-based storage** (no database), which simplifies deployment but means data lives in the app directory
- API events are keyed by SHA-1 hash of their content for stable override references
- Events have a `sort_order` field for explicit ordering; API events use `index * 10` as default
- The `manual_state.json` format has two sections: `manual_events` (array) and `api_overrides` (object keyed by event hash)
- Past events are determined by Swedish month names (januari–december) compared against the current year
- The management UI has two modes: `admin` (full access + demo event) and `eventpersonal` (staff view with "show only booked events" filter)
