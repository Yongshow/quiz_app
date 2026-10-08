# -*- coding: utf-8 -*-
"""
Word(docx) 题库解析器 —— 用于《光伏汇总全部.docx》

该文档是一份"多题库汇总"，整体分为两大部分：

Part A（第 0–8136 段）
    规整的 1290 题，格式为「题型+难度+N/1290」，答案以“标准答案”标记。
    题型：单选题 / 判断题 / 简答题 / 论述题 / 计算题 / 绘图题。

Part B（第 8137 段–文末）
    多个分区的杂糅题库，格式多样（填空题、选择题、判断题、简答题、问答题等）。
    本文件目前实现 Part A；Part B 的分区解析在后续迭代中补齐。

统一输出字段：
    id / type / difficulty / question
    单选/多选: options, answer
    判断:      options(√,×), answer, correctDesc(可选)
    填空:      answers, question 中用 {{答案}} 标记需高亮的位置
    简答等:    answer
    任意题型:  images(题图), answerImages(答案图)  —— 值为文件名（由 build 脚本落盘）
"""
from __future__ import annotations

import hashlib
import re
from typing import Dict, List, Tuple

from docx import Document
from docx.oxml.ns import qn

# ---------------------------------------------------------------- 常量
TYPE_MAP = {
    "单选题": "单选", "多选题": "多选", "判断题": "判断", "填空题": "填空",
    "简答题": "简答", "论述题": "论述", "名词解释": "名词解释",
    "计算题": "计算", "绘图题": "绘图",
}
TYPE_KEYWORDS = list(TYPE_MAP.keys())

DIFF_MAP = {
    "易": "容易", "较易": "容易", "中等": "中等",
    "较难": "困难", "难": "困难",
}
DIFF_KEYWORDS = ["较难", "较易", "中等", "难", "易", "空"]

_ANCHOR = re.compile(r"(\d{1,4})\s*/\s*1290")
# 仅由「题型 + 难度」构成的“题头碎片”段落
_HEADER_FRAG = re.compile(
    r"^[\s\(\)（）]*("
    r"(?:" + "|".join(TYPE_KEYWORDS) + r"|答题)\s*(?:较难|较易|中等|难|易|空)?"
    r"|(?:较难|较易|中等|难|易|空)"
    r")[\s\(\)（）]*$"
)


# ---------------------------------------------------------------- 文本工具
def _para_text(p) -> str:
    return "".join(n.text or "" for n in p._p.iter(qn("w:t"))).strip()


def _para_rids(p) -> List[str]:
    rids = []
    for blip in p._p.iter(qn("a:blip")):
        rid = blip.get(qn("r:embed"))
        if rid:
            rids.append(rid)
    return rids


def _clean_text(s: str) -> str:
    """清理段落文本：去掉孤立占位符“口”等噪声。"""
    s = s.replace("\u3000", " ").strip()
    if s in ("口", "口口", "□"):
        return ""
    return re.sub(r"[ \t]+", " ", s).strip()


# ---------------------------------------------------------------- 公式转 LaTeX
_SUP = {"⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
        "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "ⁿ": "n"}
_SUB = {"₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
        "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9"}
_SYMBOL = {
    "×": r"\times ", "÷": r"\div ", "·": r"\cdot ", "≈": r"\approx ",
    "≤": r"\le ", "≥": r"\ge ", "≠": r"\ne ", "±": r"\pm ", "∞": r"\infty ",
    "∑": r"\sum ", "∫": r"\int ", "Ω": r"\Omega ", "μ": r"\mu ", "π": r"\pi ",
    "°": r"^\circ ", "%": r"\%", "−": "-",
}
_MATHY = re.compile(
    r"[0-9A-Za-z\.\,\+\-\*/=<>×÷·≈≤≥≠±∞∑∫Ωμπ√°%²³⁴⁵⁶⁷⁸⁹⁰¹ⁿ₀₁₂₃₄₅₆₇₈₉\^_\(\)\[\]\{\}\s−]+"
)
# 真正的“数学信号”：出现其一才认定为公式（避免把 GB/T 29319-2012 之类误判）
_STRONG = re.compile(r"[=×÷·≈≤≥≠±∞∑∫Ωμπ√²³⁴⁵⁶⁷⁸⁹⁰¹ⁿ₀₁₂₃₄₅₆₇₈₉\^_]")
_TRIM = " \t,.，、;；:："


def _convert_math(span: str) -> str:
    out = []
    i = 0
    n = len(span)
    while i < n:
        ch = span[i]
        if ch in _SUP:
            j = i
            while j < n and span[j] in _SUP:
                j += 1
            out.append("^{" + "".join(_SUP[c] for c in span[i:j]) + "}")
            i = j
            continue
        if ch in _SUB:
            j = i
            while j < n and span[j] in _SUB:
                j += 1
            out.append("_{" + "".join(_SUB[c] for c in span[i:j]) + "}")
            i = j
            continue
        if ch == "√":
            m = re.match(r"√\s*([0-9A-Za-z]+)", span[i:])
            if m:
                out.append(r"\sqrt{" + m.group(1) + "}")
                i += m.end()
            else:
                out.append(r"\surd ")
                i += 1
            continue
        if ch in _SYMBOL:
            out.append(_SYMBOL[ch])
            i += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out).strip()


