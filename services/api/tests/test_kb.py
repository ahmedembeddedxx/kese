from __future__ import annotations

from app.models import KBResult


def test_kb_search_empty_is_honest_zero_results(client, auth_headers, fakes):
    fakes["kb"].next_results = []
    response = client.get("/kb/search", params={"q": "capacitor rating"}, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["results"] == []


def test_kb_search_returns_results(client, auth_headers, fakes):
    fakes["kb"].next_results = [
        KBResult(
            doc_id="d1",
            title="Fan capacitor ratings",
            snippet="Common Pakistani ceiling fans use a 2.5uF capacitor...",
            category="electrical",
            brand="Pak Fan",
            model=None,
            source_url="https://example.com/doc",
            licence="public",
            score=0.87,
        )
    ]
    response = client.get("/kb/search", params={"q": "capacitor rating"}, headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body["results"]) == 1
    assert body["results"][0]["doc_id"] == "d1"


def test_kb_search_unavailable_is_503_not_empty_200(client, auth_headers, fakes):
    fakes["kb"].fail = True
    response = client.get("/kb/search", params={"q": "capacitor rating"}, headers=auth_headers)
    assert response.status_code == 503


def test_kb_search_requires_query_min_length(client, auth_headers):
    response = client.get("/kb/search", params={"q": "a"}, headers=auth_headers)
    assert response.status_code == 422


def test_kb_search_requires_auth(client):
    response = client.get("/kb/search", params={"q": "capacitor rating"})
    assert response.status_code == 401
