from sqlalchemy import Column, Integer, String, Text, ForeignKey, Enum, Table, Boolean, DateTime
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.base import TimestampMixin
from app.models.enums import Visibility, MapMode


project_participants = Table(
    "project_participants",
    Base.metadata,
    Column("project_id", Integer, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)

project_visible_users = Table(
    "project_visible_users",
    Base.metadata,
    Column("project_id", Integer, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)


class Project(Base, TimestampMixin):
    __tablename__ = "projects"

    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    visibility = Column(Enum(Visibility), nullable=False, default=Visibility.ALL)
    map_mode = Column(Enum(MapMode), nullable=False, default=MapMode.AUTO)
    creator_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    creator = relationship("User", back_populates="projects")
    participants = relationship("User", secondary=project_participants, backref="participating_projects")
    visible_users = relationship("User", secondary=project_visible_users, backref="visible_projects")
    places = relationship("ProjectPlace", back_populates="project", cascade="all, delete-orphan")
    trips = relationship("TripProject", back_populates="project", cascade="all, delete-orphan")


class ProjectPlace(Base):
    __tablename__ = "project_places"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    place_id = Column(Integer, ForeignKey("places.id", ondelete="CASCADE"), nullable=False, index=True)
    added_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    added_at = Column(DateTime(timezone=True), nullable=False)
    is_unmarked = Column(Boolean, nullable=False, default=False)

    project = relationship("Project", back_populates="places")
    place = relationship("Place", back_populates="projects")