def mathify(text: str) -> str:
    """把文本中“像公式”的片段转为 $LaTeX$，其余原样保留。

    逐行处理，避免 $…$ 跨换行配对而产生无效公式。
    """
    if not text:
        return text
    return "\n".join(_mathify_line(ln) for ln in text.split("\n"))


def _mathify_line(text: str) -> str:
    def repl(m):
        span = m.group(0)
        if not _STRONG.search(span):
            return span
        core = span.strip(_TRIM)
        if not core:
            return span
        lead = span[: span.index(core)]
        tail = span[len(lead) + len(core):]
        return lead + "$" + _convert_math(core) + "$" + tail

    return _MATHY.sub(repl, text)


# ---------------------------------------------------------------- 图片
def _collect_images(doc, path: str) -> Tuple[Dict[str, bytes], Dict[str, str]]:
    """遍历文档关系，返回 {文件名: 字节} 与 {rId: 文件名}。"""
    blobs: Dict[str, bytes] = {}
    rid_map: Dict[str, str] = {}
    for rid, part in doc.part.related_parts.items():
        pn = str(getattr(part, "partname", ""))
        if "/media/" not in pn:
            continue
        ext = pn.rsplit(".", 1)[-1].lower()
        try:
            blob = part.blob
        except Exception:  # noqa: BLE001
            continue
        digest = hashlib.sha1(blob).hexdigest()[:16]
        fname = f"img_{digest}.{ext}"
        blobs[fname] = blob
        rid_map[rid] = fname
    return blobs, rid_map


# ---------------------------------------------------------------- Part A
def _build_segments(lines):
    """按 N/1290 锚点切分 Part A，返回 (segments, header_idx_global)。"""
    anchors = []
    for i, (t, _r) in enumerate(lines):
        m = _ANCHOR.search(t)
        if m:
            anchors.append((i, m))

    header_idx = set()
    header_text = {}
    for i, m in anchors:
        parts = []
        pre = lines[i][0][: m.start()].strip()
        if pre:
            parts.append(pre)
        j = i - 1
        while j >= 0:
            tj = lines[j][0]
            if tj and len(tj) <= 8 and _HEADER_FRAG.match(tj):
                header_idx.add(j)
                parts.insert(0, tj)
                j -= 1
            else:
                break
        header_text[i] = " ".join(parts).strip()

    segs = []
    prev_type = None
    for i, m in anchors:
        h = header_text[i]
        typ = None
        tidx = -1
        for kw in TYPE_KEYWORDS:
            p = h.rfind(kw)
            if p > tidx:
                tidx, typ = p, kw
        if typ is None and "答题" in h:
            typ = "简答题"
        if typ is None:
            typ = prev_type or "简答题"
        tail = h[tidx + len(typ):] if tidx >= 0 else h
        diff = None
        for kw in DIFF_KEYWORDS:
            if kw in tail:
                diff = kw
                break
        segs.append({
            "num": int(m.group(1)), "type_raw": typ, "diff_raw": diff,
            "after": lines[i][0][m.end():].strip(), "body": [], "hdr_idx": i,
        })
        prev_type = typ

    # 填充正文
    aidx = [i for i, _ in anchors]
    for ai, (i, m) in enumerate(anchors):
        end = aidx[ai + 1] if ai + 1 < len(aidx) else len(lines)
        if segs[ai]["after"]:
            segs[ai]["body"].append((segs[ai]["after"], lines[i][1]))
        for j in range(i + 1, end):
            if j in header_idx:
                continue
            t, rids = lines[j]
            t = _clean_text(t)
            if t or rids:
                segs[ai]["body"].append((t, rids))
    return segs


