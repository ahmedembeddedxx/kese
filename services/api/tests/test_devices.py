from __future__ import annotations


def test_create_and_list_device(client, auth_headers):
    create = client.post(
        "/devices",
        json={
            "kind": "fan",
            "details": {"brand": "Pak Fan", "size_inch": "56"},
            "nickname": "Bedroom fan",
        },
        headers=auth_headers,
    )
    assert create.status_code == 201
    created = create.json()
    assert created["kind"] == "fan"
    assert created["nickname"] == "Bedroom fan"

    listing = client.get("/devices", headers=auth_headers)
    assert listing.status_code == 200
    devices = listing.json()["devices"]
    assert len(devices) == 1
    assert devices[0]["id"] == created["id"]


def test_devices_are_scoped_per_user(client, fakes):
    client.post(
        "/devices",
        json={"kind": "car", "details": {}},
        headers={"Authorization": "Bearer dev:user-a"},
    )
    listing_b = client.get("/devices", headers={"Authorization": "Bearer dev:user-b"})
    assert listing_b.json()["devices"] == []


def test_create_device_rejects_overlong_detail(client, auth_headers):
    response = client.post(
        "/devices",
        json={"kind": "fan", "details": {"note": "x" * 500}},
        headers=auth_headers,
    )
    assert response.status_code == 422


def test_devices_require_auth(client):
    assert client.get("/devices").status_code == 401
    assert client.post("/devices", json={"kind": "fan", "details": {}}).status_code == 401
