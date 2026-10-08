# -*- coding: utf-8 -*-
"""
Word(docx) 题库解析器 —— 用于《光伏笔试题库.docx》

文档为“光伏设备运维生产人员岗位能力认证实操笔试题库”，题目以
「【B{岗位}-2-{序号}】题干」编号，答案紧随其后（以“答：”开头）。
按岗位分为三级：

    一、一级生产岗位能力   （B1）
    二、二级生产岗位能力   （B2）
    三、三级生产岗位能力   （B3）

输出字段：
    id / type / code / chapter / difficulty / question / answer
    images / answerImages  —— 题图与答案图（文件名，由 build 脚本落盘）

题型自动识别：题干含计算类关键词则记为「计算」，否则记为「简答」。
"""
from __future__ import annotations

import re
from typing import Dict, List, Tuple

from docx import Document

from qbank.docx_parser import (
    _clean_text, _collect_images, _para_rids, _para_text, mathify,
)

# 题号：一/二/三级生产岗位能力（形如 B1-2-0001）
_MARK = re.compile(r"^【\s*(B\d+-\d+-\d+)\s*】\s*(.*)$")
# 答案起始行：“答：”“答:”“答 ：”
_ANSWER = re.compile(r"^答\s*[：:]")
# 计算类关键词（“求”需排除 要求 / 需求 / 请求 / 诉求）
_CALC = re.compile(r"(计算|试求|求出|试分析|试算|预算|多少|几块|几台|几路|几串|几根|偏差|利用小时|运行指标|上网电量|(?<![要需请诉])求)")

_LEVEL_MAP = {
    "B1": "一级生产岗位能力",
    "B2": "二级生产岗位能力",
    "B3": "三级生产岗位能力",
    "B4": "四级生产岗位能力",
    "B5": "五级生产岗位能力",
}


def _join(lines: List[str]) -> str:
    return "\n".join(x for x in (ln.strip() for ln in lines) if x)


def parse_bishi(path: str) -> Dict:
    """解析《光伏笔试题库.docx》，返回 {"items", "images", "warnings"}。"""
    doc = Document(path)
    lines: List[Tuple[str, List[str]]] = [
        (_clean_text(_para_text(p)), _para_rids(p)) for p in doc.paragraphs
    ]
    blobs, rid_map = _collect_images(doc, path)

    # 定位所有题号段落
    marks = []
    for i, (t, _r) in enumerate(lines):
        m = _MARK.match(t)
        if m:
            marks.append((i, m.group(1), m.group(2).strip()))

    items: List[Dict] = []
    warnings: List[str] = []
    for k, (i, code, head) in enumerate(marks):
        end = marks[k + 1][0] if k + 1 < len(marks) else len(lines)
        seg = lines[i:end]

        # 以“答：”行为界，前为题面、后为答案
        aidx = None
        for j, (t, _r) in enumerate(seg):
            if _ANSWER.match(t):
                aidx = j
                break

        before = seg if aidx is None else seg[:aidx]
        after = [] if aidx is None else seg[aidx:]

        q_parts: List[str] = [head]
        q_images: List[str] = []
        for idx, (t, rids) in enumerate(before):
            if idx > 0:  # 第 0 段即题号段，题干已取 head
                q_parts.append(_clean_text(t))
            q_images.extend(rid_map[r] for r in rids if r in rid_map)
        question = _join(q_parts)

        a_parts: List[str] = []
        a_images: List[str] = []
        for idx, (t, rids) in enumerate(after):
            if idx == 0:
                t = _ANSWER.sub("", t, count=1).strip()
            a_parts.append(_clean_text(t))
            a_images.extend(rid_map[r] for r in rids if r in rid_map)
        answer = _join(a_parts)

        q_images = list(dict.fromkeys(q_images))
        a_images = list(dict.fromkeys(a_images))

        qtype = "计算" if _CALC.search(question) else "简答"
        level = code.split("-", 1)[0]
        item: Dict = {
            "type": qtype,
            "code": code,
            "chapter": _LEVEL_MAP.get(level, level),
            "difficulty": "",
            "question": mathify(question),
            "answer": mathify(answer),
        }
        if q_images:
            item["images"] = q_images
        if a_images:
            item["answerImages"] = a_images
        if not answer and not a_images:
            item["answerMissing"] = True
            warnings.append(f"{code} 缺少答案")
        items.append(item)

    for i, it in enumerate(items, 1):
        it["id"] = i
    return {"items": items, "images": blobs, "warnings": warnings}