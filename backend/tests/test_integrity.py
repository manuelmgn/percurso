"""Exhaustive integrity test suite for Percurso backend.

Runs against an isolated temporary SQLite database and temporary
uploads/tile-cache/backups directories so local dev data is never touched.

Run from backend/:
    python -m unittest discover -s tests -v
"""

import atexit
import io
import os
import shutil
import sqlite3
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

# Isolate all filesystem & DB state BEFORE importing app.*
_TMP_ROOT = Path(tempfile.mkdtemp(prefix="percurso_integrity_"))
atexit.register(lambda: shutil.rmtree(_TMP_ROOT, ignore_errors=True))

os.environ["PERCURSOS_ENV"] = "testing"
os.environ["PERCURSOS_DATABASE_URL_OVERRIDE"] = ""
os.environ["PERCURSOS_DATA_DIR"] = str(_TMP_ROOT / "data")
os.environ["PERCURSOS_UPLOADS_DIR"] = str(_TMP_ROOT / "uploads")
os.environ["PERCURSOS_TILE_CACHE_DIR"] = str(_TMP_ROOT / "tile-cache")
os.environ["PERCURSOS_BACKUPS_DIR"] = str(_TMP_ROOT / "backups")
os.environ["PERCURSOS_DEFAULT_ADMIN_USERNAME"] = "admin"
os.environ["PERCURSOS_DEFAULT_ADMIN_PASSWORD"] = "adminpass123"
os.environ["PERCURSOS_SECRET_KEY"] = "integrity-test-secret-key"

from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402
from sqlalchemy import create_engine, inspect, text  # noqa: E402

from app.backup import run_backup  # noqa: E402
from app.config import settings  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import _apply_lightweight_migrations, app  # noqa: E402
from app.models import (  # noqa: E402
    Activity,
    EntityType,
    Milestone,
    Notification,
    Photo,
    Pin,
    Place,
    PlaceType,
    Project,
    ProjectPlace,
    PushSubscription,
    Session as UserSession,
    Trip,
    TripPlace,
    TripProject,
    User,
    UserRole,
    Visibility,
)
from app.routers import auth as auth_router  # noqa: E402
from app.services import user_service  # noqa: E402

# Ensure schema & default admin exist once for the test DB.
Base.metadata.create_all(bind=engine)
_apply_lightweight_migrations()
with SessionLocal() as _db:
    user_service.seed_default_admin(_db)


def _make_png(width: int = 80, height: int = 60, color=(200, 30, 90)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buf, format="PNG")
    return buf.getvalue()


def _make_jpeg_with_exif(
    width: int = 120,
    height: int = 60,
    orientation: int | None = None,
    dt_original: str | None = None,
    gps: tuple[float, float] | None = None,
) -> bytes:
    img = Image.new("RGB", (width, height), (40, 120, 200))
    exif = img.getexif()
    if orientation is not None:
        exif[0x0112] = orientation
    if dt_original is not None:
        exif[36867] = dt_original
    if gps is not None:
        lat, lon = gps
        lat_ref = "N" if lat >= 0 else "S"
        lon_ref = "E" if lon >= 0 else "W"

        def _dms(val: float):
            val = abs(val)
            d = float(int(val))
            m = float(int((val - d) * 60))
            s = round(((val - d) * 60 - m) * 60, 4)
            return (d, m, s)

        exif[0x8825] = {
            1: lat_ref,
            2: _dms(lat),
            3: lon_ref,
            4: _dms(lon),
        }
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif)
    return buf.getvalue()


def _reset_login_limiter():
    auth_router._login_failures.clear()
    auth_router._login_attempts.clear()


class AuthedSession:
    """Thin wrapper around TestClient carrying session cookies + CSRF header."""

    def __init__(self, username: str, password: str):
        _reset_login_limiter()
        self.client = TestClient(app, raise_server_exceptions=False)
        res = self.client.post("/api/auth/login", json={"username": username, "password": password})
        assert res.status_code == 200, f"Login failed for {username}: {res.status_code} {res.text}"
        body = res.json()
        self.user = body["user"]
        self.csrf = body["csrf_token"]

    def headers(self, extra: dict | None = None) -> dict:
        h = {"x-csrf-token": self.csrf}
        if extra:
            h.update(extra)
        return h

    def get(self, url: str, **kwargs):
        return self.client.get(url, **kwargs)

    def post(self, url: str, **kwargs):
        kwargs["headers"] = self.headers(kwargs.get("headers"))
        return self.client.post(url, **kwargs)

    def patch(self, url: str, **kwargs):
        kwargs["headers"] = self.headers(kwargs.get("headers"))
        return self.client.patch(url, **kwargs)

    def put(self, url: str, **kwargs):
        kwargs["headers"] = self.headers(kwargs.get("headers"))
        return self.client.put(url, **kwargs)

    def delete(self, url: str, **kwargs):
        kwargs["headers"] = self.headers(kwargs.get("headers"))
        return self.client.delete(url, **kwargs)


_seq = 0


def _uid(prefix: str = "u") -> str:
    global _seq
    _seq += 1
    return f"{prefix}_{_seq}"


def _create_user(admin: AuthedSession, username: str | None = None, password: str = "password123", role: str = "user") -> tuple[dict, AuthedSession]:
    uname = username or _uid("usr")
    res = admin.post("/api/users/", json={"username": uname, "password": password, "role": role})
    assert res.status_code == 201, f"create_user failed: {res.status_code} {res.text}"
    return res.json(), AuthedSession(uname, password)


