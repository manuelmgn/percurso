import logging
import re

from celery import Celery
from celery.signals import worker_ready

from app.core.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

celery_app = Celery(
    "percurso",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.workers.image_worker"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)


def _mask_url(url: str) -> str:
    return re.sub(r"(:)[^@/]+(.*@)", r"\1***\2", url)


@worker_ready.connect
def on_worker_ready(sender, **kwargs):
    masked_broker = _mask_url(settings.celery_broker_url)
    logger.info("Celery worker started, waiting for tasks. Broker: %s", masked_broker)
    logger.info("Registered tasks: %s", sorted(celery_app.tasks.keys()))
