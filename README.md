# Percurso

**Percurso** is a web application for creating personal maps and lists of visited places,
logging trips, and managing travel projects. Built for multiple users, deployed via Docker,
and hosted on Railway.

## Tech Stack

### Backend
- Python 3.12+ · FastAPI · PostgreSQL 16 + PostGIS · SQLAlchemy (async) · Alembic
- Redis (sessions, rate limiting, Wikipedia cache)
- Celery + Redis (background tasks: image generation, Wikipedia fetching)
- Pydantic v2 · JWT authentication with refresh tokens

### Frontend
- React 18+ · Vite · TypeScript · Tailwind CSS
- shadcn/ui · MapLibre GL JS · TanStack Query · React Router v6 · Zustand

### Infrastructure
- Docker + Docker Compose (local dev and production)
- Railway deployment
- Cloudflare R2 (user-uploaded image storage)
- Pollinations.ai (AI-generated cover images, free, no API key)

---

## Getting Started

### Prerequisites
- Docker 24+ and Docker Compose v2
- A PostgreSQL client (optional, for direct DB access)

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/manuelmgn/percurso.git
   cd percurso
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

3. **Start all services**
   ```bash
   docker compose up --build
   ```

4. **Services available at**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000
   - API docs: http://localhost:8000/api/docs (development only)
   - PostgreSQL: localhost:5432
   - Redis: localhost:6379

### First-time Setup

On first run, Alembic migrations execute automatically. Create the first admin user:

```bash
docker compose exec backend python -m app.cli create-admin
```

---

## Environment Variables

See [`.env.example`](.env.example) for a full list of required and optional variables
with descriptions.

### Required for production
- `DATABASE_URL` — PostgreSQL connection string (PostGIS-enabled)
- `REDIS_URL` — Redis connection string
- `SECRET_KEY` — Long random string for JWT signing
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` — Cloudflare R2

---

## Cloudflare R2 Setup

1. Create a Cloudflare account and enable R2 storage
2. Create a bucket named `percurso-media` (or your preferred name)
3. Create an R2 API token with read/write permissions
4. Set the R2 variables in your `.env` file
5. Configure a public domain or use the R2 public URL for the bucket

---

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for detailed architecture documentation.

---

## Geographic Scope

Initial scope: **Spain and Portugal**. Designed for easy expansion to other countries.

Data sources:
- OpenStreetMap / Nominatim (place search and text-based import matching)
- OSM / Overpass API (polygon retrieval: comarcas, provinces, regions)

---

## Deployment on Railway

1. Fork this repository
2. Create a new Railway project and connect the repository
3. Add PostgreSQL and Redis services in Railway
4. Set all environment variables in Railway's dashboard
5. Railway auto-detects and builds the Docker containers

---

## Contributing

This project uses British English for all code. User-facing text is in Portuguese (pt-PT).

---

## Licence

MIT
