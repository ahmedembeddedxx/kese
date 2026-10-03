from __future__ import annotations

import base64

TINY_JPEG_B64 = base64.b64encode(b"\xff\xd8\xff\xe0fakejpegbytes\xff\xd9").decode("ascii")


def test_detect_happy_path(client, auth_headers):
    response = client.post(
        "/detect",
        json={"image_b64": TINY_JPEG_B64, "targets": ["fan capacitor"]},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["detections"]) == 1
    assert body["detections"][0]["label"] == "fan capacitor"
    assert body["detections"][0]["box_2d"]["ymin"] == 100.0


def test_detect_drops_low_confidence(client, auth_headers, fakes):
    response = client.post(
        "/detect",
        json={"image_b64": TINY_JPEG_B64, "targets": ["fan capacitor"], "min_confidence": 0.99},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["detections"] == []


def test_detect_rejects_bad_base64(client, auth_headers):
    response = client.post(
        "/detect",
        json={"image_b64": "not-base64!!!", "targets": ["fan capacitor"]},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_detect_rejects_empty_targets(client, auth_headers):
    response = client.post(
        "/detect", json={"image_b64": TINY_JPEG_B64, "targets": []}, headers=auth_headers
    )
    assert response.status_code == 422


def test_detect_requires_auth(client):
    response = client.post(
        "/detect", json={"image_b64": TINY_JPEG_B64, "targets": ["fan capacitor"]}
    )
    assert response.status_code == 401


def test_detect_oversized_image_is_413(client, auth_headers, test_settings):
    big_b64 = base64.b64encode(b"x" * (test_settings.max_upload_bytes + 1)).decode("ascii")
    response = client.post(
        "/detect", json={"image_b64": big_b64, "targets": ["fan capacitor"]}, headers=auth_headers
    )
    assert response.status_code in (413, 422)


def test_detect_gemini_failure_is_503(client, auth_headers, fakes):
    fakes["gemini"].fail = True
    response = client.post(
        "/detect",
        json={"image_b64": TINY_JPEG_B64, "targets": ["fan capacitor"]},
        headers=auth_headers,
    )
    assert response.status_code == 503
