"""Regression checks for model integrity across Git and Windows line endings."""

import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import unittest

from src.quantity_model import ModelRegistry, ROOT, activate, version_path


class MetadataIntegrityTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.pointer = json.loads((ROOT / "models/active-model.json").read_bytes())
        self.version = self.pointer["model_version"]
        directory = version_path(self.version, self.root)
        shutil.copytree(version_path(self.version), directory)
        self.metadata = directory / "metadata.json"
        self.lf = self.metadata.read_bytes().replace(b"\r\n", b"\n")

    def write_pointer(self, digest):
        pointer = {**self.pointer, "metadata_sha256": digest}
        (self.root / "active-model.json").write_bytes((json.dumps(pointer, indent=2) + "\n").encode())

    def test_shipped_pointer_matches_git_normalized_metadata(self):
        # Checking only the producer's working-tree bytes missed the release bug.
        self.assertEqual(self.pointer["metadata_sha256"], hashlib.sha256(self.lf).hexdigest())

    def test_lf_and_crlf_checkouts_load_with_current_and_legacy_pointers(self):
        crlf = self.lf.replace(b"\n", b"\r\n")
        for digest_bytes in (self.lf, crlf):
            for checkout_bytes in (self.lf, crlf):
                with self.subTest(legacy=digest_bytes == crlf, windows=checkout_bytes == crlf):
                    self.write_pointer(hashlib.sha256(digest_bytes).hexdigest())
                    self.metadata.write_bytes(checkout_bytes)
                    model, metadata = ModelRegistry(self.root).get()
                    self.assertEqual(model.version, self.version)
                    self.assertFalse(metadata["real_world_accuracy_verified"])

    def test_activation_writes_lf_and_a_portable_digest_without_changing_model(self):
        self.metadata.write_bytes(self.lf.replace(b"\n", b"\r\n"))
        original_metadata = self.metadata.read_bytes()
        artifact = self.metadata.with_name("model.joblib")
        original_artifact = artifact.read_bytes()
        pointer = activate(self.version, self.root)
        self.assertEqual(pointer["metadata_sha256"], hashlib.sha256(self.lf).hexdigest())
        self.assertNotIn(b"\r", (self.root / "active-model.json").read_bytes())
        self.assertEqual(self.metadata.read_bytes(), original_metadata)
        self.assertEqual(artifact.read_bytes(), original_artifact)
        self.metadata.write_bytes(self.lf)
        self.assertEqual(ModelRegistry(self.root).get()[0].version, self.version)

    def test_metadata_changes_are_rejected_for_both_digest_formats(self):
        altered = self.lf.replace(b'"real_world_accuracy_verified": false', b'"real_world_accuracy_verified": true')
        self.assertNotEqual(altered, self.lf)
        for digest_bytes in (self.lf, self.lf.replace(b"\n", b"\r\n")):
            self.write_pointer(hashlib.sha256(digest_bytes).hexdigest())
            for changed in (altered, self.lf + b" ", self.lf + b"\n"):
                with self.subTest(legacy=b"\r" in digest_bytes, changed=changed[-12:]):
                    self.metadata.write_bytes(changed)
                    with self.assertRaisesRegex(ValueError, "Active model metadata integrity failure"):
                        ModelRegistry(self.root).get()

    def test_serialized_model_still_requires_exact_bytes(self):
        self.write_pointer(hashlib.sha256(self.lf).hexdigest())
        self.metadata.write_bytes(self.lf)
        artifact = self.metadata.with_name("model.joblib")
        artifact.write_bytes(artifact.read_bytes() + b"\r\n")
        with self.assertRaisesRegex(ValueError, "Quantity model integrity failure"):
            ModelRegistry(self.root).get()


if __name__ == "__main__":
    unittest.main()
