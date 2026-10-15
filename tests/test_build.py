"""Validate that nested Markdown becomes navigable without code changes."""
import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path


class BuildTest(unittest.TestCase):
    def test_nested_markdown_appears_in_manifest(self):
        source = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp)
            shutil.copytree(source / "web", target / "web")
            shutil.copytree(source / "content", target / "content")
            (target / "scripts").mkdir()
            shutil.copy2(source / "scripts" / "build.py", target / "scripts" / "build.py")
            nested = target / "content" / "Личные дела" / "Отряд" / "Досье.md"
            nested.parent.mkdir()
            nested.write_text("# Проверка\n", encoding="utf-8")
            spec = importlib.util.spec_from_file_location("archive_builder_test", target / "scripts" / "build.py")
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            module.build()
            manifest = json.loads((target / "site" / "manifest.json").read_text(encoding="utf-8"))
            paths = {entry["path"]: entry["type"] for entry in manifest["entries"]}
            self.assertEqual(paths["Личные дела/Отряд"], "dir")
            self.assertEqual(paths["Личные дела/Отряд/Досье.md"], "file")
            file_entry = next(e for e in manifest["entries"] if e["path"] == "Личные дела/Отряд/Досье.md")
            self.assertEqual(file_entry["size"], len("# Проверка\n".encode("utf-8")))
            self.assertEqual((target / "site" / "content" / "Личные дела" / "Отряд" / "Досье.md").read_text(encoding="utf-8"), "# Проверка\n")


if __name__ == "__main__":
    unittest.main()
