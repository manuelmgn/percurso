PLACE_TYPE_LABELS: dict[str, str] = {
    "bar": "Bar",
    "cafe": "Café",
    "restaurante": "Restaurante",
    "teatro": "Teatro",
    "hospital": "Hospital",
    "escola": "Escola",
    "templo": "Templo",
    "museu": "Museu",
    "hotel": "Hotel",
    "castelo": "Castelo",
    "monumento": "Monumento",
    "edificio": "Edifício",
    "tenda": "Loja",
    "natureza": "Natureza",
    "auga": "Água",
    "praia": "Praia",
    "montanha": "Montanha",
    "parque": "Parque",
    "pais": "País",
    "regiao": "Região",
    "provincia": "Província",
    "comarca": "Comarca",
    "cidade": "Cidade",
    "bairro": "Bairro",
    "ilha": "Ilha",
    "limite": "Limite administrativo",
    "outro": "Outro",
}

PLACE_TYPE_CATEGORY: dict[str, str] = {
    "bar": "edificios",
    "cafe": "edificios",
    "restaurante": "edificios",
    "teatro": "edificios",
    "hospital": "edificios",
    "escola": "edificios",
    "templo": "edificios",
    "museu": "edificios",
    "hotel": "edificios",
    "castelo": "edificios",
    "monumento": "edificios",
    "edificio": "edificios",
    "tenda": "edificios",
    "natureza": "natureza",
    "auga": "natureza",
    "praia": "natureza",
    "montanha": "natureza",
    "parque": "natureza",
    "pais": "territorios",
    "regiao": "territorios",
    "provincia": "territorios",
    "comarca": "territorios",
    "cidade": "territorios",
    "bairro": "territorios",
    "ilha": "territorios",
    "limite": "territorios",
    "outro": "outro",
}

PLACE_CATEGORY_LABELS: dict[str, str] = {
    "edificios": "Edifícios",
    "natureza": "Espaços Naturais",
    "territorios": "Territórios",
    "outro": "Outro",
}


def get_place_type(
    osm_class: str,
    osm_type: str,
    addresstype: str = "",
    admin_level: int | None = None,
) -> str:
    """Derive the app place type from Nominatim class, type, addresstype and optional admin_level."""
    cls = (osm_class or "").lower()
    typ = (osm_type or "").lower()
    atype = (addresstype or "").lower()

    # Step 1 — boundary/administrative: addresstype first, admin_level as fallback
    if cls == "boundary" and typ == "administrative":
        if atype == "country":
            return "pais"
        if atype in ("state", "region"):
            return "regiao"
        if atype in ("province", "state_district"):
            return "provincia"
        if atype == "municipality":
            return "cidade"
        if atype in ("county", "district"):
            return "comarca"
        if atype in ("suburb", "neighbourhood", "quarter", "borough"):
            return "bairro"
        if admin_level == 2:
            return "pais"
        if admin_level in (3, 4):
            return "regiao"
        if admin_level in (5, 6):
            return "provincia"
        if admin_level in (7, 8):
            return "comarca"
        if admin_level in (9, 10):
            return "bairro"
        return "limite"

    # Step 2 — amenity
    if cls == "amenity":
        if typ in ("bar", "pub", "biergarten"):
            return "bar"
        if typ == "cafe":
            return "cafe"
        if typ in ("restaurant", "fast_food", "food_court"):
            return "restaurante"
        if typ in ("theatre", "cinema", "arts_centre"):
            return "teatro"
        if typ in ("hospital", "clinic"):
            return "hospital"
        if typ in ("school", "university", "college", "library"):
            return "escola"
        if typ == "place_of_worship":
            return "templo"
        return "edificio"

    # Step 3 — place
    if cls == "place":
        if typ == "country":
            return "pais"
        if typ in ("state", "region"):
            return "regiao"
        if typ in ("province", "state_district"):
            return "provincia"
        if typ in ("county", "district", "municipality"):
            return "comarca"
        if typ in ("city", "town", "village", "hamlet", "locality"):
            return "cidade"
        if typ in ("suburb", "neighbourhood", "quarter", "borough"):
            return "bairro"
        if typ in ("island", "islet"):
            return "ilha"
        return "limite"

    # Step 4 — tourism
    if cls == "tourism":
        if typ in ("museum", "gallery", "attraction"):
            return "museu"
        if typ in ("hotel", "hostel", "guest_house"):
            return "hotel"
        return "edificio"

    # Step 5 — historic
    if cls == "historic":
        if typ in ("castle", "fort", "ruins", "archaeological_site"):
            return "castelo"
        if typ in ("church", "cathedral", "monastery"):
            return "templo"
        if typ in ("memorial", "monument"):
            return "monumento"
        return "monumento"

    # Step 6 — building
    if cls == "building":
        if typ in ("church", "cathedral", "chapel"):
            return "templo"
        if typ == "castle":
            return "castelo"
        return "edificio"

    # Step 7 — shop
    if cls == "shop":
        return "tenda"

    # Step 8 — natural
    if cls == "natural":
        if typ in ("wood", "forest", "tree"):
            return "natureza"
        if typ in ("water", "river", "lake"):
            return "auga"
        if typ == "beach":
            return "praia"
        if typ in ("mountain", "peak", "valley", "cliff"):
            return "montanha"
        return "natureza"

    # Step 9 — leisure
    if cls == "leisure":
        if typ in ("park", "garden", "nature_reserve"):
            return "parque"
        return "natureza"

    # Step 10 — landuse
    if cls == "landuse":
        return "natureza"

    return "outro"
