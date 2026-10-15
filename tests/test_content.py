"""Checks source-bound lore, the per-character folder layout and dossier structure."""
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"

CHARACTERS = ("Эхо", "Крюгер", "Леший", "Терапевт")
# Structure of an in-universe personnel file. The archive speaks for itself here:
# identification, legal standing, what the man is good for, and HQ's own assessment.
DOSSIER_SECTIONS = (
    "## ИДЕНТИФИКАЦИЯ",
    "## ПРАВОВОЙ СТАТУС",
    "## ПРИГОДНОСТЬ",
    "## ХРОНОЛОГИЯ",
    "## ХАРАКТЕР",
    "## ОЦЕНКА HQ",
    "## ПРИМЕЧАНИЯ",
)
# Words that belong to the platform the group is played on, not to the terminal.
PLATFORM_WORDS = ("квента", "Квента", "игрок", "Игрок", "Синдикат")


class ContentTest(unittest.TestCase):
    def test_dossiers_follow_the_dossier_form(self):
        for name in CHARACTERS:
            text = (CONTENT / "Личные дела" / name / "dossier.md").read_text(encoding="utf-8")
            self.assertIn(f"ФАЙЛ: {name.upper()}", text)
            for section in DOSSIER_SECTIONS:
                self.assertIn(section, text)
            for word in PLATFORM_WORDS:
                self.assertNotIn(word, text)

    def test_character_folders_and_images_are_indexed(self):
        manifest = json.loads((ROOT / "site" / "manifest.json").read_text(encoding="utf-8"))
        paths = {item["path"] for item in manifest["entries"]}
        for name in CHARACTERS:
            self.assertIn(f"Личные дела/{name}", paths)
            self.assertIn(f"Личные дела/{name}/dossier.md", paths)
        # Images carry their own entry type, so the document count stays intact.
        images = [item for item in manifest["entries"] if item["type"] == "image"]
        self.assertTrue(images, "ожидались проиндексированные изображения")
        for item in images:
            self.assertIn("mime", item)
            self.assertIn("size", item)

    def test_chzo_documents_indexed_and_source_not_published(self):
        manifest = json.loads((ROOT / "site" / "manifest.json").read_text(encoding="utf-8"))
        indexed = {item["path"] for item in manifest["entries"] if item["type"] == "file"}
        for stem in ("00 - Предварительный брифинг", "01 - Хронология и инциденты", "02 - Стороны и контакты",
                     "03 - Обозначение и профиль группы"):
            self.assertIn(f"Операции/ЧЗО - вводные материалы/{stem}.md", indexed)
        # Twelve documents: four operations texts, four dossiers, four section READMEs.
        self.assertEqual(len(indexed), 12)
        self.assertTrue((ROOT / "sources" / "ORB-STALKER-RP-lore.md").exists())
        self.assertFalse((ROOT / "site" / "sources").exists())

    def test_briefing_does_not_invent_mission_orders(self):
        brief = (CONTENT / "Операции" / "ЧЗО - вводные материалы" / "00 - Предварительный брифинг.md").read_text(encoding="utf-8")
        for name in CHARACTERS:
            self.assertIn(name, brief)
        self.assertIn("не является приказом", brief)
        self.assertIn("Цель и основание командирования: не определены", brief)


if __name__ == "__main__":
    unittest.main()