def _import_place(sess: AuthedSession, name: str, place_type: str = "vila/cidade", region: str = "Galicia", lat: float = 42.88, lon: float = -8.54) -> dict:
    global _seq
    _seq += 1
    with patch("app.services.place_service.ensure_place_polygon", side_effect=lambda db, p: p):
        res = sess.post(
            "/api/places/import",
            json={
                "osm_type": "node",
                "osm_id": 900000 + _seq,
                "name": name,
                "place_type": place_type,
                "hierarchy": {"country": "Espanha", "region": region},
                "lat": lat,
                "lon": lon,
            },
        )
    assert res.status_code == 200, f"import_place failed: {res.status_code} {res.text}"
    return res.json()


class TestSchemaAndMigrations(unittest.TestCase):
    def test_migrations_idempotent_on_current_db(self):
        _apply_lightweight_migrations()
        _apply_lightweight_migrations()
        inspector = inspect(engine)
        for table in ("users", "sessions", "places", "projects", "project_places", "trips", "photos", "notifications", "pins", "activities", "milestones"):
            self.assertTrue(inspector.has_table(table), f"Missing table {table}")

    def test_legacy_db_migration_adds_columns_indexes_and_backfills_positions(self):
        legacy_path = _TMP_ROOT / "legacy_migration_test.db"
        legacy_engine = create_engine(f"sqlite:///{legacy_path}", connect_args={"check_same_thread": False})
        with legacy_engine.begin() as conn:
            conn.execute(text("CREATE TABLE project_places (id INTEGER PRIMARY KEY, project_id INTEGER, place_id INTEGER)"))
            conn.execute(text("CREATE TABLE trips (id INTEGER PRIMARY KEY, start_date DATE, end_date DATE)"))
            conn.execute(text("CREATE TABLE photos (id INTEGER PRIMARY KEY, trip_id INTEGER, url TEXT, created_at DATETIME)"))
            conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT)"))
            conn.execute(text("CREATE TABLE sessions (id INTEGER PRIMARY KEY, token TEXT)"))
            conn.execute(text("CREATE TABLE notifications (id INTEGER PRIMARY KEY, user_id INTEGER, is_read BOOLEAN)"))
            # Insert 3 photos across 2 trips with NULL position
            conn.execute(text("INSERT INTO photos (id, trip_id, url, created_at) VALUES (10, 1, '/uploads/a.webp', '2026-01-01 10:00:00')"))
            conn.execute(text("INSERT INTO photos (id, trip_id, url, created_at) VALUES (11, 1, '/uploads/b.webp', '2026-01-01 11:00:00')"))
            conn.execute(text("INSERT INTO photos (id, trip_id, url, created_at) VALUES (12, 2, '/uploads/c.webp', '2026-01-01 09:00:00')"))

        import app.main as main_mod
        orig_engine = main_mod.engine
        try:
            main_mod.engine = legacy_engine
            _apply_lightweight_migrations()
            # Run a second time to verify strict idempotency
            _apply_lightweight_migrations()
        finally:
            main_mod.engine = orig_engine

        insp = inspect(legacy_engine)
        trip_cols = {c["name"] for c in insp.get_columns("trips")}
        for col in ("title", "cover_photo_id", "cover_immich_asset_id", "external_links", "immich_album_id"):
            self.assertIn(col, trip_cols)
        photo_cols = {c["name"] for c in insp.get_columns("photos")}
        for col in ("position", "taken_at", "lat", "lon"):
            self.assertIn(col, photo_cols)
        user_cols = {c["name"] for c in insp.get_columns("users")}
        for col in ("theme", "yearly_trip_goal"):
            self.assertIn(col, user_cols)
        self.assertIn("is_unmarked", {c["name"] for c in insp.get_columns("project_places")})
        self.assertIn("csrf_token", {c["name"] for c in insp.get_columns("sessions")})
        notif_indexes = {idx["name"] for idx in insp.get_indexes("notifications")}
        self.assertIn("ix_notifications_user_read", notif_indexes)

        with legacy_engine.connect() as conn:
            pos_rows = dict(conn.execute(text("SELECT id, position FROM photos")).fetchall())
        self.assertEqual(pos_rows, {10: 0, 11: 1, 12: 0})
        legacy_engine.dispose()

    def test_seed_default_admin_idempotent(self):
        with SessionLocal() as db:
            res = user_service.seed_default_admin(db)
            self.assertIsNone(res)


