from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import AuthedUser, get_current_user
from app.gates import get_gates
from app.models import GatesResponse

router = APIRouter()


@router.get("/gates", response_model=GatesResponse)
def list_gates(user: AuthedUser = Depends(get_current_user)) -> GatesResponse:
    return GatesResponse(gates=get_gates())
