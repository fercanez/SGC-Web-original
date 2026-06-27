from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.deps import require_permission
from app.auth.permissions import Permission
from app.database import get_db
from app.models import Party
from app.schemas import PartyCreate, PartyRead

router = APIRouter(prefix="/parties", tags=["parties"])


@router.get("", response_model=list[PartyRead])
def list_parties(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _=Depends(require_permission(Permission.PARTIES_READ.value)),
):
    return db.query(Party).offset(skip).limit(limit).all()


@router.get("/{party_id}", response_model=PartyRead)
def get_party(
    party_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permission(Permission.PARTIES_READ.value)),
):
    party = db.get(Party, party_id)
    if not party:
        raise HTTPException(status_code=404, detail="Propietario no encontrado")
    return party


@router.post("", response_model=PartyRead, status_code=201)
def create_party(
    payload: PartyCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(Permission.PARTIES_WRITE.value)),
):
    existing = (
        db.query(Party).filter(Party.document_id == payload.document_id).first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail="Ya existe un registro con ese documento de identidad",
        )
    party = Party(**payload.model_dump())
    db.add(party)
    db.commit()
    db.refresh(party)
    return party
