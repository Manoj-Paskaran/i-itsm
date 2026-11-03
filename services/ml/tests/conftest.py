import os
from pathlib import Path

import pytest

from itsm_ml.config import Settings


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption("--run-slow", action="store_true", default=False)


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if not config.getoption("--run-slow"):
        for item in items:
            if "slow" in item.keywords:
                item.add_marker(pytest.mark.skip(reason="use --run-slow for model downloads"))


@pytest.fixture(autouse=True)
def isolated_artifacts(tmp_path: "Path", monkeypatch: pytest.MonkeyPatch) -> None:
    for name in os.environ:
        if name.upper().startswith("GEMINI_"):
            monkeypatch.delenv(name, raising=False)
    monkeypatch.setitem(Settings.model_config, "env_file", None)
    monkeypatch.setenv("ARTIFACTS_DIR", str(tmp_path))
