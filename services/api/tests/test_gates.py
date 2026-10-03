from __future__ import annotations


def test_list_gates(client, auth_headers):
    response = client.get("/gates", headers=auth_headers)
    assert response.status_code == 200
    gates = response.json()["gates"]
    assert "power_off_confirmed" in gates
    assert gates["power_off_confirmed"]["ur"]


def test_gates_require_auth(client):
    assert client.get("/gates").status_code == 401
