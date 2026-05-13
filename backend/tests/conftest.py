"""Pytest configuration and fixtures for Percurso backend tests."""

import os
import pytest

# Set test environment variables before any app imports
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-testing-only")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test_percurso")
os.environ.setdefault("DATABASE_SYNC_URL", "postgresql+psycopg2://test:test@localhost/test_percurso")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/15")
