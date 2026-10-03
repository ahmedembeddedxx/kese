from __future__ import annotations


def test_missing_auth_header_is_401(client):
    response = client.get("/devices")
    assert response.status_code == 401


def test_dev_token_accepted_in_test_env(client, auth_headers):
    response = client.get("/devices", headers=auth_headers)
    assert response.status_code == 200


def test_dev_token_empty_uid_is_401(client):
    response = client.get("/devices", headers={"Authorization": "Bearer dev:"})
    assert response.status_code == 401


def test_garbage_bearer_token_is_401(client):
    response = client.get("/devices", headers={"Authorization": "Bearer not-a-real-token"})
    assert response.status_code == 401