def _split_options(text: str) -> List[str]:
    """把 '(A)…(B)…(C)…(D)…' 拆成 A-D 四个选项；失败返回 []。"""
    matches = list(re.finditer(r"[（(]\s*([A-D])\s*[）)]", text))
    if len(matches) < 2:
        return []
    opts: Dict[str, str] = {}
    for idx, m in enumerate(matches):
        letter = m.group(1)
        start = m.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        piece = text[start:end].strip(" ；;，,。.")
        opts[letter] = piece
    if len(opts) < 2:
        return []
    return [opts.get(k, "") for k in "ABCD"]


def parse_docx_partA(doc, lines, rid_map) -> Tuple[List[Dict], List[str]]:
    segs = _build_segments(lines)
    items: List[Dict] = []
    warnings: List[str] = []
    for seg in segs:
        qtype = TYPE_MAP.get(seg["type_raw"], "简答")
        diff = DIFF_MAP.get(seg["diff_raw"] or "", "")
        body = seg["body"]

        # 定位“标准答案”
        aidx = None
        for k, (t, _r) in enumerate(body):
            if t.startswith("标准答案"):
                aidx = k
                break
        if aidx is None:
            warnings.append(f"#{seg['num']} 缺少标准答案")
            continue
        ans_inline = body[aidx][0][len("标准答案"):].strip()
        before = body[:aidx]
        after = body[aidx:]

        q_images = [rid_map[r] for _t, rs in before for r in rs if r in rid_map]
        a_images = [rid_map[r] for _t, rs in after for r in rs if r in rid_map]
        # 去重保序
        q_images = list(dict.fromkeys(q_images))
        a_images = list(dict.fromkeys(a_images))

        item: Dict = {"type": qtype, "difficulty": diff}

        if qtype in ("单选", "多选"):
            stem_parts, opt_texts = [], []
            for t, _r in before:
                if not t:
                    continue
                stem_parts.append(t)
            joined = " ".join(stem_parts)
            # 若题干中直接内嵌选项，则拆出
            inline = _split_options(joined)
            if inline:
                m = re.search(r"[（(]\s*A\s*[）)]", joined)
                stem = joined[: m.start()].strip() if m else joined
                options = inline
            else:
                options = _split_options(" ".join(opt_texts)) or _split_options(joined)
                stem = joined
            ans = ans_inline[:1].upper()
            if ans not in list("ABCD"):
                nxt = body[aidx + 1][0] if aidx + 1 < len(body) else ""
                ans = nxt.strip()[:1].upper()
            item.update(question=mathify(stem), options=[mathify(o) for o in options])
            if ans in list("ABCD"):
                item["answer"] = ans
            else:
                item["answer"] = ""
                item["answerMissing"] = True

        elif qtype == "判断":
            raw = ans_inline
            if not raw and aidx + 1 < len(body):
                raw = body[aidx + 1][0]
            raw = raw.strip()
            stem = " ".join(t for t, _r in before if t)
            if raw.startswith("√") or raw.startswith("对") or raw.startswith("正确"):
                ans = "√"
            elif raw.startswith("×") or raw.startswith("X") or raw.startswith("x") or raw.startswith("错"):
                ans = "×"
            else:
                ans = ""
            item.update(question=mathify(stem), options=["√", "×"])
            if ans:
                item["answer"] = ans
            else:
                item["answer"] = ""
                item["answerMissing"] = True
                warnings.append(f"#{seg['num']} 判断答案缺失")

        else:  # 简答 / 论述 / 计算 / 绘图 / 名词解释
            stem = " ".join(t for t, _r in before if t)
            ans_parts = []
            if ans_inline:
                ans_parts.append(ans_inline)
            ans_parts.extend(t for t, _r in body[aidx + 1:] if t)
            item.update(question=mathify(stem), answer=mathify("\n".join(ans_parts)))

        if q_images:
            item["images"] = q_images
        if a_images:
            item["answerImages"] = a_images
        items.append(item)

    for i, it in enumerate(items, 1):
        it["id"] = i
    return items, warnings

# ---------------------------------------------------------------- 对外接口
def parse_partA(path: str) -> Dict:
    """解析《光伏汇总全部.docx》的 Part A（规整 1290 题）。

    返回 {"items": [...], "images": {文件名: 字节}, "warnings": [...]}
    """
    doc = Document(path)
    lines = [(_clean_text(_para_text(p)), _para_rids(p)) for p in doc.paragraphs]
    blobs, rid_map = _collect_images(doc, path)
    items, warnings = parse_docx_partA(doc, lines, rid_map)
    return {"items": items, "images": blobs, "warnings": warnings}


