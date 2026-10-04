# -*- coding: utf-8 -*-
"""
生成“纯前端静态版”所需的全部题库数据。

用法:
    cd /home/yong/Python_test/quiz_app
    source ../myenv/bin/activate
    python scripts/build_static.py

输出:
    static_version/data/banks.json            # 题库索引（前端用于选择题库）
    static_version/data/pv_professional.json  # 题库一：光伏专业题库（xls）
    static_version/data/pv_all.json           # 题库二：光伏汇总全部（docx）
    static_version/data/media/pv_all/*        # 题库二的图片
"""
from __future__ import annotations

import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

from qbank.parser import TYPE_ORDER as XLS_TYPE_ORDER, parse_xls  # noqa: E402
from qbank.docx_parser import parse_all  # noqa: E402

DATA_DIR = os.path.join(ROOT, "data")
OUT_DIR = os.path.join(ROOT, "static_version", "data")

XLS_PATH = os.path.join(DATA_DIR, "光伏专业题库.xls")
DOCX_PATH = os.path.join(DATA_DIR, "光伏汇总全部.docx")

DOCX_TYPE_ORDER = ["单选", "多选", "判断", "填空", "简答", "论述", "名词解释", "计算", "绘图"]


def _meta(items, title, description, counts=None):
    counts = counts or {}
    if not counts:
        for q in items:
            counts[q["type"]] = counts.get(q["type"], 0) + 1
    present = [t for t in DOCX_TYPE_ORDER if counts.get(t)]
    return {
        "title": title,
        "description": description,
        "total": len(items),
        "counts": counts,
        "types": present,
        "chapters": sorted({q["chapter"] for q in items if q.get("chapter")}),
        "difficulties": [d for d in ("容易", "中等", "困难")
                         if any(q.get("difficulty") == d for q in items)],
        "generated_by": "scripts/build_static.py",
    }


def _write_bank(fname, items, meta):
    payload = {"meta": meta, "items": items}
    path = os.path.join(OUT_DIR, fname)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    return meta


def build_pv_professional():
    parsed = parse_xls(XLS_PATH)
    items, counts = parsed["items"], parsed["counts"]
    meta = _meta(items, "光伏专业题库", "由 data/光伏专业题库.xls 自动生成", counts)
    meta["types"] = [t for t in XLS_TYPE_ORDER if counts.get(t)]
    _write_bank("pv_professional.json", items, meta)
    return "pv_professional", meta


def _norm(s: str) -> str:
    """题干归一化，用于同一题库内查重。"""
    s = re.sub(r"\s+", "", s or "")
    s = re.sub(r"[，。、；：？！,.;:?!\"'“”‘’（）()《》〈〉]+", "", s)
    return s


def build_pv_all():
    parsed = parse_all(DOCX_PATH)
    # 同题库内去重：优先保留 Part A，移除 Part B 中重复的题目
    seen = set()
    items = []
    for it in parsed["partA"] + parsed["partB"]:
        key = (it["type"], _norm(it["question"]))
        if key in seen:
            continue
        seen.add(key)
        items.append(it)
    for i, it in enumerate(items, 1):
        it["id"] = i

    # 落盘图片
    media_dir = os.path.join(OUT_DIR, "media", "pv_all")
    if os.path.isdir(media_dir):
        shutil.rmtree(media_dir)
    os.makedirs(media_dir, exist_ok=True)
    for fname, blob in parsed["images"].items():
        with open(os.path.join(media_dir, fname), "wb") as f:
            f.write(blob)

    meta = _meta(items, "光伏汇总全部", "由 data/光伏汇总全部.docx 自动生成")
    meta["mediaDir"] = "media/pv_all"
    _write_bank("pv_all.json", items, meta)
    return "pv_all", meta, parsed["warnings"]


def main() -> None:
    if not os.path.exists(XLS_PATH):
        raise SystemExit(f"未找到: {XLS_PATH}")
    if not os.path.exists(DOCX_PATH):
        raise SystemExit(f"未找到: {DOCX_PATH}")

    os.makedirs(OUT_DIR, exist_ok=True)
    if os.path.exists(os.path.join(OUT_DIR, "questions.json")):
        os.remove(os.path.join(OUT_DIR, "questions.json"))

    id1, m1 = build_pv_professional()
    id2, m2, warnings = build_pv_all()

    banks = [
        {"id": id1, "name": m1["title"], "file": "pv_professional.json",
         "description": m1["description"], "total": m1["total"],
         "counts": m1["counts"], "types": m1["types"]},
        {"id": id2, "name": m2["title"], "file": "pv_all.json",
         "description": m2["description"], "total": m2["total"],
         "counts": m2["counts"], "types": m2["types"]},
    ]
    with open(os.path.join(OUT_DIR, "banks.json"), "w", encoding="utf-8") as f:
        json.dump({"banks": banks}, f, ensure_ascii=False, indent=1)

    print("已生成题库索引: data/banks.json")
    for b in banks:
        detail = "  ".join(f"{t}:{b['counts'].get(t, 0)}" for t in b["types"])
        print(f"  [{b['id']}] {b['name']}  共 {b['total']} 题  ({detail})")
    if warnings:
        print(f"  提示: pv_all 解析告警 {len(warnings)} 条（多为原题缺答案）")


if __name__ == "__main__":
    main()