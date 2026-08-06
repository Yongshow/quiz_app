# -*- coding: utf-8 -*-
"""
生成“纯前端静态版”所需的题库 JSON 数据。

用法:
    cd /home/yong/Python_test/quiz_app
    source ../myenv/bin/activate
    python scripts/build_static.py

输出:
    static_version/data/questions.json
"""
from __future__ import annotations

import json
import os
import sys

# 让脚本可独立运行：把项目根目录加入路径
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

from qbank.parser import parse_selection, parse_judge  # noqa: E402

# 原始题库位置（与 data 目录相对该项目）
DATA_DIR = os.path.join(os.path.dirname(ROOT), "data")
CHOICE_DOCX = os.path.join(DATA_DIR, "技师（选择题）.docx")
JUDGE_DOCX = os.path.join(DATA_DIR, "技师（判断题）.docx")

OUT_JSON = os.path.join(ROOT, "static_version", "data", "questions.json")


def main() -> None:
    if not os.path.exists(CHOICE_DOCX) or not os.path.exists(JUDGE_DOCX):
        raise SystemExit(f"未找到原始题库: {CHOICE_DOCX} / {JUDGE_DOCX}")

    choice = parse_selection(CHOICE_DOCX)
    judge = parse_judge(JUDGE_DOCX)

    items = choice + judge
    meta = {
        "title": "技师考试题库",
        "description": "由 data/ 目录下的 Word 题库自动生成",
        "total": len(items),
        "choice": len(choice),
        "judge": len(judge),
        "generated_by": "scripts/build_static.py",
    }

    payload = {"meta": meta, "items": items}

    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)

    print(f"已生成: {OUT_JSON}")
    print(f"  选择题: {len(choice)}  判断题: {len(judge)}  合计: {len(items)}")


if __name__ == "__main__":
    main()
