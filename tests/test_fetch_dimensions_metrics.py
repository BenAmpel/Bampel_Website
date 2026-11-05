# scripts/fetch_dimensions_metrics.py: DOI selection and the merge rules (no network).
# Run: python3 -m unittest tests/test_fetch_dimensions_metrics.py
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import fetch_dimensions_metrics as fdm  # noqa: E402

NOW = datetime(2026, 11, 2, 9, 0, 0, tzinfo=timezone.utc)


def stamp(days_ago):
    return (NOW - timedelta(days=days_ago)).strftime(fdm.TS_FMT)


class SelectDois(unittest.TestCase):
    def test_drops_junk_keys(self):
        self.assertEqual(fdm.select_dois({"'": "a", '"': "b", "": "c", "not-a-doi": "d"}), [])

    def test_lowercases_and_dedupes(self):
        got = fdm.select_dois({"10.1109/ISI.2019.8823238": "Sawtooth", " 10.1109/isi.2019.8823238 ": "Sawtooth"})
        self.assertEqual(got, ["10.1109/isi.2019.8823238"])

    def test_drops_arxiv_twin_of_published_paper(self):
        got = fdm.select_dois({"10.48550/arXiv.1": "Same Title: Here", "10.1145/1": "same title here"})
        self.assertEqual(got, ["10.1145/1"])

    def test_keeps_arxiv_without_twin(self):
        self.assertEqual(fdm.select_dois({"10.48550/arXiv.2": "Only preprint"}), ["10.48550/arxiv.2"])

    def test_keeps_two_published_dois_with_same_title(self):
        got = fdm.select_dois({"10.1145/1": "Same", "10.1109/2": "Same"})
        self.assertEqual(got, ["10.1109/2", "10.1145/1"])


class Merge(unittest.TestCase):
    def test_all_present(self):
        out = fdm.merge({}, ["a", "b"], {"a": 3, "b": 4}, NOW)
        self.assertEqual((out["citations_sum"], out["papers_counted"], out["papers_with_doi"]), (7, 2, 2))

    def test_failed_doi_keeps_recent_value(self):
        prev = {"per_doi": {"b": {"times_cited": 9, "fetched_at": stamp(3)}}}
        out = fdm.merge(prev, ["a", "b"], {"a": 1, "b": None}, NOW)
        self.assertEqual(out["per_doi"]["b"], {"times_cited": 9, "fetched_at": stamp(3)})
        self.assertEqual(out["citations_sum"], 10)

    def test_failed_doi_drops_old_value(self):
        prev = {"per_doi": {"b": {"times_cited": 9, "fetched_at": stamp(15)}}}
        out = fdm.merge(prev, ["a", "b"], {"a": 1, "b": None}, NOW)
        self.assertNotIn("b", out["per_doi"])
        self.assertEqual((out["papers_counted"], out["papers_with_doi"]), (1, 2))

    def test_unselected_doi_is_dropped(self):
        prev = {"per_doi": {"gone": {"times_cited": 50, "fetched_at": stamp(1)}}}
        out = fdm.merge(prev, ["a"], {"a": 2}, NOW)
        self.assertEqual(list(out["per_doi"]), ["a"])

    def test_fewer_than_half_returns_none(self):
        self.assertIsNone(fdm.merge({}, ["a", "b", "c"], {"a": 1, "b": None, "c": None}, NOW))

    def test_failed_fetch_never_written_as_zero(self):
        out = fdm.merge({}, ["a", "b"], {"a": 0, "b": None}, NOW)
        self.assertNotIn("b", out["per_doi"])
        self.assertEqual(out["per_doi"]["a"]["times_cited"], 0)  # a real 0 from Dimensions stays

    def test_timestamp_format(self):
        out = fdm.merge({}, ["a"], {"a": 1}, NOW)
        self.assertRegex(out["generated_at"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")


class Main(unittest.TestCase):
    def test_empty_selection_exits_1_and_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "dimensions.json"
            with mock.patch.object(fdm, "load_doi_map", return_value={}):
                self.assertEqual(fdm.main(out), 1)
            self.assertFalse(out.exists())


if __name__ == "__main__":
    unittest.main()
