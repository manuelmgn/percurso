"""Tests for security utilities: token creation, password hashing, sharing tokens."""

import pytest
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_invite_token,
    generate_sharing_token,
    hash_password,
    verify_password,
)

# Minimal settings override for tests
import os
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-testing-only")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
os.environ.setdefault("DATABASE_SYNC_URL", "postgresql+psycopg2://test:test@localhost/test")


def test_password_hash_and_verify():
    hashed = hash_password("mypassword123")
    assert verify_password("mypassword123", hashed)
    assert not verify_password("wrongpassword", hashed)


def test_access_token_payload():
    token = create_access_token(42)
    payload = decode_token(token)
    assert payload["sub"] == "42"
    assert payload["type"] == "access"


def test_refresh_token_payload():
    token, jti = create_refresh_token(99)
    payload = decode_token(token)
    assert payload["sub"] == "99"
    assert payload["type"] == "refresh"
    assert payload["jti"] == jti


def test_access_refresh_tokens_are_different():
    access = create_access_token(1)
    refresh, _ = create_refresh_token(1)
    assert access != refresh


def test_sharing_token_is_random():
    tokens = {generate_sharing_token() for _ in range(20)}
    assert len(tokens) == 20


def test_sharing_token_minimum_length():
    token = generate_sharing_token()
    assert len(token) >= 32


def test_invite_token_is_random():
    tokens = {generate_invite_token() for _ in range(20)}
    assert len(tokens) == 20