# ================================================================ Part B
PARTB_HEADINGS = [
    ("fill1", "一、填空题", "二、选择题"),
    ("choice1", "二、选择题", "三、判断题"),
    ("judge1", "三、判断题", "四、简答题"),
    ("short1", "四、简答题", "五、问答题"),
    ("essay1", "五、问答题", "光伏部分应知应会题库"),
    ("choice2", "光伏部分应知应会题库", "二、 填空题"),
    ("fill2", "二、 填空题", "判断题"),
    ("judge2", "判断题", "简答题"),
]


def _find_after(texts, needle, start=0):
    for i in range(start, len(texts)):
        if texts[i].strip() == needle:
            return i
    return -1


def _split_numbered(texts: List[str]) -> List[str]:
    """把「N．/N、」编号的段落流拆成若干条目文本。"""
    items: List[str] = []
    cur = None
    for t in texts:
        t = t.strip()
        if not t:
            continue
        for p in re.split(r"(?<=\s)(?=\d{1,4}\s*[．.、])", t):
            p = p.strip()
            if not p:
                continue
            if re.match(r"^\d{1,4}\s*[．.、]", p):
                if cur is not None:
                    items.append(cur)
                cur = re.sub(r"^\d{1,4}\s*[．.、]\s*", "", p, count=1)
            elif cur is not None:
                cur += "\n" + p
    if cur is not None:
        items.append(cur)
    return items


def _split_labeled_options(rest: str) -> List[str]:
    rest = rest.replace("\n", " ")
    found = list(re.finditer(r"(?<![A-Za-z0-9])([A-D])\s*[．.、]\s*", rest))
    # 只保留 A→B→C→D 递增的标号，避免把正文里的字母误当选项
    seq = []
    want = 0
    for m in found:
        idx = "ABCD".index(m.group(1))
        if idx >= want:
            seq.append(m)
            want = idx + 1
    if len(seq) < 2:
        return []
    opts: Dict[str, str] = {}
    for i, m in enumerate(seq):
        s = m.end()
        e = seq[i + 1].start() if i + 1 < len(seq) else len(rest)
        opts[m.group(1)] = re.sub(r"\s+", " ", rest[s:e]).strip(" ；;，,。.")
    return [opts.get(k, "") for k in "ABCD"]


def _answer_span(text: str):
    """取选择题答案括号，返回 (answer, stem, rest) 或 None。"""
    for m in re.finditer(r"[（(]\s*([A-Ea-e]{1,5})\s*[）)]", text):
        a = "".join(sorted(set(m.group(1).upper())))
        if a:
            return a, text[: m.start()].strip(), text[m.end():].strip()
    return None


def _parse_fill_section(texts: List[str]) -> List[Dict]:
    out = []
    for item in _split_numbered(texts):
        answers: List[str] = []

        def rep(m):
            a = m.group(1).strip()
            if a:
                answers.append(a)
            return "{{" + a + "}}"

        q = re.sub(r"[（(]\s*([^（）()]{1,60}?)\s*[）)]", rep, item)
        q = re.sub(r"\s+", " ", q.replace("\n", " ")).strip()
        if q and answers:
            out.append({"type": "填空", "difficulty": "", "question": q, "answers": answers})
    return out


def _parse_choice_section(texts: List[str]) -> List[Dict]:
    out = []
    for item in _split_numbered(texts):
        got = _answer_span(item)
        if not got:
            continue
        ans, stem, rest = got
        opts = _split_labeled_options(rest)
        if len([o for o in opts if o]) < 2:
            continue
        stem = re.sub(r"\s+", " ", stem.replace("\n", " ")).strip()
        out.append({
            "type": "多选" if len(ans) > 1 else "单选",
            "difficulty": "", "question": stem,
            "options": [mathify(o) for o in opts], "answer": ans,
        })
    return out


def _parse_judge_section(texts: List[str]) -> List[Dict]:
    out = []
    for item in _split_numbered(texts):
        m = re.search(r"[（(]\s*([√×✓Xx]|正确|错误|对|错)\s*[）)]", item)
        if not m:
            continue
        raw = m.group(1).strip()
        if raw in ("√", "正确", "对"):
            ans = "√"
        else:
            ans = "×"
        stem = (item[: m.start()] + item[m.end():])
        stem = re.sub(r"\s+", " ", stem.replace("\n", " ")).strip()
        if stem:
            out.append({"type": "判断", "difficulty": "", "question": stem,
                        "options": ["√", "×"], "answer": ans})
    return out


