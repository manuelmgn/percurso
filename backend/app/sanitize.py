"""Strict HTML sanitisation for trip notes (anti-XSS allowlist)."""

import nh3

ALLOWED_TAGS = {
    "p", "br", "strong", "b", "em", "i", "u", "s",
    "h2", "h3", "ul", "ol", "li", "a", "img", "blockquote", "font", "iframe",
}

ALLOWED_ATTRIBUTES = {
    "a": {"href", "title"},
    "img": {"src", "alt", "loading"},
    "font": {"face"},
    "iframe": {"src", "title", "loading", "allow", "allowfullscreen", "frameborder"},
}

# Font families selectable in the editor toolbar — anything else is dropped.
ALLOWED_FONT_FACES = {
    "arial",
    "georgia",
    "times new roman",
    "courier new",
    "verdana",
}

# Only YouTube embeds may be iframed into notes.
ALLOWED_IFRAME_PREFIXES = (
    "https://www.youtube.com/embed/",
    "https://www.youtube-nocookie.com/embed/",
)


def _attribute_filter(tag: str, attribute: str, value: str):
    # Embedded images must point to locally stored uploads only — this also
    # prevents tracking pixels or external requests on page render.
    if tag == "img" and attribute == "src" and not value.startswith("/uploads/"):
        return None
    if tag == "font" and attribute == "face" and value.strip().lower() not in ALLOWED_FONT_FACES:
        return None
    if tag == "iframe" and attribute == "src" and not value.startswith(ALLOWED_IFRAME_PREFIXES):
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
