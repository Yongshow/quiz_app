# 背题·答题系统

一个基于所上传题库（Word `.docx` 题库）的移动端背题、答题系统。手机端可独立运行，以 Web 网页形式呈现。

本项目包含 **两种形态**，功能一致（背题 / 随机答题 / 即时判分 / 错题本 / 历史最佳）：

| 形态 | 说明 | 运行/部署 |
|------|------|-----------|
| `static_version/` | 纯前端静态版，无需后端 | **GitHub Pages** 在线部署（已上线），也可本地打开 |
| `server/` | Flask 后端高级版 | 本机/局域网运行，支持 **网页上传新题库** |

> 🔴 在线站点：（GitHub Pages） https://yongshow.github.io/quiz_app/

题库来源：`/home/yong/Python_test/data/技师（选择题）.docx`（1495 道单选）、`/home/yong/Python_test/data/技师（判断题）.docx`（1828 道判断）。  
解析后的统一数据存放于 `static_version/data/questions.json`。

---

## 目录结构

```
quiz_app/
├── README.md
├── requirements.txt           # Python 依赖（仅后端需要）
├── .gitignore
├── .github/workflows/static.yml # GitHub Actions：push 到 main 自动发布 GitHub Pages
├── qbank/
│   ├── __init__.py
│   └── parser.py              # 共享解析器（docx -> 结构化题目）
├── scripts/
│   └── build_static.py        # 重新解析原始 docx 并生成 questions.json
├── static_version/            # ① 纯前端静态版（GitHub Pages 发布目录）
│   ├── .nojekyll              # 跳过 Jekyll，保证纯静态
│   ├── index.html             # HTML 外壳（~30 行）
│   ├── style.css              # 全局样式（CSS 变量、响应式布局、组件样式）
│   ├── app.js                 # 全部业务逻辑（背题/答题/错题本/跨设备同步）
│   ├── data/
│   │   └── questions.json     # 题库数据（共 3323 题：单选 1495 / 判断 1828）
│   └── static/                # 预留静态资源目录（当前为空）
├── server/                    # ② Flask 后端高级版（本地运行）
│   ├── app.py                 # 主程序 + 题库上传/合并接口 + 进度云同步接口
│   ├── static/                # 预留静态资源目录（当前为空）
│   ├── templates/
│   │   └── manage.html        # 上传题库页面（HTML 模板）
│   ├── uploads/               # 上传的临时题库（已 gitignore）
│   └── sync/                  # 跨设备同步的用户进度数据（已 gitignore）
└── data/                      # （不在项目目录内，见下方说明）
```

> **说明**：项目目录内没有 `data/`。原始 Word 题库位于项目根目录外侧的 `/home/yong/Python_test/data/`，构建脚本通过 `../data/` 引用该目录。

---

## 一、在线部署（GitHub Pages · 已上线）

本仓库已配置 GitHub Actions 自动部署，推送代码即自动更新线上站点，无需手动操作。

### 线上地址

```
https://yongshow.github.io/quiz_app/
```

### 工作原理
- `.github/workflows/static.yml` 监听 `push 到 main` 分支，并把 **`static_version/`** 目录发布到 Pages
- GitHub 仓库 **Settings → Pages → Source 选择 `GitHub Actions`**（已就绪）

### 更新线上题库 / 代码

本地修改后执行：

```bash
cd /home/yong/Python_test/quiz_app
git add .
git commit -m "更新说明"
git push
```

GitHub Actions 会自动重新构建并部署，稍等片刻线上即更新。

### 首次/重新启用 Pages（仅需一次）

1. 打开 GitHub 仓库 → **Settings → Pages**
2. **Source（源）** 选择 `GitHub Actions`
3. 等待 Actions 运行完成后访问上面的地址

---

## 二、本地直接使用（免服务器）

用浏览器打开 `static_version/index.html` 即可（题库数据在同目录 `data/` 中）。  
> 若 `file://` 打开被浏览器拦截 fetch，请改用下面的本地后端方式，或直接使用已上线的 GitHub Pages 链接。

---

## 三、Flask 后端高级版（本地运行，支持上传题库）

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
  （查看本机 IP 可执行 `hostname -I` 或 `ipconfig`；Windows 防火墙需放行该端口）
- 上传题库：`http://<本机IP>:5000/manage`

### 3. 上传新题库

在 `/manage` 页面上传任意 `.docx` 题库，服务端自动识别题型（单选/判断）、解析、  
按题干去重后合并进 `static_version/data/questions.json`，前端重新加载即生效。

---

## 四、功能使用说明（手机端）

- **首页**：显示题库总数/单选/判断数量、历史最佳正确率。
- **背题**：逐题浏览，点“显示/隐藏答案”；顶部可直接在**全部/单选题/判断题**间切换；  
  支持随机顺序、自动翻页、按题型筛选、跳转到指定题号。
- **答题**：选择题型与题量（全部/10/20/30/50/100），随机出题、即时判分（绿=对、红=错）、  
  进度条；结束后显示正确率并可回顾错题、一键重练本组错题。
- **我的**：查看历史最佳正确率与错题本（本地自动保存），可练习或清空错题。
### 跨设备同步错题本

错题本默认保存在浏览器 localStorage，仅本机有效。换设备时可用以下方式迁移（按推荐程度排序）：

1. **迁移链接（推荐 · 所有版本可用，无需服务器/文件）**  
   "我的"页面 → **生成迁移链接**：把错题本 + 最佳成绩压缩编码成一个链接；  
   发送到另一台设备并打开该链接，即自动按题干匹配题库并合并导入。最适合手机使用。
2. **文件备份（所有版本可用，含 GitHub Pages 静态版）**  
   "我的"页面 → **导出备份**：下载一个 JSON 文件（含错题本 + 最佳成绩）；  
   在新设备上 → **导入备份**：选择该文件即可合并导入。
3. **云端同步（仅 Flask 后端版）**  
   "我的"页面填写**同步码**（自定义字符串，多设备保持一致）→ **上传到云端**；  
   新设备填同一同步码 → **从云端恢复**。  
   云端数据按同步码存于 `server/sync/`（已 gitignore，不入库）；  
   上传/恢复均为**合并**操作（错题按题干去重、最佳成绩取较高值）；  
   答题结束后会自动静默上传。
---

## 五、重新解析题库 / 数据更新

原始文档位于 `/home/yong/Python_test/data/` 目录，若更新了原始 docx，重新生成数据：

```bash
cd /home/yong/Python_test/quiz_app
source ../myenv/bin/activate
python scripts/build_static.py
```

生成后会覆盖 `static_version/data/questions.json`；如需同步到线上，再执行 `git push` 即可。

---

## 六、常见问题

- **手机打不开线上地址？** GitHub Pages（`github.io`）在国内直连可能不稳定，可刷新或稍后再试，也可用本地后端方式访问。
- **上传失败？** 仅支持 `.docx`，且题目需带答案标记：选择题为 `(A)` 等，判断题带 `（√/×）`。
- **推送到 GitHub 被拒？** 本机已配置 Git SSH over 443（`~/.ssh/config`），国内网络环境建议使用该方式推送。
- **线上题库如何更新？** 本地重新生成 `questions.json` 后 `git push`，Actions 会自动部署。

