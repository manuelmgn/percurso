from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Float
from sqlalchemy.orm import relationship

from app.database import Base


class Photo(Base):
    """A photo attached to a trip. The file lives on disk in the uploads
    volume; the row only stores the public URL."""

    __tablename__ = "photos"

    id = Column(Integer, primary_key=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True)
    uploader_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    url = Column(String(512), nullable=False)
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    caption = Column(String(512), nullable=True)
    # Manual gallery order (0-based); NULL until backfilled or assigned.
    position = Column(Integer, nullable=True)
    # EXIF capture metadata, extracted from the original file at upload.
    taken_at = Column(DateTime(timezone=True), nullable=True)
    lat = Column(Float, nullable=True)
    lon = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    # foreign_keys disambiguates from the trips.cover_photo_id path back to
    # this table (both sides of the relationship would otherwise match).
    trip = relationship("Trip", backref="photos", foreign_keys=[trip_id])
    uploader = relationship("User", backref="photos")
