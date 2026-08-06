# -*- coding: utf-8 -*-
"""
背题·答题系统 —— Flask 后端高级版

功能:
    * 启动本地 Web 服务，手机/电脑通过浏览器访问（同一局域网可访问）
    * 提供与静态版一致的前端页面
    * 网页上传新的 Word(docx) 题库 -> 自动解析 -> 合并进题库并生效

用法:
    cd /home/yong/Python_test/quiz_app
    source ../myenv/bin/activate
    python server/app.py
    然后手机/电脑浏览器打开 http://<本机IP>:5000
"""
from __future__ import annotations

import json
import os
import re
import sys
import tempfile
import time

from flask import Flask, jsonify, render_template, request

# ---------- 路径 ----------
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)            # quiz_app/
sys.path.insert(0, ROOT)
STATIC_DIR = os.path.join(ROOT, "static_version")
TEMPLATE_DIR = os.path.join(HERE, "templates")
UPLOAD_DIR = os.path.join(HERE, "uploads")
DATA_JSON = os.path.join(STATIC_DIR, "data", "questions.json")

from qbank.parser import parse_docx  # noqa: E402

os.makedirs(UPLOAD_DIR, exist_ok=True)

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="",
            template_folder=TEMPLATE_DIR)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50MB


# ---------- 题库合并工具 ----------
def _load_bank():
    if os.path.exists(DATA_JSON):
        with open(DATA_JSON, encoding="utf-8") as f:
            return json.load(f)
    return {"meta": {"total": 0, "choice": 0, "judge": 0}, "items": []}


def _save_bank(payload):
    os.makedirs(os.path.dirname(DATA_JSON), exist_ok=True)
    tmp = DATA_JSON + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    os.replace(tmp, DATA_JSON)


def _merge(new_items, items=None):
    """按 (题型, 题干) 去重合并，返回 (合并后的列表, 新增数量)。"""
    bank = _load_bank() if items is None else items
    existing = bank["items"]
    seen = {(q["type"], q["question"]) for q in existing}
    added = 0
    for q in new_items:
        key = (q["type"], q["question"])
        if key in seen:
            continue
        seen.add(key)
        q["id"] = len(existing) + added + 1
        existing.append(q)
        added += 1
    return existing, added


# ---------- 页面 ----------
@app.route("/")
def index():
    return app.send_static_file("index.html")


# ---------- 管理/上传页 ----------
@app.route("/manage")
def manage():
    return render_template("manage.html")


# ---------- 上传接口 ----------
@app.route("/api/upload", methods=["POST"])
def upload():
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify({"ok": False, "error": "未选择文件"})
    if not f.filename.lower().endswith(".docx"):
        return jsonify({"ok": False, "error": "仅支持 .docx 文件"})

    # 保存临时文件并解析
    path = os.path.join(tempfile.gettempdir(), f.filename)
    f.save(path)
    try:
        parsed = parse_docx(path)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"ok": False, "error": f"解析失败: {exc}"})

    new_items = parsed["items"]
    bank = _load_bank()
    merged, added = _merge(new_items, items=bank)

    # 更新元信息
    choice = sum(1 for q in merged if q["type"] == "单选")
    judge = sum(1 for q in merged if q["type"] == "判断")
    bank["meta"] = {
        "title": "技师考试题库（含上传）",
        "total": len(merged),
        "choice": choice,
        "judge": judge,
        "last_upload": f.filename,
    }
    bank["items"] = merged
    _save_bank(bank)

    return jsonify({
        "ok": True,
        "文件名": f.filename,
        "识别题型": parsed["type"],
        "新解析题目": len(new_items),
        "本次新增": added,
        "题库总数": len(merged),
    })


@app.route("/api/stats")
def stats():
    bank = _load_bank()
    return jsonify(bank["meta"])


# ---------- 跨设备进度同步 ----------
# 每个“同步码”对应一份云端进度快照（错题本 + 最佳成绩），存于 server/sync/
SYNC_DIR = os.path.join(HERE, "sync")
os.makedirs(SYNC_DIR, exist_ok=True)


def _safe_code(code: str) -> str | None:
    """校验同步码，防止路径穿越。仅允许字母/数字/下划线/中划线，长度 1-64。"""
    if not code or len(code) > 64:
        return None
    if not re.fullmatch(r"[A-Za-z0-9_\-]+", code):
        return None
    return code


def _sync_path(code: str) -> str:
    return os.path.join(SYNC_DIR, code + ".json")


@app.route("/api/ping")
def ping():
    """前端用于检测当前是否运行在后端版（静态版无此接口）。"""
    return jsonify({"ok": True, "server": "quiz_app"})


@app.route("/api/sync/<code>", methods=["GET"])
def sync_get(code: str):
    code = _safe_code(code)
    if not code:
        return jsonify({"ok": False, "error": "同步码不合法（仅限字母/数字/下划线/中划线，≤64位）"}), 400
    path = _sync_path(code)
    if not os.path.exists(path):
        return jsonify({"ok": False, "error": "该同步码尚无云端数据"}), 404
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return jsonify({"ok": True, "data": data})


@app.route("/api/sync/<code>", methods=["POST"])
def sync_post(code: str):
    code = _safe_code(code)
    if not code:
        return jsonify({"ok": False, "error": "同步码不合法（仅限字母/数字/下划线/中划线，≤64位）"}), 400
    payload = request.get_json(silent=True) or {}
    if payload.get("kind") != "quiz_app_progress":
        return jsonify({"ok": False, "error": "数据格式不正确"}), 400

    # 与云端已有数据合并（错题按题干去重，bestPct 取较大值）
    path = _sync_path(code)
    old = {}
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                old = json.load(f)
        except Exception:  # noqa: BLE001
            old = {}

    old_wrong = old.get("wrongbook") or []
    new_wrong = payload.get("wrongbook") or []
    merged = {q.get("question"): q for q in old_wrong if isinstance(q, dict) and q.get("question")}
    for q in new_wrong:
        if isinstance(q, dict) and q.get("question"):
            merged[q["question"]] = q

    try:
        best = max(int(old.get("bestPct") or 0), int(payload.get("bestPct") or 0))
    except (TypeError, ValueError):
        best = 0

    data = {
        "kind": "quiz_app_progress",
        "version": 1,
        "bestPct": str(best),
        "wrongbook": list(merged.values()),
        "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }

    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)

    return jsonify({"ok": True, "data": data, "错题数": len(data["wrongbook"])})


# ---------- 启动 ----------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print("=" * 50)
    print("背题·答题系统 已启动")
    print(f"  本机访问:   http://127.0.0.1:{port}")
    print("  手机访问:   使用同一 Wi-Fi，打开 http://<本机IP>:%d" % port)
    print("  上传题库:   http://<本机IP>:%d/manage" % port)
    print("=" * 50)
    app.run(host="0.0.0.0", port=port, debug=False)
