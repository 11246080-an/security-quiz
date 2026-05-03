import argparse
import html
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DOCS_DIR = ROOT / "docs"
DEFAULT_OUTPUT = ROOT / "data" / "questions.json"
DEFAULT_ERRORS = ROOT / "data" / "parse_errors.txt"

ANSWER_RE = re.compile(r"^(?:正確答案|答案|Ans(?:wer)?)[：:\s]*[\(（]?\s*([A-Da-d])\s*[\)）]?")
ANSWER_INLINE_RE = re.compile(r"(?:正確答案|答案|Ans(?:wer)?)[：:\s]*[\(（]?\s*([A-Da-d])\s*[\)）]?")
OPTION_MARK_RE = re.compile(r"(?<!\S)(?:[\(（]\s*([A-D])\s*[\)）]|([A-D])\s*[\.、:：])")


def read_docx(path):
    paragraphs = []
    with zipfile.ZipFile(path) as archive:
        xml = archive.read("word/document.xml")
    root = ET.fromstring(xml)
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    for para in root.findall(".//w:body/w:p", ns):
        parts = []
        for node in para.iter():
            tag = node.tag.rsplit("}", 1)[-1]
            if tag == "t" and node.text:
                parts.append(node.text)
            elif tag == "tab":
                parts.append(" ")
            elif tag == "br":
                parts.append("\n")
        text = html.unescape("".join(parts)).strip()
        if text:
            paragraphs.extend(line.strip() for line in text.splitlines() if line.strip())
    return paragraphs


def read_doc(path):
    try:
        import win32com.client  # type: ignore
    except Exception as exc:
        raise RuntimeError(
            ".doc 檔需要安裝 Microsoft Word 與 pywin32 才能轉換；建議另存為 .docx。"
        ) from exc

    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    doc = None
    try:
        doc = word.Documents.Open(str(path.resolve()))
        text = doc.Content.Text
    finally:
        if doc is not None:
            doc.Close(False)
        word.Quit()
    return [line.strip() for line in text.splitlines() if line.strip()]


def extract_lines(path):
    if path.suffix.lower() == ".docx":
        return read_docx(path)
    if path.suffix.lower() == ".doc":
        return read_doc(path)
    return []


def split_options(text):
    matches = list(OPTION_MARK_RE.finditer(text))
    option_matches = [m for m in matches if option_letter(m) in {"A", "B", "C", "D"}]
    if len(option_matches) < 4:
        return None

    options = {}
    for index, match in enumerate(option_matches[:4]):
        letter = option_letter(match)
        start = match.end()
        end = option_matches[index + 1].start() if index < 3 else len(text)
        value = text[start:end].strip(" \t　；;")
        if not value:
            return None
        options[letter] = value
    return options if all(letter in options for letter in "ABCD") else None


def option_letter(match):
    return (match.group(1) or match.group(2)).upper()


def split_single_option(text):
    match = OPTION_MARK_RE.match(text)
    if not match:
        return None
    letter = option_letter(match)
    value = text[match.end() :].strip(" \t　；;")
    if not value:
        return None
    return letter, value


def normalize_answer(line):
    match = ANSWER_RE.search(line.strip())
    return match.group(1).upper() if match else None


def flush_candidate(candidate, questions, errors, chapter, chapter_code, source):
    if not candidate:
        return
    question_lines = candidate.get("question_lines", [])
    options = candidate.get("options")
    answer = candidate.get("answer")
    if question_lines and options and answer in options:
        number = len(questions) + 1
        questions.append(
            {
                "chapter": chapter,
                "question_id": f"{chapter_code}_Q{number:03d}",
                "question": " ".join(question_lines).strip(),
                "option_a": options["A"],
                "option_b": options["B"],
                "option_c": options["C"],
                "option_d": options["D"],
                "answer": answer,
            }
        )
        return

    raw = candidate.get("raw", [])
    if any(raw):
        errors.append(
            {
                "source": source.name,
                "chapter": chapter,
                "reason": "缺少題幹、四個選項或答案",
                "text": "\n".join(raw),
            }
        )