class TestAuthSecurityAndCsrf(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.admin = AuthedSession("admin", "adminpass123")
        cls.u1_data, cls.u1 = _create_user(cls.admin)

    def test_security_headers_present(self):
        res = self.admin.get("/api/health")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers.get("x-content-type-options"), "nosniff")
        self.assertEqual(res.headers.get("x-frame-options"), "DENY")
        self.assertEqual(res.headers.get("referrer-policy"), "strict-origin-when-cross-origin")

    def test_all_protected_api_routes_reject_unauthenticated(self):
        anon = TestClient(app, raise_server_exceptions=False)
        public_paths = {"/api/health", "/api/auth/login", "/api/auth/logout"}
        for route in app.routes:
            path = getattr(route, "path", "")
            methods = set(getattr(route, "methods", []) or []) - {"HEAD", "OPTIONS"}
            if not path.startswith("/api/") or path in public_paths:
                continue
            # Fill path params with dummy values
            concrete = (
                path.replace("{trip_id}", "999999")
                .replace("{project_id}", "999999")
                .replace("{place_id}", "999999")
                .replace("{photo_id}", "999999")
                .replace("{user_id}", "999999")
                .replace("{username}", "nobody")
                .replace("{entity_type}", "trip")
                .replace("{entity_id}", "999999")
                .replace("{asset_id}", "abc-123")
                .replace("{style}", "light")
                .replace("{z}", "1")
                .replace("{x}", "0")
                .replace("{y}", "0")
            )
            for method in methods:
                res = anon.request(method, concrete)
                self.assertEqual(
                    res.status_code,
                    401,
                    f"Route {method} {path} returned {res.status_code} without auth (expected 401): {res.text[:120]}",
                )

    def test_all_mutating_routes_require_csrf(self):
        # Use u1's cookie without x-csrf-token header
        csrf_exempt = {"/api/auth/login", "/api/auth/logout"}
        for route in app.routes:
            path = getattr(route, "path", "")
            methods = (set(getattr(route, "methods", []) or []) - {"GET", "HEAD", "OPTIONS"})
            if not path.startswith("/api/") or path in csrf_exempt:
                continue
            concrete = (
                path.replace("{trip_id}", "999999")
                .replace("{project_id}", "999999")
                .replace("{place_id}", "999999")
                .replace("{photo_id}", "999999")
                .replace("{user_id}", "999999")
                .replace("{entity_type}", "trip")
                .replace("{entity_id}", "999999")
            )
            for method in methods:
                # Admin endpoints return 403 either for non-admin or missing CSRF; both are 403!
                res = self.admin.client.request(method, concrete)
                self.assertEqual(
                    res.status_code,
                    403,
                    f"Mutating route {method} {path} allowed without CSRF: {res.status_code} {res.text[:120]}",
                )

    def test_uploads_requires_auth_and_blocks_traversal(self):
        dummy = settings.uploads_dir / "integrity_dummy.webp"
        dummy.write_bytes(b"RIFFxxxxWEBPVP8 ")
        try:
            anon = TestClient(app, raise_server_exceptions=False)
            self.assertEqual(anon.get("/uploads/integrity_dummy.webp").status_code, 401)
            ok = self.u1.get("/uploads/integrity_dummy.webp")
            self.assertEqual(ok.status_code, 200)
            self.assertIn("private", ok.headers.get("cache-control", ""))
            # Path traversal
            self.assertEqual(self.u1.get("/uploads/..%2Fdata%2Fpercursos.db").status_code, 404)
        finally:
            dummy.unlink(missing_ok=True)

    def test_expired_session_rejected_and_pruned(self):
        _, s = _create_user(self.admin)
        token = s.client.cookies.get(settings.session_cookie_name)
        with SessionLocal() as db:
            row = db.query(UserSession).filter(UserSession.token == token).first()
            row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
            db.commit()
        self.assertEqual(s.get("/api/auth/me").status_code, 401)
        with SessionLocal() as db:
            self.assertIsNone(db.query(UserSession).filter(UserSession.token == token).first())

    def test_password_change_revokes_other_sessions_and_admin_reset_revokes_all(self):
        u_data, s1 = _create_user(self.admin, password="oldpassword1")
        s2 = AuthedSession(u_data["username"], "oldpassword1")
        # Change password from s1
        res = s1.post("/api/me/password", json={"current_password": "oldpassword1", "new_password": "newpassword1"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(s1.get("/api/auth/me").status_code, 200)
        self.assertEqual(s2.get("/api/auth/me").status_code, 401)

        # Admin reset revokes even s1
        res = self.admin.post(f"/api/users/{u_data['id']}/reset-password", json={"new_password": "resetpassword1"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(s1.get("/api/auth/me").status_code, 401)

    def test_login_rate_limit_and_reset_on_success(self):
        _reset_login_limiter()
        u_data, _ = _create_user(self.admin, password="rightpassword1")
        c = TestClient(app, raise_server_exceptions=False)
        for _ in range(5):
            r = c.post("/api/auth/login", json={"username": u_data["username"], "password": "wrongpassword"})
            self.assertEqual(r.status_code, 401)
        r6 = c.post("/api/auth/login", json={"username": u_data["username"], "password": "rightpassword1"})
        self.assertEqual(r6.status_code, 429)
        _reset_login_limiter()
        r_ok = c.post("/api/auth/login", json={"username": u_data["username"], "password": "rightpassword1"})
        self.assertEqual(r_ok.status_code, 200)


class TestUserLifecycleAndAdmin(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.admin = AuthedSession("admin", "adminpass123")
        cls.u1_data, cls.u1 = _create_user(cls.admin)

    def test_non_admin_blocked_from_admin_endpoints(self):
        self.assertEqual(self.u1.get("/api/users/").status_code, 403)
        self.assertEqual(self.u1.post("/api/users/", json={"username": "nope", "password": "password123"}).status_code, 403)
        self.assertEqual(self.u1.post("/api/admin/backup").status_code, 403)

    def test_username_validation_and_case_insensitive_duplicate(self):
        self.assertEqual(
            self.admin.post("/api/users/", json={"username": "bad name!", "password": "password123"}).status_code,
            400,
        )
        u_data, _ = _create_user(self.admin, username=_uid("mixedcase"))
        self.assertEqual(
            self.admin.post("/api/users/", json={"username": u_data["username"].upper(), "password": "password123"}).status_code,
            409,
        )

    def test_last_admin_protected(self):
        admin_id = self.admin.user["id"]
        # Cannot demote, deactivate, or self-delete when sole admin
        self.assertEqual(self.admin.patch(f"/api/users/{admin_id}", json={"role": "user"}).status_code, 422)
        self.assertEqual(self.admin.patch(f"/api/users/{admin_id}", json={"is_active": False}).status_code, 422)
        self.assertEqual(self.admin.delete(f"/api/users/{admin_id}").status_code, 400)
        self.assertEqual(self.admin.delete("/api/me/").status_code, 400)

    def test_admins_and_inactive_users_excluded_from_directory_and_invites(self):
        inactive_data, _ = _create_user(self.admin)
        self.assertEqual(self.admin.patch(f"/api/users/{inactive_data['id']}", json={"is_active": False}).status_code, 200)

        directory = self.u1.get("/api/users/directory").json()
        dir_ids = {u["id"] for u in directory}
        self.assertNotIn(self.admin.user["id"], dir_ids)
        self.assertNotIn(inactive_data["id"], dir_ids)
        self.assertIn(self.u1_data["id"], dir_ids)

        # Public profile of inactive user -> 404
        self.assertEqual(self.u1.get(f"/api/users/public/{inactive_data['username']}").status_code, 404)

        # Inviting admin or inactive user into trip/project silently ignores them
        trip = self.u1.post(
            "/api/trips/",
            json={
                "title": "Invite Filter Trip",
                "start_date": "2026-06-01",
                "participant_ids": [self.admin.user["id"], inactive_data["id"]],
                "visible_user_ids": [self.admin.user["id"], inactive_data["id"]],
            },
        ).json()
        self.assertEqual(trip["participants"], [])
        self.assertEqual(trip["visible_users"], [])

    def test_delete_user_cleans_avatar_photos_foreign_cover_and_pins(self):
        owner_data, owner = _create_user(self.admin)
        guest_data, guest = _create_user(self.admin)
        viewer_data, viewer = _create_user(self.admin)

        # Guest uploads avatar
        av = guest.post("/api/me/avatar", files={"file": ("a.png", _make_png(), "image/png")})
        self.assertEqual(av.status_code, 200)
        avatar_file = settings.uploads_dir / Path(av.json()["avatar_url"]).name
        self.assertTrue(avatar_file.is_file())

        # Guest creates own trip + photo; viewer pins guest's trip
        guest_trip = guest.post("/api/trips/", json={"title": "Guest Trip", "start_date": "2026-04-01"}).json()
        g_photo = guest.post(
            f"/api/trips/{guest_trip['id']}/photos/",
            files=[("files", ("g.png", _make_png(), "image/png"))],
        ).json()[0]
        g_photo_file = settings.uploads_dir / Path(g_photo["url"]).name
        self.assertTrue(g_photo_file.is_file())
        self.assertEqual(viewer.post("/api/pins/", json={"entity_type": "trip", "entity_id": guest_trip["id"]}).status_code, 201)

        # Owner creates trip with guest as participant; guest uploads photo and owner sets it as cover
        owner_trip = owner.post(
            "/api/trips/",
            json={"title": "Owner Trip", "start_date": "2026-04-05", "participant_ids": [guest_data["id"]]},
        ).json()
        shared_photo = guest.post(
            f"/api/trips/{owner_trip['id']}/photos/",
            files=[("files", ("s.png", _make_png(), "image/png"))],
        ).json()[0]
        shared_photo_file = settings.uploads_dir / Path(shared_photo["url"]).name
        self.assertEqual(owner.patch(f"/api/trips/{owner_trip['id']}", json={"cover_photo_id": shared_photo["id"]}).status_code, 200)

        # Admin deletes guest
        del_res = self.admin.delete(f"/api/users/{guest_data['id']}")
        self.assertEqual(del_res.status_code, 204)

        # All files removed from disk
        self.assertFalse(avatar_file.exists())
        self.assertFalse(g_photo_file.exists())
        self.assertFalse(shared_photo_file.exists())

        # Owner's trip still loads and its cover_photo_id was cleared
        ot = owner.get(f"/api/trips/{owner_trip['id']}").json()
        self.assertIsNone(ot["cover_photo_id"])
        self.assertIsNone(ot["cover_photo_url"])

        # Viewer's dangling pin to guest's trip was cleaned up
        viewer_pins = viewer.get("/api/pins/").json()
        self.assertFalse(any(p["entity_id"] == guest_trip["id"] for p in viewer_pins))


class TestVisibilityAndIdor(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.admin = AuthedSession("admin", "adminpass123")
        cls.alice_data, cls.alice = _create_user(cls.admin)
        cls.bob_data, cls.bob = _create_user(cls.admin)
        cls.carol_data, cls.carol = _create_user(cls.admin)
        cls.place_public = _import_place(cls.alice, "Porto Publico")
        cls.place_secret = _import_place(cls.alice, "Aldeia Secreta_100%")

    def test_trip_visibility_matrix_and_specific_participant_not_viewer(self):
        # SPECIFIC trip where Bob is participant, Carol is viewer, Bob is NOT viewer
        trip = self.alice.post(
            "/api/trips/",
            json={
                "title": "Specific Trip",
                "start_date": "2026-05-01",
                "visibility": "specific",
                "participant_ids": [self.bob_data["id"]],
                "visible_user_ids": [self.carol_data["id"]],
                "place_ids": [self.place_secret["id"]],
            },
        ).json()
        tid = trip["id"]

        # Alice (creator) can see & edit
        self.assertEqual(self.alice.get(f"/api/trips/{tid}").status_code, 200)
        # Carol (viewer, not participant) can see, CANNOT edit/delete/upload (deliberate 404)
        self.assertEqual(self.carol.get(f"/api/trips/{tid}").status_code, 200)
        self.assertEqual(self.carol.patch(f"/api/trips/{tid}", json={"title": "Hacked"}).status_code, 404)
        self.assertEqual(self.carol.delete(f"/api/trips/{tid}").status_code, 404)
        self.assertEqual(self.carol.get(f"/api/trips/{tid}/delete-warning").status_code, 404)
        self.assertEqual(
            self.carol.post(f"/api/trips/{tid}/photos/", files=[("files", ("x.png", _make_png(), "image/png"))]).status_code,
            404,
        )
        # Bob (participant but NOT in visible_users of SPECIFIC trip) CANNOT see or edit (404)
        self.assertEqual(self.bob.get(f"/api/trips/{tid}").status_code, 404)
        self.assertEqual(self.bob.patch(f"/api/trips/{tid}", json={"title": "Sneak"}).status_code, 404)
        self.assertEqual(self.bob.get(f"/api/trips/{tid}/photos/").status_code, 404)
        # Admin CANNOT see private/specific trips of other users
        self.assertEqual(self.admin.get(f"/api/trips/{tid}").status_code, 404)

    def test_trip_project_visibility_leakage_in_list_and_delete_warning(self):
        # Alice creates a PRIVATE project and a SPECIFIC project where Bob is participant but NOT viewer
        priv_proj = self.alice.post(
            "/api/projects/",
            json={"name": "Alice Private Project", "visibility": "private"},
        ).json()
        spec_proj = self.alice.post(
            "/api/projects/",
            json={
                "name": "Alice Specific Project",
                "visibility": "specific",
                "participant_ids": [self.bob_data["id"]],
                "visible_user_ids": [self.carol_data["id"]],
            },
        ).json()
        pub_proj = self.alice.post(
            "/api/projects/",
            json={"name": "Alice Public Project", "visibility": "all"},
        ).json()

        # Alice creates a shared ALL trip linked to all 3 projects, with Bob as participant
        trip = self.alice.post(
            "/api/trips/",
            json={
                "title": "Shared Trip With Mixed Projects",
                "start_date": "2026-06-10",
                "visibility": "all",
                "participant_ids": [self.bob_data["id"]],
                "project_ids": [priv_proj["id"], spec_proj["id"], pub_proj["id"]],
            },
        ).json()
        tid = trip["id"]

        # Bob's trip detail only sees pub_proj
        bob_detail = self.bob.get(f"/api/trips/{tid}").json()
        self.assertEqual([p["id"] for p in bob_detail["projects"]], [pub_proj["id"]])

        # Bob's trip list project_count MUST match the number of projects Bob can see (1, not 3!)
        bob_list = self.bob.get("/api/trips/").json()
        bob_row = next(t for t in bob_list if t["id"] == tid)
        self.assertEqual(
            bob_row["project_count"],
            1,
            f"TripListResponse.project_count leaked hidden projects: got {bob_row['project_count']}, expected 1",
        )

        # Bob's delete-warning MUST NOT include spec_proj (Bob is participant, NOT visible_user!)
        warn = self.bob.get(f"/api/trips/{tid}/delete-warning").json()
        warn_ids = [p["id"] for p in warn["affected_projects"]]
        self.assertNotIn(
            spec_proj["id"],
            warn_ids,
            f"delete-warning leaked invisible SPECIFIC project {spec_proj['id']}: {warn_ids}",
        )

    def test_search_visibility_and_like_wildcard_escaping(self):
        # Private trip with place_secret ("Aldeia Secreta_100%")
        priv_trip = self.alice.post(
            "/api/trips/",
            json={
                "title": "TopSecretTripXYZ",
                "start_date": "2026-07-01",
                "visibility": "private",
                "place_ids": [self.place_secret["id"]],
            },
        ).json()

        # Bob searching for TopSecretTripXYZ or Aldeia Secreta sees nothing
        bob_res = self.bob.get("/api/search/?q=TopSecretTripXYZ").json()
        self.assertEqual(bob_res["trips"], [])
        bob_place_res = self.bob.get("/api/search/?q=Aldeia Secreta").json()
        self.assertFalse(any(p["id"] == self.place_secret["id"] for p in bob_place_res["places"]))

        # LIKE wildcard escaping: searching "%%" must NOT match places without "%"
        alice_pct = self.alice.get("/api/search/?q=100%25").json()
        self.assertTrue(any(p["id"] == self.place_secret["id"] for p in alice_pct["places"]))
        self.assertFalse(any(p["id"] == self.place_public["id"] for p in alice_pct["places"]))
        self.alice.delete(f"/api/trips/{priv_trip['id']}")

    def test_pins_visibility_downgrade_does_not_leak_or_block_slots(self):
        # Alice creates public trip, Bob pins it, then Alice makes trip PRIVATE
        t1 = self.alice.post("/api/trips/", json={"title": "Soon Private", "start_date": "2026-08-01", "visibility": "all"}).json()
        self.assertEqual(self.bob.post("/api/pins/", json={"entity_type": "trip", "entity_id": t1["id"]}).status_code, 201)
        self.assertEqual(self.alice.patch(f"/api/trips/{t1['id']}", json={"visibility": "private"}).status_code, 200)

        # Bob's pin list must NOT contain the now-private trip
        bob_pins = self.bob.get("/api/pins/").json()
        self.assertFalse(
            any(p["entity_id"] == t1["id"] for p in bob_pins),
            f"Pin to downgraded private trip still returned to Bob: {bob_pins}",
        )

        # Bob must still be able to pin 2 visible trips without hitting MAX_PINS_PER_TYPE=2
        t2 = self.bob.post("/api/trips/", json={"title": "Bob T2", "start_date": "2026-08-02"}).json()
        t3 = self.bob.post("/api/trips/", json={"title": "Bob T3", "start_date": "2026-08-03"}).json()
        self.assertEqual(self.bob.post("/api/pins/", json={"entity_type": "trip", "entity_id": t2["id"]}).status_code, 201)
        self.assertEqual(self.bob.post("/api/pins/", json={"entity_type": "trip", "entity_id": t3["id"]}).status_code, 201)
        # Cleanup Bob's pins
        self.bob.delete(f"/api/pins/trip/{t2['id']}")
        self.bob.delete(f"/api/pins/trip/{t3['id']}")

    def test_activities_hide_private_and_deleted_from_others(self):
        t = self.alice.post("/api/trips/", json={"title": "Ephemeral Secret", "start_date": "2026-09-01", "visibility": "private"}).json()
        tid = t["id"]
        # Bob does not see activity while trip exists
        bob_acts = self.bob.get("/api/activities/").json()
        self.assertFalse(any(a["entity_id"] == tid and a["entity_type"] == "trip" for a in bob_acts))
        # Delete trip: Alice still sees her own activity, Bob still does not
        self.assertEqual(self.alice.delete(f"/api/trips/{tid}").status_code, 204)
        alice_acts = self.alice.get("/api/activities/").json()
        bob_acts_after = self.bob.get("/api/activities/").json()
        self.assertTrue(any(a["entity_id"] == tid and a["entity_type"] == "trip" for a in alice_acts))
        self.assertFalse(any(a["entity_id"] == tid and a["entity_type"] == "trip" for a in bob_acts_after))


class TestTripsLinksAndCovers(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.admin = AuthedSession("admin", "adminpass123")
        cls.u_data, cls.u = _create_user(cls.admin)

    def test_trip_dates_sanitization_and_external_links(self):
        # End before start on create -> 422
        r = self.u.post("/api/trips/", json={"start_date": "2026-05-10", "end_date": "2026-05-01"})
        self.assertEqual(r.status_code, 422)

        # Create with XSS notes + 3 external links
        r = self.u.post(
            "/api/trips/",
            json={
                "title": "Sanitize & Links",
                "start_date": "2026-05-10",
                "end_date": "2026-05-15",
                "notes": '<p>Olá</p><script>alert(1)</script><img src="/uploads/ok.webp" onerror="alert(2)"><a href="javascript:alert(3)">x</a>',
                "external_links": [
                    {"url": "https://photos.google.com/share/abc"},
                    {"url": "http://192.168.1.10:2283/albums/11111111-1111-1111-1111-111111111111"},
                    {"url": "https://example.org/blog/"},
                ],
            },
        )
        self.assertEqual(r.status_code, 201, r.text)
        trip = r.json()
        self.assertNotIn("<script", trip["notes"])
        self.assertNotIn("onerror", trip["notes"])
        self.assertNotIn("javascript:", trip["notes"])
        self.assertIn("/uploads/ok.webp", trip["notes"])
        self.assertEqual([l["type"] for l in trip["external_links"]], ["google_photos", "immich", "link"])

        tid = trip["id"]
        # Single-date PATCH that would invert range -> 422
        self.assertEqual(self.u.patch(f"/api/trips/{tid}", json={"start_date": "2026-05-20"}).status_code, 422)
        self.assertEqual(self.u.patch(f"/api/trips/{tid}", json={"end_date": "2026-05-01"}).status_code, 422)

        # Case-insensitive & trailing-slash link dedup -> 422
        self.assertEqual(
            self.u.patch(
                f"/api/trips/{tid}",
                json={"external_links": [{"url": "https://EXAMPLE.org/a/"}, {"url": "https://example.org/a"}]},
            ).status_code,
            422,
        )
        # >3 links -> 422
        self.assertEqual(
            self.u.patch(
                f"/api/trips/{tid}",
                json={"external_links": [{"url": f"https://example.org/{i}"} for i in range(4)]},
            ).status_code,
            422,
        )
        # Non-http scheme -> 422
        self.assertEqual(
            self.u.patch(f"/api/trips/{tid}", json={"external_links": [{"url": "javascript:alert(1)"}]}).status_code,
            422,
        )


class TestPhotosAndImagePipeline(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.admin = AuthedSession("admin", "adminpass123")
        cls.u1_data, cls.u1 = _create_user(cls.admin)
        cls.u2_data, cls.u2 = _create_user(cls.admin)

    def test_transactional_upload_exif_orientation_reorder_permissions_and_trip_delete(self):
        trip = self.u1.post(
            "/api/trips/",
            json={"title": "Photo Integrity", "start_date": "2026-06-01", "participant_ids": [self.u2_data["id"]]},
        ).json()
        tid = trip["id"]

        # Mixed valid + invalid batch must roll back completely (no DB rows, no orphan files)
        before_files = set(settings.uploads_dir.iterdir())
        bad = self.u1.post(
            f"/api/trips/{tid}/photos/",
            files=[
                ("files", ("good.png", _make_png(), "image/png")),
                ("files", ("evil.txt", b"not an image", "text/plain")),
            ],
        )
        self.assertEqual(bad.status_code, 422)
        self.assertEqual(self.u1.get(f"/api/trips/{tid}/photos/").json(), [])
        self.assertEqual(set(settings.uploads_dir.iterdir()), before_files)

        # Upload rotated EXIF photo (120x60 with Orientation=6 -> rotated to 60x120) + EXIF date/GPS
        exif_jpg = _make_jpeg_with_exif(
            width=120,
            height=60,
            orientation=6,
            dt_original="2025:08:15 14:22:10",
            gps=(41.1579, -8.6291),
        )
        up1 = self.u1.post(
            f"/api/trips/{tid}/photos/",
            files=[("files", ("portrait.jpg", exif_jpg, "image/jpeg"))],
        )
        self.assertEqual(up1.status_code, 201, up1.text)
        p1 = up1.json()[0]
        self.assertEqual((p1["width"], p1["height"]), (60, 120))
        self.assertTrue(p1["taken_at"].startswith("2025-08-15T14:22:10"))
        self.assertAlmostEqual(p1["lat"], 41.1579, places=3)
        self.assertAlmostEqual(p1["lon"], -8.6291, places=3)

        # Participant u2 uploads p2; u2 cannot edit/delete u1's p1, but creator u1 CAN edit u2's p2
        p2 = self.u2.post(
            f"/api/trips/{tid}/photos/",
            files=[("files", ("p2.png", _make_png(), "image/png"))],
        ).json()[0]
        self.assertEqual(self.u2.patch(f"/api/trips/{tid}/photos/{p1['id']}", json={"caption": "nope"}).status_code, 404)
        self.assertEqual(self.u2.delete(f"/api/trips/{tid}/photos/{p1['id']}").status_code, 404)
        self.assertEqual(self.u1.patch(f"/api/trips/{tid}/photos/{p2['id']}", json={"caption": "ok"}).status_code, 200)

        # Reorder validation
        self.assertEqual(self.u1.put(f"/api/trips/{tid}/photos/order", json={"photo_ids": [p1["id"]]}).status_code, 422)
        self.assertEqual(self.u1.put(f"/api/trips/{tid}/photos/order", json={"photo_ids": [p1["id"], p1["id"]]}).status_code, 422)
        reord = self.u1.put(f"/api/trips/{tid}/photos/order", json={"photo_ids": [p2["id"], p1["id"]]})
        self.assertEqual(reord.status_code, 200)
        self.assertEqual([p["id"] for p in reord.json()], [p2["id"], p1["id"]])

        # Set p1 as cover, then delete trip -> both photo files must be unlinked cleanly
        self.assertEqual(self.u1.patch(f"/api/trips/{tid}", json={"cover_photo_id": p1["id"]}).status_code, 200)
        f1 = settings.uploads_dir / Path(p1["url"]).name
        f2 = settings.uploads_dir / Path(p2["url"]).name
        self.assertTrue(f1.is_file() and f2.is_file())
        self.assertEqual(self.u1.delete(f"/api/trips/{tid}").status_code, 204)
        self.assertFalse(f1.exists())
        self.assertFalse(f2.exists())

    def test_decompression_bomb_rejected(self):
        # Craft a tiny PNG header claiming 10000x10000 (100 Mpx > 40 Mpx limit)
        # Pillow reads dimensions from header before decoding pixels.
        from app.services import image_service
        orig_max = image_service.MAX_IMAGE_PIXELS
        try:
            image_service.MAX_IMAGE_PIXELS = 1000  # 80x60 = 4800 > 1000
            res = self.u1.post("/api/images/", files={"file": ("big.png", _make_png(80, 60), "image/png")})
            self.assertEqual(res.status_code, 400)
        finally:
            image_service.MAX_IMAGE_PIXELS = orig_max


class TestProjectsProgressAndBulkImport(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.admin = AuthedSession("admin", "adminpass123")
        cls.u1_data, cls.u1 = _create_user(cls.admin)
        cls.u2_data, cls.u2 = _create_user(cls.admin)

    def test_create_project_deduplicates_place_ids(self):
        pl = _import_place(self.u1, "Braga")
        res = self.u1.post(
            "/api/projects/",
            json={"name": "Dedup Project", "place_ids": [pl["id"], pl["id"], pl["id"]]},
        )
        self.assertEqual(res.status_code, 201)
        proj = res.json()
        self.assertEqual(
            proj["total_places"],
            1,
            f"Duplicate place_ids in create_project produced {proj['total_places']} places!",
        )
        self.assertEqual(len(proj["places"]), 1)

    def test_project_progress_visited_at_and_unmark(self):
        p1 = _import_place(self.u1, "Coimbra")
        p2 = _import_place(self.u1, "Aveiro")
        proj = self.u1.post(
            "/api/projects/",
            json={"name": "Centro", "place_ids": [p1["id"], p2["id"]]},
        ).json()
        pid = proj["id"]

        # Two trips visiting p1 with different end_dates -> visited_at must be the latest end_date
        self.u1.post("/api/trips/", json={"start_date": "2025-01-01", "end_date": "2025-01-03", "place_ids": [p1["id"]], "project_ids": [pid]})
        self.u1.post("/api/trips/", json={"start_date": "2026-03-10", "end_date": "2026-03-14", "place_ids": [p1["id"]], "project_ids": [pid]})

        detail = self.u1.get(f"/api/projects/{pid}").json()
        self.assertEqual(detail["visited_places"], 1)
        self.assertEqual(detail["progress_percent"], 50.0)
        self.assertFalse(detail["is_completed"])
        pp1 = next(x for x in detail["places"] if x["place_id"] == p1["id"])
        self.assertTrue(pp1["is_visited"])
        self.assertEqual(pp1["visited_at"], "2026-03-14")

        # Unmarking p1 removes it from visited_places and clears visited_at
        unmarked = self.u1.post(f"/api/projects/{pid}/places/{p1['id']}/unmark").json()
        self.assertEqual(unmarked["visited_places"], 0)
        pp1_u = next(x for x in unmarked["places"] if x["place_id"] == p1["id"])
        self.assertFalse(pp1_u["is_visited"])
        self.assertTrue(pp1_u["is_unmarked"])
        self.assertIsNone(pp1_u["visited_at"])

    def test_bulk_import_validation_and_confirm(self):
        pl = _import_place(self.u1, "EvoraCached", place_type="vila/cidade")
        proj = self.u1.post("/api/projects/", json={"name": "Bulk Test"}).json()
        pid = proj["id"]

        # Exact cached match resolves without Nominatim
        res = self.u1.post(f"/api/projects/{pid}/bulk-import", json={"lines": ["EvoraCached", "evoracached"]})
        self.assertEqual(res.status_code, 200)
        lines = res.json()["lines"]
        self.assertEqual(len(lines), 2)
        self.assertEqual(lines[0]["status"], "resolved")
        self.assertEqual(lines[1]["status"], "resolved")

        with patch("app.services.place_service.ensure_places_polygons", side_effect=lambda db, ps: None):
            conf = self.u1.post(f"/api/projects/{pid}/bulk-import/confirm", json=lines)
        self.assertEqual(conf.status_code, 200)
        self.assertEqual(conf.json()["total_places"], 1)


class TestStatsPlacesNotificationsPushMilestonesBackup(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.admin = AuthedSession("admin", "adminpass123")
        cls.u1_data, cls.u1 = _create_user(cls.admin)
        cls.u2_data, cls.u2 = _create_user(cls.admin)

    def test_stats_place_type_stats_beyond_top_10_and_companions(self):
        # Create 12 distinct places (11 vila/cidade + 1 país) so top-10 would drop at least 2
        places = [_import_place(self.u1, f"City_{i}", place_type="vila/cidade", region="Norte") for i in range(11)]
        country = _import_place(self.u1, "Portugal_Stat", place_type="país", region="Europa")
        u3_data, _ = _create_user(self.admin)
        before_companions = self.u1.get("/api/stats/").json()["summary"]["companion_count"]
        self.u1.post(
            "/api/trips/",
            json={
                "title": "Grand Tour",
                "start_date": "2026-02-01",
                "visibility": "private",
                "companions_text": "Ana_Unique, ana_unique, Pedro_Unique",
                "participant_ids": [u3_data["id"]],
                "place_ids": [p["id"] for p in places] + [country["id"]],
            },
        )
        stats = self.u1.get("/api/stats/").json()
        self.assertGreaterEqual(stats["summary"]["place_count"], 12)
        # Companion dedup: user u3 + ana_unique + pedro_unique = +3 over baseline
        self.assertEqual(stats["summary"]["companion_count"] - before_companions, 3)
        type_counts = {x["place_type"]: x["count"] for x in stats["place_type_stats"]}
        self.assertGreaterEqual(type_counts.get("vila/cidade", 0), 11)
        self.assertGreaterEqual(type_counts.get("país", 0), 1)

    def test_adversarial_inputs_never_500(self):
        # Int64 overflow in path & body -> 422
        huge = 10**30
        self.assertEqual(self.u1.get(f"/api/trips/{huge}").status_code, 422)
        self.assertEqual(self.u1.get(f"/api/places/{huge}").status_code, 422)
        self.assertEqual(self.u1.get("/api/places/?limit=-1").status_code, 422)
        # NaN / out-of-range coords -> 422 (raw JSON with NaN)
        r_nan = self.u1.client.post(
            "/api/places/import",
            content='{"osm_type":"node","osm_id":1,"name":"X","place_type":"outro","lat":NaN,"lon":0}',
            headers={"content-type": "application/json", "x-csrf-token": self.u1.csrf},
        )
        self.assertEqual(r_nan.status_code, 422)
        r_oob = self.u1.post(
            "/api/places/import",
            json={"osm_type": "node", "osm_id": 2, "name": "X", "place_type": "outro", "lat": 999, "lon": 0},
        )
        self.assertEqual(r_oob.status_code, 422)

    def test_notifications_push_and_milestones(self):
        # Creating a trip with u2 as participant notifies u2, not u1
        t = self.u1.post(
            "/api/trips/",
            json={"title": "Notify Me", "start_date": "2026-10-01", "participant_ids": [self.u2_data["id"]]},
        ).json()
        u2_notifs = self.u2.get("/api/notifications/").json()
        self.assertTrue(any(n["entity_id"] == t["id"] for n in u2_notifs["notifications"]))
        u1_notifs = self.u1.get("/api/notifications/").json()
        self.assertFalse(any(n["entity_id"] == t["id"] for n in u1_notifs["notifications"]))

        # Cross-user mark_read is a no-op
        target_id = next(n["id"] for n in u2_notifs["notifications"] if n["entity_id"] == t["id"])
        before_unread = self.u2.get("/api/notifications/unread-count").json()["unread_count"]
        self.u1.post("/api/notifications/read", json={"ids": [target_id]})
        after_unread = self.u2.get("/api/notifications/unread-count").json()["unread_count"]
        self.assertEqual(before_unread, after_unread)

        # Push subscribe reassignment across users
        ep = "https://push.example.test/sub-1"
        self.assertEqual(self.u1.post("/api/push/subscribe", json={"endpoint": ep, "keys": {"p256dh": "k1", "auth": "a1"}}).status_code, 204)
        self.assertEqual(self.u2.post("/api/push/subscribe", json={"endpoint": ep, "keys": {"p256dh": "k2", "auth": "a2"}}).status_code, 204)
        with SessionLocal() as db:
            rows = db.query(PushSubscription).filter(PushSubscription.endpoint == ep).all()
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0].user_id, self.u2_data["id"])
        # u1 unsubscribing cannot remove u2's subscription
        self.assertEqual(self.u1.post("/api/push/unsubscribe", json={"endpoint": ep}).status_code, 204)
        with SessionLocal() as db:
            self.assertEqual(db.query(PushSubscription).filter(PushSubscription.endpoint == ep).count(), 1)

        # Milestones check is idempotent
        m1 = self.u1.post("/api/milestones/check")
        self.assertEqual(m1.status_code, 200)
        m2 = self.u1.post("/api/milestones/check")
        self.assertEqual(m2.status_code, 200)
        self.assertEqual(m2.json()["new_milestones"], [])

    def test_tiles_validation_and_backup_integrity(self):
        self.assertEqual(self.u1.get("/api/tiles/bogus/5/10/10.png").status_code, 400)
        self.assertEqual(self.u1.get("/api/tiles/light/25/0/0.png").status_code, 400)
        self.assertEqual(self.u1.get("/api/tiles/light/2/99/0.png").status_code, 400)

        backup_dir = run_backup()
        self.assertTrue((backup_dir / "percursos.db").is_file())
        env_file = backup_dir / "deployment.env"
        self.assertTrue(env_file.is_file())
        self.assertEqual(env_file.stat().st_mode & 0o777, 0o600)
        # Verify backup SQLite DB is readable and valid
        conn = sqlite3.connect(str(backup_dir / "percursos.db"))
        try:
            integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
            self.assertEqual(integrity, "ok")
        finally:
            conn.close()

    def test_immich_status_and_trip_album_never_500(self):
        # Status endpoint must respond cleanly (200), never 500
        res = self.u1.get("/api/immich/status")
        self.assertEqual(res.status_code, 200, f"/api/immich/status crashed: {res.status_code} {res.text}")
        body = res.json()
        self.assertIn("enabled", body)


if __name__ == "__main__":
    unittest.main()