def _parse_qa_section(texts: List[str], qtype: str) -> List[Dict]:
    out = []
    for item in _split_numbered(texts):
        lines = [ln for ln in item.split("\n") if ln.strip()]
        if not lines:
            continue
        stem = lines[0].strip()
        ans = "\n".join(lines[1:]).strip()
        ans = re.sub(r"^答[：:]\s*", "", ans)
        if stem and ans:
            out.append({"type": qtype, "difficulty": "",
                        "question": mathify(stem), "answer": mathify(ans)})
    return out


def _parse_fill_answer_section(texts: List[str]) -> List[Dict]:
    """『N、题干____』+『答案: a, b』格式的填空题。"""
    out = []
    for item in _split_numbered(texts):
        m = re.search(r"答案\s*[：:]\s*(.+)", item, re.S)
        if not m:
            continue
        stem = item[: m.start()].strip()
        ans = re.split(r"[,，、]", m.group(1).strip().replace("\n", " "))
        answers = [a.strip() for a in ans if a.strip()]
        stem = re.sub(r"\s+", " ", stem.replace("\n", " ")).strip()
        if stem and answers:
            out.append({"type": "填空", "difficulty": "", "question": stem, "answers": answers})
    return out


def parse_partB(doc, lines) -> List[Dict]:
    texts = [t for t, _r in lines]
    items: List[Dict] = []
    n = len(texts)
    for key, start_h, end_h in PARTB_HEADINGS:
        s = _find_after(texts, start_h, 8137)
        if s < 0:
            continue
        e = _find_after(texts, end_h, s + 1)
        if e < 0:
            e = n
        body = texts[s + 1:e]
        if key.startswith("fill"):
            items += _parse_fill_section(body) if key == "fill1" else _parse_fill_answer_section(body)
        elif key == "choice1":
            items += _parse_choice_section(body)
        elif key == "choice2":
            items += _parse_choice_lines_section(body)
        elif key.startswith("judge"):
            items += _parse_judge_section(body)
        elif key == "short1":
            items += _parse_qa_section(body, "简答")
        elif key == "essay1":
            items += _parse_qa_section(body, "论述")
    return items


def parse_all(path: str) -> Dict:
    """解析整个《光伏汇总全部.docx》：Part A + Part B（未去重）。"""
    doc = Document(path)
    lines = [(_clean_text(_para_text(p)), _para_rids(p)) for p in doc.paragraphs]
    blobs, rid_map = _collect_images(doc, path)
    part_a, warnings = parse_docx_partA(doc, lines, rid_map)
    part_b = parse_partB(doc, lines) + parse_mixed_region([t for t, _r in lines])
    return {"partA": part_a, "partB": part_b, "images": blobs, "warnings": warnings}


def _parse_choice_lines_section(texts: List[str]) -> List[Dict]:
    """『N、题干(X)』+ 每行一个选项（可带 A./B. 标号）格式的选择题。"""
    out = []
    for item in _split_numbered(texts):
        lines = [re.sub(r"\s+", " ", ln).strip() for ln in item.split("\n") if ln.strip()]
        if not lines:
            continue
        first = lines[0]
        got = None
        for m in re.finditer(r"[（(][\s\u3000]*([A-Ea-e]{1,5})[\s\u3000]*[）)]", first):
            a = "".join(sorted(set(m.group(1).upper())))
            if a:
                got = (a, m)
                break
        if not got:
            continue
        ans, m = got
        # 该分区选项固定位于后续行；题干整行为首行去掉答案括号
        stem = (first[: m.start()] + " " + first[m.end():]).strip()
        opt_lines = lines[1:]
        opts = []
        for ol in opt_lines:
            ol = re.sub(r"^[A-Da-d]\s*[．.、]\s*", "", ol).strip()
            if ol:
                opts.append(ol)
        if len(opts) < 2:
            continue
        opts = (opts + ["", "", "", ""])[:4]
        out.append({"type": "多选" if len(ans) > 1 else "单选", "difficulty": "",
                    "question": mathify(stem), "options": [mathify(o) for o in opts], "answer": ans})
    return out


