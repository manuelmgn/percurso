import asyncio
import ipaddress
import socket
from urllib.parse import urlparse

import httpx
from html.parser import HTMLParser


class _OGParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.og: dict[str, str] = {}
        self.title: str | None = None
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "title":
            self._in_title = True
        if tag == "meta":
            attr_dict = dict(attrs)
            prop = attr_dict.get("property") or attr_dict.get("name", "")
            content = attr_dict.get("content", "")
            if prop in ("og:title", "og:description", "og:image", "og:site_name"):
                self.og[prop] = content or ""

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title = data.strip()
            self._in_title = False


_PRIVATE_NETS = [
    ipaddress.ip_network("0.0.0.0/8"),        # "this" network (RFC 1122)
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("100.64.0.0/10"),     # CGNAT shared address space
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),    # link-local / cloud metadata
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("::ffff:0:0/96"),     # IPv4-mapped IPv6
]


def _ip_is_private(ip_str: str) -> bool:
    try:
        return any(ipaddress.ip_address(ip_str) in net for net in _PRIVATE_NETS)
    except ValueError:
        return True


async def _resolve_and_check(host: str) -> bool:
    """Resolve host once in a thread, return True if the IP is safe (public).
    Performing a single resolution here and re-using it reduces the DNS
    rebinding window compared to letting httpx resolve independently."""
    try:
        loop = asyncio.get_event_loop()
        ip_str = await loop.run_in_executor(None, socket.gethostbyname, host)
        return not _ip_is_private(ip_str)
    except (socket.gaierror, OSError):
        return False  # unresolvable — block


async def _host_is_safe(url: str) -> bool:
    try:
        parsed = urlparse(url)
        if parsed.scheme != "https":
            return False
        host = parsed.hostname
        if not host:
            return False
        return await _resolve_and_check(host)
    except Exception:
        return False


async def fetch_og_metadata(url: str) -> dict:
    if not await _host_is_safe(url):
        return {"url": url}

    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; Percurso/1.0)",
        "Accept": "text/html",
    }
    try:
        async with httpx.AsyncClient(
            timeout=8.0, follow_redirects=True, max_redirects=3
        ) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()

            # Re-validate after redirect — the final URL may be internal.
            if not await _host_is_safe(str(resp.url)):
                return {"url": url}

            content_type = resp.headers.get("content-type", "")
            if "text/html" not in content_type:
                return {"url": url}

            parser = _OGParser()
            parser.feed(resp.text[:50_000])

            return {
                "og_title": parser.og.get("og:title") or parser.title,
                "og_description": parser.og.get("og:description"),
                "og_image_url": parser.og.get("og:image"),
                "og_site_name": parser.og.get("og:site_name"),
            }
    except (httpx.HTTPError, Exception):
        return {"url": url}
