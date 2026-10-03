from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models import Box2D


def test_box2d_accepts_valid_box():
    box = Box2D(ymin=10, xmin=20, ymax=100, xmax=200)
    assert box.ymax == 100


def test_box2d_rejects_inverted_y():
    with pytest.raises(ValidationError):
        Box2D(ymin=100, xmin=20, ymax=10, xmax=200)


def test_box2d_rejects_inverted_x():
    with pytest.raises(ValidationError):
        Box2D(ymin=10, xmin=200, ymax=100, xmax=20)


def test_box2d_rejects_out_of_range():
    with pytest.raises(ValidationError):
        Box2D(ymin=-5, xmin=20, ymax=100, xmax=200)
    with pytest.raises(ValidationError):
        Box2D(ymin=10, xmin=20, ymax=1001, xmax=200)
