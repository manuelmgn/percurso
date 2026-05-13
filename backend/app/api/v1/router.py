from fastapi import APIRouter

from app.api.v1.endpoints import admin, auth, notifications, places, projects, trips, users

router = APIRouter(prefix="/api/v1")

router.include_router(auth.router)
router.include_router(users.router)
router.include_router(places.router)
router.include_router(trips.router)
router.include_router(projects.router)
router.include_router(notifications.router)
router.include_router(admin.router)
