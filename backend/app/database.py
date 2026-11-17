"""Database connection pool and session dependency for PostgreSQL (SQLAlchemy 2.0)."""

import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


def build_postgres_url() -> URL:
    """Build a safe SQLAlchemy URL using environment variables (never hardcoded secrets)."""
    return URL.create(
        drivername="postgresql+psycopg",
        username=os.getenv("SQL_USER", "simpel_app"),
        password=os.getenv("SQL_PASSWORD", ""),
        host=os.getenv("SQL_HOST", "127.0.0.1"),
        port=int(os.getenv("SQL_PORT", "5432")),
        database=os.getenv("SQL_DB_NAME", "simpel_pintu"),
    )


engine = create_engine(
    build_postgres_url(),
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Base declarative class for all SIMPEL PINTU ORM models."""
    pass


def get_db() -> Generator[Session, None, None]:
    """Yield a transactional SQLAlchemy Session per FastAPI request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
