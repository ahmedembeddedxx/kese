from __future__ import annotations


def test_list_all_playbooks(client, auth_headers):
    response = client.get("/playbooks", headers=auth_headers)
    assert response.status_code == 200
    ids = [p["id"] for p in response.json()["playbooks"]]
    assert "fan-capacitor-replace" in ids


def test_list_playbooks_filtered_by_category(client, auth_headers):
    response = client.get("/playbooks", params={"category": "ac"}, headers=auth_headers)
    assert response.status_code == 200
    for p in response.json()["playbooks"]:
        assert p["category"] == "ac"


def test_get_playbook_detail(client, auth_headers):
    response = client.get("/playbooks/fan-capacitor-replace", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["steps"][0]["gate"] == "power_off_confirmed"
    assert len(body["steps"]) >= 2


def test_get_unknown_playbook_is_404(client, auth_headers):
    response = client.get("/playbooks/does-not-exist", headers=auth_headers)
    assert response.status_code == 404


def test_playbooks_require_auth(client):
    assert client.get("/playbooks").status_code == 401
    assert client.get("/playbooks/fan-capacitor-replace").status_code == 401
