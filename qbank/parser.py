# -*- coding: utf-8 -*-
"""
题库解析器（共享模块）

读取 Excel(.xls) 题库《光伏专业题库》，按工作表拆分为统一结构的题目列表。

支持的题型（与工作表同名）：
    单选题、多选题、判断题、填空题、简答题、论述题、名词解释

统一字段：
    id          连续编号
    type        题型（单选/多选/判断/填空/简答/论述/名词解释）
    chapter     知识点所在章节
    difficulty  难易度（容易/中等/困难）
    question    题干（已去掉行首序号）

按题型附加字段：
    单选/多选   options: ["A选项", ...]      answer: "B" / "ABCDE"
    判断        options: ["√", "×"]          answer: "√"/"×"
                correctDesc: 当答案为“错”时给出的正确描述
    填空        answers: ["第一空", "第二空", ...]   orderFixed: 各空顺序是否固定
    简答/论述/名词解释   answer: 参考答案（保留换行）
"""
from __future__ import annotations

import re
from typing import Dict, List

import xlrd

# 工作表名 -> 题型名（顺序即前端展示顺序）
SHEET_TYPES = [
    ("单选题", "单选"),
    ("多选题", "多选"),
    ("判断题", "判断"),
    ("填空题", "填空"),
    ("简答题", "简答"),
    ("论述题", "论述"),
    ("名词解释", "名词解释"),
]
TYPE_ORDER = [t for _, t in SHEET_TYPES]

# 行首序号，如 “12.”“3、”“4．”
_NUM_PREFIX = re.compile(r"^[\s\u3000]*[0-9０-９]+\s*[.．、,，:：]\s*")
_SPACES = re.compile(r"[ \t\u3000]+")


def _clean(v) -> str:
    """单行文本：去掉首尾空白、合并中间空白。"""
    if v is None:
        return ""
    if isinstance(v, float):
        return str(int(v)) if v.is_integer() else ("%g" % v)
    if isinstance(v, int):
        return str(v)
    return _SPACES.sub(" ", str(v).strip()).strip()


def _text(v) -> str:
    """多行文本：保留换行结构，逐行去空白、剔除空行。"""
    if v is None:
        return ""
    if isinstance(v, float):
        return str(int(v)) if v.is_integer() else ("%g" % v)
    if isinstance(v, int):
        return str(v)
    raw = str(v).replace("\r\n", "\n").replace("\r", "\n")
    lines = [ln.strip() for ln in raw.split("\n")]
    return "\n".join(ln for ln in lines if ln)


def _stem(v) -> str:
    """题干：清理解析并去掉行首序号。"""
    s = _text(v)
    return _NUM_PREFIX.sub("", s, count=1).strip()


def _cell(sh, r: int, c: int) -> str:
    if c >= sh.ncols:
        return ""
    return _clean(sh.cell_value(r, c))


def _cell_text(sh, r: int, c: int) -> str:
    if c >= sh.ncols:
        return ""
    return _text(sh.cell_value(r, c))


# ================= 各题型解析 =================
def _parse_single(sh) -> List[Dict]:
    """单选题：0序号 1章节 2题干 3-6 A-D 7答案 8难度"""
    out: List[Dict] = []
    for r in range(2, sh.nrows):
        q = _stem(sh.cell_value(r, 2))
        ans = _cell(sh, r, 7).upper()
        if not q or ans not in ("A", "B", "C", "D"):
            continue
        out.append({
            "type": "单选", "chapter": _cell(sh, r, 1), "question": q,
            "options": [_cell(sh, r, c) for c in (3, 4, 5, 6)],
            "answer": ans, "difficulty": _cell(sh, r, 8),
        })
    return out


def _parse_multi(sh) -> List[Dict]:
    """多选题：0序号 1章节 2题干 3-7 A-E 8答案 9难度"""
    out: List[Dict] = []
    for r in range(2, sh.nrows):
        q = _stem(sh.cell_value(r, 2))
        ans = "".join(sorted(set(_cell(sh, r, 8).upper()) & set("ABCDE")))
        if not q or not ans:
            continue
        out.append({
            "type": "多选", "chapter": _cell(sh, r, 1), "question": q,
            "options": [_cell(sh, r, c) for c in range(3, 8)],
            "answer": ans, "difficulty": _cell(sh, r, 9),
        })
    return out


def _parse_judge(sh) -> List[Dict]:
    """判断题：0序号 1章节 2题干 3答案(对/错) 4正确描述 5难度"""
    out: List[Dict] = []
    for r in range(2, sh.nrows):
        q = _stem(sh.cell_value(r, 2))
        raw = _cell(sh, r, 3)
        if not q or not raw:
            continue
        if raw in ("对", "正确", "是", "√"):
            ans = "√"
        elif raw in ("错", "错误", "否", "×"):
            ans = "×"
        else:
            continue
        item = {
            "type": "判断", "chapter": _cell(sh, r, 1), "question": q,
            "options": ["√", "×"], "answer": ans, "difficulty": _cell(sh, r, 5),
        }
        desc = _cell_text(sh, r, 4)
        if ans == "×" and desc:
            item["correctDesc"] = desc
        out.append(item)
    return out


def _parse_fill(sh) -> List[Dict]:
    """填空题：0序号 1章节 2题干 3-6 第1-4空答案 7顺序是否固定 8难度"""
    out: List[Dict] = []
    for r in range(2, sh.nrows):
        q = _stem(sh.cell_value(r, 2))
        answers = [_cell_text(sh, r, c) for c in range(3, 7)]
        answers = [a for a in answers if a]
        if not q or not answers:
            continue
        item = {
            "type": "填空", "chapter": _cell(sh, r, 1), "question": q,
            "answers": answers, "difficulty": _cell(sh, r, 8),
        }
        fixed = _cell(sh, r, 7)
        if len(answers) > 1 and fixed:
            item["orderFixed"] = fixed == "是"
        out.append(item)
    return out


def _parse_qa(sh, qtype: str) -> List[Dict]:
    """简答/论述/名词解释：0序号 1章节 2题干 3答案 4关键词 5解析 6难度"""
    out: List[Dict] = []
    for r in range(2, sh.nrows):
        q = _stem(sh.cell_value(r, 2))
        ans = _cell_text(sh, r, 3)
        if not q or not ans:
            continue
        out.append({
            "type": qtype, "chapter": _cell(sh, r, 1), "question": q,
            "answer": ans, "difficulty": _cell(sh, r, 6),
        })
    return out


_PARSERS = {
    "单选": _parse_single,
    "多选": _parse_multi,
    "判断": _parse_judge,
    "填空": _parse_fill,
    "简答": lambda sh: _parse_qa(sh, "简答"),
    "论述": lambda sh: _parse_qa(sh, "论述"),
    "名词解释": lambda sh: _parse_qa(sh, "名词解释"),
}


def parse_xls(path: str) -> Dict:
    """解析整个 xls 题库，返回 {"items": [...], "counts": {题型: 数量}}。"""
    wb = xlrd.open_workbook(path)
    names = set(wb.sheet_names())
    items: List[Dict] = []
    counts: Dict[str, int] = {}
    for sheet, qtype in SHEET_TYPES:
        if sheet not in names:
            continue
        got = _PARSERS[qtype](wb.sheet_by_name(sheet))
        counts[qtype] = len(got)
        items.extend(got)
    for i, q in enumerate(items, 1):
        q["id"] = i
    return {"items": items, "counts": counts}