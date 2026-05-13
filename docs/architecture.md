# Percurso — Architecture

## Overview

Percurso is a monorepo with a FastAPI backend and a React + Vite frontend,
connected to PostgreSQL (with PostGIS), Redis, and Cloudflare R2.

```
                    ┌──────────────────────────────────────┐
                    │            Browser                   │
                    │   React 18 + Vite + MapLibre GL JS   │
                    └──────────────┬───────────────────────┘
                                   │ HTTP / REST
                    ┌──────────────▼───────────────────────┐
                    │          FastAPI backend              │
                    │   /api/v1/  (JWT authenticated)       │
                    └───┬──────────┬──────────┬────────────┘
                        │          │          │
             ┌──────────▼──┐  ┌────▼────┐  ┌─▼──────────┐
             │ PostgreSQL  │  │  Redis  │  │ Celery      │
             │ + PostGIS   │  │ (cache, │  │ workers     │
             │ (main data) │  │  sessions│  │ (bg tasks)  │
             └─────────────┘  └─────────┘  └──────┬──────┘
                                                   │
                                          ┌────────▼────────┐
                                          │ Cloudflare R2   │
                                          │ (media storage) │
                                          └─────────────────┘
```

## Directory Structure

```
percurso/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   └── v1/
│   │   │       └── endpoints/     # Route handlers
│   │   ├── core/                  # Config, security, database, redis
│   │   ├── models/                # SQLAlchemy ORM models
│   │   ├── schemas/               # Pydantic v2 request/response schemas
│   │   ├── services/              # Business logic layer
│   │   └── workers/               # Celery tasks
│   ├── alembic/                   # Database migrations
│   ├── tests/                     # Pytest test suite
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/                # shadcn/ui base components
│   │   │   ├── map/               # MapLibre components
│   │   │   ├── trips/             # Trip-related components
│   │   │   ├── projects/          # Project-related components
│   │   │   ├── places/            # Place-related components
│   │   │   ├── layout/            # Shell, Nav, Sidebar
│   │   │   └── shared/            # Reusable cross-feature components
│   │   ├── pages/                 # Top-level route pages
│   │   ├── hooks/                 # Custom React hooks
│   │   ├── stores/                # Zustand stores
│   │   ├── lib/                   # API client, utilities
│   │   └── types/                 # TypeScript type definitions
│   └── Dockerfile
├── docs/
├── docker-compose.yml
├── .env.example
└── README.md
```

## Authentication

- JWT access tokens (short-lived, 30 min default)
- JWT refresh tokens (long-lived, 30 days default, stored in HttpOnly cookie)
- Token rotation on refresh
- No self-registration — admin creates users

## Data Model Highlights

### Places (shared global entities)
- Linked to OpenStreetMap data (OSM ID + type)
- Geometry: POINT (buildings → cities) or POLYGON (comarcas → countries)
- Wikipedia summary cached in Redis (7-day TTL)
- Language priority: pt → gl → en → es

### Trips
- Creator + accepted companions
- Many-to-many with Places
- Cover image: user-uploaded (R2) or AI-generated (Pollinations.ai via Celery)
- Privacy: public / private / link / specific users

### Projects
- Target place list with auto-tracked progress
- Progress computed from trips of all accepted collaborators

### Visited Places
- Derived from trips (no separate entry — computed per user)
- Independently configurable privacy

## Privacy Model

Four visibility levels: `public`, `private`, `link`, `users`

- `link` uses a cryptographically random token (not sequential ID)
- Companion visibility: hidden until they accept; removed on departure

## Background Tasks (Celery)

- AI cover image generation (Pollinations.ai → R2)
- Wikipedia article fetching and caching
- Open Graph metadata fetching for media links

## API Design

- RESTful under `/api/v1/`
- Versioned from the start
- Swagger UI at `/api/docs` (disabled or admin-protected in production)
- Consistent error schema: `{"detail": "...", "code": "ERROR_CODE"}`
