PLACE_TYPE_MAP: dict[str, str] = {
    # Igreja
    "church": "igreja",
    "cathedral": "igreja",
    "chapel": "igreja",
    "place_of_worship": "igreja",
    # Monumento
    "castle": "monumento",
    "museum": "monumento",
    "monument": "monumento",
    "memorial": "monumento",
    "ruins": "monumento",
    "archaeological_site": "monumento",
    # Edifício
    "building": "edificio",
    "house": "edificio",
    "apartments": "edificio",
    "hotel": "edificio",
    "hospital": "edificio",
    "school": "edificio",
    "university": "edificio",
    "library": "edificio",
    "theatre": "edificio",
    "cinema": "edificio",
    # Bairro / Freguesia
    "neighbourhood": "bairro",
    "suburb": "bairro",
    "quarter": "bairro",
    "parish": "bairro",
    "borough": "bairro",
    # Cidade
    "city": "cidade",
    "town": "cidade",
    "village": "cidade",
    "hamlet": "cidade",
    "locality": "cidade",
    # Comarca
    "municipality": "comarca",
    "county": "comarca",
    "district": "comarca",
    "administrative": "comarca",
    # Província
    "province": "provincia",
    "state_district": "provincia",
    # Região
    "state": "regiao",
    "region": "regiao",
    "country_region": "regiao",
    # País
    "country": "pais",
    # Natureza
    "park": "natureza",
    "forest": "natureza",
    "beach": "natureza",
    "mountain": "natureza",
    "river": "natureza",
    "lake": "natureza",
    "nature_reserve": "natureza",
    "valley": "natureza",
    "island": "natureza",
}

PLACE_TYPE_LABELS: dict[str, str] = {
    "igreja": "Igreja",
    "monumento": "Monumento",
    "edificio": "Edifício",
    "bairro": "Bairro / Freguesia",
    "cidade": "Cidade",
    "comarca": "Comarca",
    "provincia": "Província",
    "regiao": "Região",
    "pais": "País",
    "natureza": "Natureza",
    "outro": "Outro",
}

PLACE_TYPE_EMOJI: dict[str, str] = {
    "igreja": "⛪",
    "monumento": "🏛️",
    "edificio": "🏢",
    "bairro": "🏘️",
    "cidade": "🏙️",
    "comarca": "🗺️",
    "provincia": "📍",
    "regiao": "📌",
    "pais": "🌍",
    "natureza": "🌿",
    "outro": "🌐",
}


def get_place_type(osm_type: str, osm_class: str = "") -> str:
    """Derive the app place type from OSM type and class fields."""
    key = (osm_type or "").lower()
    if key in PLACE_TYPE_MAP:
        return PLACE_TYPE_MAP[key]
    key = (osm_class or "").lower()
    if key in PLACE_TYPE_MAP:
        return PLACE_TYPE_MAP[key]
    return "outro"
