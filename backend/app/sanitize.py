"""Strict HTML sanitisation for trip notes (anti-XSS allowlist)."""

import nh3

ALLOWED_TAGS = {"p", "br", "strong", "b", "em", "i", "ul", "ol", "li", "a", "img", "blockquote"}

ALLOWED_ATTRIBUTES = {
    "a": {"href", "title"},
    "img": {"src", "alt"},
}


def _attribute_filter(tag: str, attribute: str, value: str):
    # Embedded images must point to locally stored uploads only — this also
    # prevents tracking pixels or external requests on page render.
    if tag == "img" and attribute == "src" and not value.startswith("/uploads/"):
        return None
    return value


def sanitize_notes(html: str | None) -> str | None:
    """Return sanitised HTML safe to render, or None if nothing remains."""
    if not html or not html.strip():
        return None
    cleaned = nh3.clean(
        html,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        url_schemes={"http", "https", "mailto"},
        link_rel="noopener noreferrer nofollow",
        strip_comments=True,
        attribute_filter=_attribute_filter,
    ).strip()
    return cleaned or None
