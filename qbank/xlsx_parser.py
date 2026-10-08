# -*- coding: utf-8 -*-
"""
Excel(.xlsx) 题库解析器 —— 用于《光伏实操题库.xlsx》

该工作簿含 4 个工作表：

    单选     A题型 B编号 C岗位等级 D难度 E题干 F~I 选项A~D J正确答案 K出处
    多选     同上（选项 A~D）
    判断     A题型 B编号 C岗位等级 D难度 E选项A(正确) F选项B(错误) G题干 H答案(A/B) I出处
    设备实操 A序号 B编号 C岗位等级 D分类 E题干 F工器具、设备材料 G检查使用注意事项(评分项)

统一输出字段：
    id / type / chapter / difficulty / question / code
    单选/多选: options, answer
    判断:      options(√,×), answer
    实操:      answer（工器具材料 + 评分项，多行文本）, category
"""
from __future__ import annotations

import re
from typing import Dict, List

from openpyxl import load_workbook

from qbank.docx_parser import mathify

# 岗位等级 -> 可读章节名
LEVEL_MAP = {
    "B1": "一级生产岗位能力",
    "B2": "二级生产岗位能力",
    "B3": "三级生产岗位能力",
    "B4": "四级生产岗位能力",
    "B5": "五级生产岗位能力",
}

# 设备实操分类规范化（原表存在 04/05 误写为“设备操作”）
_CAT_PREFIX = re.compile(r"^[\s\u3000]*\d+\s*")


def _norm_cat(raw: str) -> str:
    """去掉分类开头的 “01/02…” 前缀，得到可读分类名。"""
    s = _CAT_PREFIX.sub("", (raw or "").strip())
    return s.strip()


def _str(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float):
        return str(int(v)) if v.is_integer() else ("%g" % v)
    if isinstance(v, int):
        return str(v)
    return str(v).strip()


def _cell(row, idx: int) -> str:
    if idx < 0 or idx >= len(row):
        return ""
    return _str(row[idx]).strip()


def _cell_text(row, idx: int) -> str:
    """多行文本：保留换行结构，逐行去空白、剔除空行。"""
    raw = _cell(row, idx).replace("\r\n", "\n").replace("\r", "\n")
    lines = [ln.strip() for ln in raw.split("\n")]
    return "\n".join(ln for ln in lines if ln)


def _difficulty(raw: str) -> str:
    s = (raw or "").strip()
    if s in ("容易", "中等", "困难"):
        return s
    # 兼容“易/较易/较难/难”写法
    if s in ("易", "较易"):
        return "容易"
    if s in ("较难", "难"):
        return "困难"
    return s


def _parse_single(rows) -> List[Dict]:
    out: List[Dict] = []
    for row in rows:
        q = _cell(row, 4)  # E 题干
        ans = _cell(row, 9).upper()  # J 正确答案
        if not q or ans not in ("A", "B", "C", "D"):
            continue
        out.append({
            "type": "单选",
            "code": _cell(row, 1),
            "chapter": LEVEL_MAP.get(_cell(row, 2), _cell(row, 2)),
            "difficulty": _difficulty(_cell(row, 3)),
            "question": mathify(q),
            "options": [mathify(_cell(row, c)) for c in (5, 6, 7, 8)],
            "answer": ans,
        })
    return out


def _parse_multi(rows) -> List[Dict]:
    out: List[Dict] = []
    for row in rows:
        q = _cell(row, 4)  # E 题干
        ans = "".join(sorted(set(_cell(row, 9).upper()) & set("ABCD")))  # J
        if not q or not ans:
            continue
        out.append({
            "type": "多选",
            "code": _cell(row, 1),
            "chapter": LEVEL_MAP.get(_cell(row, 2), _cell(row, 2)),
            "difficulty": _difficulty(_cell(row, 3)),
            "question": mathify(q),
            "options": [mathify(_cell(row, c)) for c in (5, 6, 7, 8)],
            "answer": ans,
        })
    return out


def _parse_judge(rows) -> List[Dict]:
    out: List[Dict] = []
    for row in rows:
        q = _cell(row, 6)  # G 题干
        raw = _cell(row, 7).upper()  # H 答案(A=正确, B=错误)
        if not q:
            continue
        if raw in ("A", "对", "正确", "√"):
            ans = "√"
        elif raw in ("B", "错", "错误", "×"):
            ans = "×"
        else:
            continue
        out.append({
            "type": "判断",
            "code": _cell(row, 1),
            "chapter": LEVEL_MAP.get(_cell(row, 2), _cell(row, 2)),
            "difficulty": _difficulty(_cell(row, 3)),
            "question": mathify(q),
            "options": ["√", "×"],
            "answer": ans,
        })
    return out


def _parse_practice(rows) -> List[Dict]:
    out: List[Dict] = []
    for row in rows:
        q = _cell(row, 4)  # E 题干
        if not q:
            continue
        tools = _cell_text(row, 5)  # F 工器具、设备材料
        score = _cell_text(row, 6)  # G 检查使用注意事项（评分项）
        parts = []
        if tools:
            parts.append("【工器具、设备材料】\n" + mathify(tools))
        if score:
            parts.append("【检查使用注意事项（评分项）】\n" + mathify(score))
        item: Dict = {
            "type": "实操",
            "code": _cell(row, 1),
            "chapter": _norm_cat(_cell(row, 3)),
            "difficulty": "",
            "question": mathify(q),
            "answer": "\n\n".join(parts),
        }
        level = _cell(row, 2)
        if level:
            item["level"] = LEVEL_MAP.get(level, level)
        out.append(item)
    return out


def parse_xlsx(path: str) -> Dict:
    """解析《光伏实操题库.xlsx》，返回 {"items": [...], "counts": {题型: 数量}}。"""
    wb = load_workbook(path, data_only=True, read_only=True)
    items: List[Dict] = []
    counts: Dict[str, int] = {}

    def sheet_rows(name: str):
        if name not in wb.sheetnames:
            return []
        ws = wb[name]
        rows = list(ws.iter_rows(values_only=True))
        return rows[1:] if rows else []  # 跳过表头

    groups = [
        ("单选", _parse_single),
        ("多选", _parse_multi),
        ("判断", _parse_judge),
        ("设备实操", _parse_practice),
    ]
    for sheet, parser in groups:
        got = parser(sheet_rows(sheet))
        if got:
            counts[got[0]["type"]] = len(got)
            items.extend(got)

    wb.close()
    for i, q in enumerate(items, 1):
        q["id"] = i
    return {"items": items, "counts": counts}