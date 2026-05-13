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


async def fetch_og_metadata(url: str) -> dict:
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; Percurso/1.0)",
        "Accept": "text/html",
    }
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True, max_redirects=3) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
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
