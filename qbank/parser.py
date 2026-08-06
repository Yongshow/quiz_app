# -*- coding: utf-8 -*-
"""
题库解析器（共享模块）

从 Word(docx) 题库中解析出统一结构的题目：

选择题:
    [
        {id: 1, type: "单选", question: "题干", options: ["A选项", ...], answer: "A"},
        ...
    ]
判断题:
    [
        {id: 1, type: "判断", question: "题干", options: ["√", "×"], answer: "√"},
        ...
    ]
"""
from __future__ import annotations
import re
from typing import List, Dict
from docx import Document

ANS_LETTER = re.compile(r"[（(]\s*([A-Da-d])\s*[）)]")
ANS_JD = re.compile(r"[（(]\s*([√×✓])\s*[）)]")
OPT_LINE = re.compile(r"^\s*(?:[（(][A-Da-d][）)]|[A-Da-d][、.．])")
SECTION_HEAD = re.compile(
    r"^\s*[一二三四五六七八九十]+\s*[、．.．]?\s*"
    r"(选择|单项选择|多项选择|判断题|选择题|填空题|简答题|问答题)?\s*"
    r"(题|选择|判断|填空|简答|问答)?\s*$"
)
_JUDGE_HEAD = re.compile(r"^\s*[一二三四五六七八九十]+\s*[、．.．]?\s*判断题?\s*$")


def _fw(s: str) -> str:
    return "".join(chr(ord(c) - 0xFEE0) if 0xFF21 <= ord(c) <= 0xFF3A else c for c in s)


def _paragraphs(path: str) -> List[str]:
    doc = Document(path)
    return [p.text.strip() for p in doc.paragraphs if p.text.strip()]


def _is_section_header(text: str) -> bool:
    if SECTION_HEAD.match(text) and len(text) <= 30:
        return True
    if re.match(r"^共\s*\d+\s*题", text):
        return True
    return False


# ================= 选择题 =================
def parse_selection(path: str) -> List[Dict]:
    ps = _paragraphs(path)
    questions: List[Dict] = []
    cur_stem = None
    cur_opts: List[str] = []

    def flush():
        nonlocal cur_stem, cur_opts
        if cur_stem is None:
            return
        m = ANS_LETTER.search(cur_stem)
        if m:
            answer = m.group(1).upper()
            # 保留填空位置的括号空位（原题中为强度答案标记，如 (   C  )）
            question = (cur_stem[: m.start()] + "(    )" + cur_stem[m.end():]).strip()
            opts = _extract_options("\n".join(cur_opts))
            questions.append({
                "id": len(questions) + 1, "type": "单选",
                "question": question, "options": opts, "answer": answer,
            })
        cur_stem = None
        cur_opts = []

    for para in ps:
        if _is_section_header(para) or _CHOICE_HEAD.match(para):
            continue
        has_marker = bool(ANS_LETTER.search(para))
        is_opt_line = bool(OPT_LINE.match(para))
        if has_marker and not is_opt_line:
            flush()
            cur_stem = para
            cur_opts = []
        elif cur_stem is not None:
            cur_opts.append(para)
    flush()
    return questions


_CHOICE_HEAD = re.compile(
    r"^\s*[一二三四五六七八九十]+\s*[、．.．]?\s*"
    r"(选择|单项选择|多项选择|选择题)?\s*(题|选择)?\s*$"
)


def _extract_options(text: str) -> List[str]:
    text = re.sub(r"\s+", " ", _fw(text)).strip()
    if not text:
        return ["", "", "", ""]
    LABEL = re.compile(r"[（(]\s*([A-Da-d])\s*[）)]|([A-Da-d])[、.．]")
    matches = list(LABEL.finditer(text))
    if not matches:
        return ["", "", "", ""]
    opts: Dict[str, str] = {}
    for idx, m in enumerate(matches):
        letter = (m.group(1) or m.group(2)).upper()
        start = m.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        piece = text[start:end]
        piece = re.sub(r"^[；;，,。.\s]+", "", piece)
        piece = re.sub(r"[；;，,。\s]+$", "", piece)
        opts[letter] = piece
    return [opts.get(l, "") for l in "ABCD"]


# ================= 判断题 =================
def parse_judge(path: str) -> List[Dict]:
    ps = _paragraphs(path)
    questions: List[Dict] = []
    for para in ps:
        if _is_section_header(para) or _JUDGE_HEAD.match(para):
            continue
        m = ANS_JD.search(para)
        if not m:
            continue
        ch = m.group(1)
        answer = "√" if ch in ("√", "✓") else "×"
        question = (para[: m.start()] + " " + para[m.end():]).strip()
        question = re.sub(r"[；;。\s]+$", "", question)
        questions.append({
            "id": len(questions) + 1, "type": "判断",
            "question": question, "options": ["√", "×"], "answer": answer,
        })
    return questions


def parse_docx(path: str) -> Dict:
    if "判断" in path:
        return {"type": "判断", "source": path, "items": parse_judge(path)}
    return {"type": "单选", "source": path, "items": parse_selection(path)}
