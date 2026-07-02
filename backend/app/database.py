from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.config import settings

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_timeout=15,
    pool_recycle=1800,
    pool_reset_on_return="rollback",
    connect_args={"connect_timeout": 8},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_postgis(db: Session) -> None:
    db.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
    db.commit()
