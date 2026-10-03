from __future__ import annotations


def test_create_session_general_mode(client, auth_headers):
    response = client.post(
        "/session", json={"category": "general", "language": "en"}, headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["ephemeral_token"] == "fake-ephemeral-token"
    assert body["playbook_id"] is None
    assert "Mend" in body["system_prompt"]


def test_create_session_with_playbook(client, auth_headers):
    response = client.post(
        "/session",
        json={"category": "electrical", "playbook_id": "fan-capacitor-replace", "language": "en"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["playbook_id"] == "fan-capacitor-replace"
    assert "fan-capacitor-replace" in body["system_prompt"]


def test_create_session_unknown_playbook_is_404(client, auth_headers):
    response = client.post(
        "/session",
        json={"category": "electrical", "playbook_id": "does-not-exist", "language": "en"},
        headers=auth_headers,
    )
    assert response.status_code == 404


def test_create_session_playbook_category_mismatch_is_400(client, auth_headers):
    response = client.post(
        "/session",
        json={"category": "ac", "playbook_id": "fan-capacitor-replace", "language": "en"},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_create_session_rejects_bad_category(client, auth_headers):
    response = client.post(
        "/session", json={"category": "plumbing"}, headers=auth_headers
    )
    assert response.status_code == 422


def test_create_session_requires_auth(client):
    response = client.post("/session", json={"category": "general"})
    assert response.status_code == 401


def test_create_session_gemini_failure_is_503(client, auth_headers, fakes):
    fakes["gemini"].fail = True
    response = client.post("/session", json={"category": "general"}, headers=auth_headers)
    assert response.status_code == 503
