from __future__ import annotations

import base64

TINY_JPEG_B64 = base64.b64encode(b"\xff\xd8\xff\xe0fakejpegbytes\xff\xd9").decode("ascii")


def test_segment_happy_path(client, auth_headers):
    response = client.post(
        "/segment",
        json={"image_b64": TINY_JPEG_B64, "point": {"x": 500, "y": 500}, "hint": "left wire"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["wire_id"].startswith("w-")
    assert len(body["polyline"]) >= 2


def test_segment_failure_is_503(client, auth_headers, fakes):
    fakes["replicate"].fail = True
    response = client.post(
        "/segment",
        json={"image_b64": TINY_JPEG_B64, "point": {"x": 500, "y": 500}},
        headers=auth_headers,
    )
    assert response.status_code == 503


def test_segment_requires_auth(client):
    response = client.post(
        "/segment", json={"image_b64": TINY_JPEG_B64, "point": {"x": 500, "y": 500}}
    )
    assert response.status_code == 401


def test_segment_rejects_out_of_range_point(client, auth_headers):
    response = client.post(
        "/segment",
        json={"image_b64": TINY_JPEG_B64, "point": {"x": 1500, "y": 500}},
        headers=auth_headers,
    )
    assert response.status_code == 422
