from __future__ import annotations


def test_record_event(client, auth_headers, fakes):
    response = client.post(
        "/events",
        json={
            "session_id": "sess-1",
            "playbook_id": "fan-capacitor-replace",
            "step_id": "s4",
            "kind": "step_completed",
            "detail": {"ms": 1234},
        },
        headers=auth_headers,
    )
    assert response.status_code == 202
    assert response.json()["accepted"] is True
    assert len(fakes["events"].events) == 1
    uid, payload = fakes["events"].events[0]
    assert uid == "test-user-1"
    assert payload.step_id == "s4"


def test_record_event_requires_auth(client):
    response = client.post(
        "/events", json={"session_id": "sess-1", "kind": "step_completed"}
    )
    assert response.status_code == 401


def test_record_event_rejects_unknown_kind(client, auth_headers):
    response = client.post(
        "/events", json={"session_id": "sess-1", "kind": "not_a_real_kind"}, headers=auth_headers
    )
    assert response.status_code == 422
