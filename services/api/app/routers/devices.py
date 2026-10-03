from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import AuthedUser, get_current_user
from app.dependencies import get_device_store
from app.models import Device, DeviceCreateRequest, DeviceListResponse
from app.services.device_store import DeviceStore

router = APIRouter()


@router.get("/devices", response_model=DeviceListResponse)
def list_devices(
    user: AuthedUser = Depends(get_current_user),
    store: DeviceStore = Depends(get_device_store),
) -> DeviceListResponse:
    return DeviceListResponse(devices=store.list_devices(user.uid))


@router.post("/devices", response_model=Device, status_code=201)
def create_device(
    body: DeviceCreateRequest,
    user: AuthedUser = Depends(get_current_user),
    store: DeviceStore = Depends(get_device_store),
) -> Device:
    return store.create_device(user.uid, body)