# ---------------------------------------------------------------- Part B 混合大区
_ITEM_START = re.compile(r"^(\d{1,4})(?![0-9.．、])(\S.*)$")
_ITEM_START2 = re.compile(r"^(\d{1,4})\s*[、．.]\s*(\S.*)$")
_CHOICE_LIKE = re.compile(r"[（(]\s*[A-Ea-e]{1,5}\s*[）)]|[（(]\s*[）)][\s。.．、,，:：]*[A-Ea-e]{1,5}")
_CHOICE_EXTRA = re.compile(r"[A-E]{3,}\s*[一-鿿]|[一-鿿]\s*[A-E]{3,}")
# 答案字母紧跟在问号/句号后并接中文（选择题“答案+选项”连写）
_CHOICE_TAIL = re.compile(r"[？?。.．]\s*[A-Ea-e][一-鿿]|[？?]\s*[A-E]{2,}")


def _is_choice_like(text: str) -> bool:
    return bool(_CHOICE_LIKE.search(text) or _CHOICE_EXTRA.search(text) or _CHOICE_TAIL.search(text))


def _is_item_start(text: str) -> bool:
    return bool(_ITEM_START.match(text) or _ITEM_START2.match(text))


def _strip_num(text: str) -> str:
    m = _ITEM_START.match(text) or _ITEM_START2.match(text)
    return m.group(2).strip() if m else text.strip()


def _mixed_judge(text: str):
    m = re.search(r"(正确|错误|对|错)\s*[。.！!?？]*\s*$", text)
    if not m:
        return None
    before = text[: m.start()].strip()
    if len(before) < 6:
        return None
    ans = "√" if m.group(1) in ("正确", "对") else "×"
    return before, ans


def _mixed_fill(text: str):
    if not re.search(r"_{2,}|＿{2,}|_\(\d\)", text):
        return None
    # 最后一个空之后为答案
    last = 0
    for m in re.finditer(r"_{2,}|＿{2,}", text):
        last = m.end()
    if last == 0:
        return None
    tail = text[last:].strip(" _＿")
    ans = re.split(r"[。.．]", tail, maxsplit=1)
    answer = (ans[1] if len(ans) > 1 else ans[0]).strip(" _＿")
    answer = re.sub(r"\s+", "", answer)
    if not answer:
        return None
    stem = text[:last].strip()
    answers = [a.strip() for a in re.split(r"&&|＆＆", answer) if a.strip()]
    return stem, answers


def parse_mixed_region(texts: List[str]) -> List[Dict]:
    """解析 Part B 混合大区，仅保留可靠的 简答 / 判断 / 填空。"""
    region = [t.strip() for t in texts[9881:]]
    out: List[Dict] = []
    i = 0
    n = len(region)
    while i < n:
        t = region[i]
        if not t or not _is_item_start(t):
            i += 1
            continue
        body = _strip_num(t)

        if _is_choice_like(body):
            i += 1
            continue

        fl = _mixed_fill(body)
        jd = _mixed_judge(body)
        if fl:
            stem, answers = fl
            out.append({"type": "填空", "difficulty": "", "question": stem, "answers": answers})
            i += 1
            continue
        if jd:
            stem, ans = jd
            out.append({"type": "判断", "difficulty": "", "question": mathify(stem),
                        "options": ["√", "×"], "answer": ans})
            i += 1
            continue

        # 简答：同行“答：” / 问号后接答案 / 下一段以“答”开头
        q = ans = ""
        if "答：" in body or "答:" in body:
            m = re.search(r"答\s*[：:]", body)
            q, ans = body[: m.start()].strip(), body[m.end():].strip()
        elif re.search(r"[？?]", body):
            m = list(re.finditer(r"[？?]", body))[-1]
            q = body[: m.start() + 1].strip()
            ans = body[m.end():].strip()
        else:
            q = body
        # 收集后续段落作为答案
        k = i + 1
        collected = [ans] if ans else []
        while k < n:
            nt = region[k]
            if not nt:
                k += 1
                continue
            if _is_item_start(nt):
                break
            if collected or re.match(r"^答\s*[：:]", nt):
                collected.append(re.sub(r"^答\s*[：:]\s*", "", nt))
                k += 1
            else:
                break
        answer = "\n".join(x for x in collected if x).strip()
        if q and answer and not _is_choice_like(q):
            out.append({"type": "简答", "difficulty": "",
                        "question": mathify(q), "answer": mathify(answer)})
            i = k
        else:
            i += 1
    return out