def parse_questions(lines, chapter, chapter_code, source):
    questions = []
    errors = []
    candidate = None

    expanded_lines = []
    for line in lines:
        bullet_parts = [part.strip() for part in re.split(r"[•]\s*", line) if part.strip()]
        expanded_lines.extend(bullet_parts or [line])

    line_index = 0
    while line_index < len(expanded_lines):
        line = expanded_lines[line_index]
        line_index += 1
        clean = re.sub(r"\s+", " ", line).strip()
        if not clean:
            continue

        inline_answer = ANSWER_INLINE_RE.search(clean)
        if inline_answer and inline_answer.start() > 0:
            before = clean[: inline_answer.start()].strip()
            after = clean[inline_answer.start() :].strip()
            if before:
                expanded_lines[line_index:line_index] = [before, after]
                continue

        answer = normalize_answer(clean)
        if answer:
            if candidate is None:
                candidate = {"question_lines": [], "raw": []}
            candidate["answer"] = answer
            candidate["raw"].append(clean)
            flush_candidate(candidate, questions, errors, chapter, chapter_code, source)
            candidate = None
            continue

        options = split_options(clean)
        if options:
            if candidate is None:
                candidate = {"question_lines": [], "raw": []}
            prefix = OPTION_MARK_RE.split(clean, maxsplit=1)[0].strip()
            if prefix:
                candidate["question_lines"].append(prefix)
            candidate["options"] = options
            candidate["raw"].append(clean)
            continue

        single_option = split_single_option(clean)
        if single_option:
            if candidate is None:
                candidate = {"question_lines": [], "raw": []}
            candidate.setdefault("options", {})
            letter, value = single_option
            candidate["options"][letter] = value
            candidate["raw"].append(clean)
            continue

        if candidate and candidate.get("options"):
            errors.append(
                {
                    "source": source.name,
                    "chapter": chapter,
                    "reason": "選項後出現非答案文字",
                    "text": "\n".join(candidate.get("raw", []) + [clean]),
                }
            )
            candidate = None
            continue

        if candidate is None:
            candidate = {"question_lines": [], "raw": []}
        candidate["question_lines"].append(clean)
        candidate["raw"].append(clean)

    flush_candidate(candidate, questions, errors, chapter, chapter_code, source)
    return questions, errors


def natural_doc_sort_key(path):
    name = path.stem
    match = re.match(r"^(\d+)", name)
    if match:
        return (0, int(match.group(1)), name)
    chinese_numbers = {
        "一": 1,
        "二": 2,
        "三": 3,
        "四": 4,
        "五": 5,
        "六": 6,
        "七": 7,
        "八": 8,
        "九": 9,
        "十": 10,
    }
    match = re.match(r"^第([一二三四五六七八九十]+)章", name)
    if match:
        value = match.group(1)
        number = 10 if value == "十" else chinese_numbers.get(value, 999)
        return (1, number, name)
    return (2, 999, name)


def convert(docs_dir, output_path, errors_path):
    docs = sorted(
        [p for p in docs_dir.iterdir() if p.suffix.lower() in {".doc", ".docx"}],
        key=natural_doc_sort_key,
    )
    all_questions = []
    all_errors = []

    for chapter_index, path in enumerate(docs, start=1):
        chapter = path.stem
        chapter_code = f"CH{chapter_index:02d}"
        try:
            lines = extract_lines(path)
            questions, errors = parse_questions(lines, chapter, chapter_code, path)
            all_questions.extend(questions)
            all_errors.extend(errors)
        except Exception as exc:
            all_errors.append(
                {
                    "source": path.name,
                    "chapter": chapter,
                    "reason": str(exc),
                    "text": "",
                }
            )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(all_questions, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    errors_path.parent.mkdir(parents=True, exist_ok=True)
    if all_errors:
        blocks = []
        for index, error in enumerate(all_errors, start=1):
            blocks.append(
                f"[{index}] {error['source']} / {error['chapter']}\n"
                f"原因：{error['reason']}\n"
                f"{error['text']}".strip()
            )
        errors_path.write_text("\n\n---\n\n".join(blocks) + "\n", encoding="utf-8")
    else:
        errors_path.write_text("沒有解析錯誤。\n", encoding="utf-8")

    return len(all_questions), len(all_errors), len(docs)


def main():
    parser = argparse.ArgumentParser(description="Convert Word question banks to JSON.")
    parser.add_argument("--docs", default=DEFAULT_DOCS_DIR, type=Path)
    parser.add_argument("--output", default=DEFAULT_OUTPUT, type=Path)
    parser.add_argument("--errors", default=DEFAULT_ERRORS, type=Path)
    args = parser.parse_args()

    count, error_count, doc_count = convert(args.docs, args.output, args.errors)
    print(f"Converted {count} questions from {doc_count} Word files.")
    print(f"Parse errors: {error_count}")
    print(f"Output: {args.output}")
    print(f"Errors: {args.errors}")
    return 0 if count else 1


if __name__ == "__main__":
    sys.exit(main())
