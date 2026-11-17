import os

from smarvii_worker.config import load_dotenv


def test_dotenv_sets_missing_and_keeps_existing(tmp_path, monkeypatch):
    f = tmp_path / ".env"
    f.write_text("# comment\nSMV_A=1\nSMV_B='two'\nSMV_EMPTY=\nnot a line\n")
    monkeypatch.setenv("SMV_B", "kept")
    monkeypatch.delenv("SMV_A", raising=False)
    load_dotenv(str(f))
    assert os.environ["SMV_A"] == "1"
    assert os.environ["SMV_B"] == "kept"
    assert os.environ["SMV_EMPTY"] == ""
    for k in ("SMV_A", "SMV_EMPTY"):
        os.environ.pop(k, None)


def test_missing_file_is_ignored(tmp_path):
    load_dotenv(str(tmp_path / "nope.env"))
