# 背题·答题系统

一个基于所上传题库（`data/ 目录下的 Word .docx 题库`）的移动端背题、答题系统。
手机端可独立运行，以 Web 网页形式呈现。

本项目包含 **两种形态**，功能一致（背题 / 随机答题 / 即时判分 / 错题本 / 历史最佳）：

| 形态 | 说明 | 运行/部署 |
|------|------|-----------|
| `static_version/` | 纯前端静态版，无需后端 | 可直接本地打开，或推送到 **Gitee Pages** 手机访问 |
| `server/` | Flask 后端高级版 | 本机/局域网运行，支持 **网页上传新题库** |

题库来源：`data/技师（选择题）.docx`（1495 道单选）、`data/技师（判断题）.docx`（1828 道判断）。
解析后的统一数据存放于 `static_version/data/questions.json`。

---

## 目录结构

```
quiz_app/
├── README.md
├── requirements.txt        # Python 依赖
├── .gitignore
├── qbank/
│   └── parser.py           # 共享解析器（docx -> 结构化题目）
├── scripts/
│   └── build_static.py     # 重新解析原始 docx 并生成 questions.json
├── static_version/         # ① 纯前端静态版
│   ├── index.html          # 单页应用（背题/答题/错题本）
│   └── data/questions.json # 题库数据（推 Pages 时一并上传）
└── server/                 # ② Flask 后端高级版
    ├── app.py              # 主程序 + 题库上传/合并接口（纯 Python，不含 HTML）
    ├── templates/
    │   └── manage.html     # 上传题库页面（HTML 模板，与 Python 分离）
    └── uploads/            # 上传的临时题库（已 gitignore）
```

---

## 一、纯前端静态版（Gitee Pages 部署）

无需 Python，直接把 `static_version/` 整个目录发布为静态站点即可。

### 本地直接使用
用浏览器打开 `static_version/index.html` 即可（数据在同目录 `data/` 中）。
> 若直接 `file://` 打开被浏览器拦截 fetch，请改用下面的本地服务器方式，或部署到 Pages。

### 部署到 Gitee Pages
1. 在 **Gitee** 新建一个仓库（例如 `quiz-app`）。
2. 把 `static_version/` 下的内容作为站点根目录推送：
   ```bash
   cd quiz_app
   git init
   git add .
   git commit -m "init"
   git remote add origin https://gitee.com/<你的用户名>/<仓库名>.git
   git push -u origin master
   ```
3. 进入 Gitee 仓库 → **服务 → Gitee Pages** → 部署分支选择 `master` / 根目录 → 启动。
4. 等待构建完成，即可用生成的形如 `https://<用户名>.gitee.io/<仓库名>/` 的链接在手机上打开做题。

> 推荐在 `static_version/` 目录内单独 init 一个 git，只把静态版内容推送到 Pages 仓库。

---

## 二、Flask 后端高级版（支持上传题库）

### 1. 安装依赖（使用当前虚拟环境）
```bash
cd /home/yong/Python_test
source myenv/bin/activate
pip install -r quiz_app/requirements.txt
```

### 2. 启动服务
```bash
cd /home/yong/Python_test/quiz_app
python server/app.py
```
默认监听 `0.0.0.0:5000`（可用环境变量 `PORT` 修改端口）。

- 电脑访问：`http://127.0.0.1:5000`
- **手机访问**：手机与本机连同一 Wi-Fi，浏览器打开 `http://<本机IP>:5000`
  （查看本机 IP 可执行 `hostname -I` 或 ipconfig；Windows 防火墙需放行该端口）
- 上传题库：`http://<本机IP>:5000/manage`

### 3. 上传新题库
在 `/manage` 页面上传任意 `.docx` 题库，服务端自动识别题型（单选/判断）、解析、
按题干去重后合并进 `static_version/data/questions.json`，前端重新加载即生效。

---

## 三、功能使用说明（手机端）

- **首页**：显示题库总数/单选/判断数量、历史最佳正确率。
- **背题**：逐题浏览，点“显示/隐藏答案”；支持随机顺序、自动翻页、按题型筛选、跳转到指定题号。
- **答题**：选择题型与题量（全部/10/20/30/50/100），随机出题、即时判分（绿=对、红=错）、
  进度条；结束后显示正确率并可回顾错题、一键重练本组错题。
- **我的**：查看历史最佳正确率与错题本（本地自动保存），可练习或清空错题。

---

## 四、重新解析题库 / 数据更新

原始文档在 `data/` 目录，若更新了原始 docx，重新生成数据：
```bash
cd /home/yong/Python_test/quiz_app
source ../myenv/bin/activate
python scripts/build_static.py
```

---

## 五、常见问题

- **手机打不开？** 确认与本机同一网络；后端版确认防火墙放行端口；静态版确认 Pages 地址。
- **上传失败？** 仅支持 `.docx`，且题目需带答案标记：选择题为 `(A)` 等，判断题带 `（√/×）`。
- **Gitee Pages 未生效？** 部署后可能需要刷新，若仓库有更新需重新启动一次 Pages 服务。
