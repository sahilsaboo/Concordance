import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from concordance_pipeline.schema import ClaimMatrix

SAMPLE = Path(__file__).resolve().parents[2] / "data" / "sample_matrix.json"


def load_sample() -> dict:
    return json.loads(SAMPLE.read_text())


def test_sample_matrix_validates():
    matrix = ClaimMatrix.model_validate(load_sample())
    assert matrix.meta.is_sample
    assert len(matrix.options) == 4


def test_rejects_claim_with_unknown_source():
    data = load_sample()
    data["claims"][0]["source_id"] = "does_not_exist"
    with pytest.raises(ValidationError, match="unknown source"):
        ClaimMatrix.model_validate(data)


def test_rejects_rating_out_of_range():
    data = load_sample()
    data["claims"][0]["ratings"]["bias"] = 1.5
    with pytest.raises(ValidationError):
        ClaimMatrix.model_validate(data)
