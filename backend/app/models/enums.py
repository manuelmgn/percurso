import enum


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    USER = "user"


class ThemePreference(str, enum.Enum):
    LIGHT = "light"
    DARK = "dark"
    SYSTEM = "system"


class Visibility(str, enum.Enum):
    ALL = "all"
    SPECIFIC = "specific"
    PRIVATE = "private"


class MapMode(str, enum.Enum):
    POINTS = "points"
    POLYGONS = "polygons"
    AUTO = "auto"


class PlaceType(str, enum.Enum):
    BUILDING = "edifício/monumento"
    STREET = "rua/praça"
    VILLAGE = "aldeia/lugar"
    PARISH = "freguesia"
    TOWN = "vila/cidade"
    MUNICIPALITY = "concelho/município"
    COMARCA = "comarca"
    PROVINCE = "província"
    REGION = "região/comunidade"
    COUNTRY = "país"
    CONTINENT = "continente"
    OTHER = "outro"


class EntityAction(str, enum.Enum):
    CREATED = "created"
    UPDATED = "updated"
    DELETED = "deleted"


class EntityType(str, enum.Enum):
    TRIP = "trip"
    PROJECT = "project"
    PLACE = "place"
    USER = "user"
