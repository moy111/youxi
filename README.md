# 有戏 · DeepSeek 本地版

从个人经历出发，通过三轮对话、创业分析与实际验证，形成下一步建议。

## 启动

需要 Python 3.10+。macOS 本机可双击 `start.command`，或在工程目录运行：

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python server.py
```

打开 http://127.0.0.1:8765 ，首次使用在页面粘贴自己的 DeepSeek API Key，本地服务会写入 `.env`（也可复制 `.env.example` 为 `.env` 手动填写后再启动）。不能再直接双击 index.html：真实AI需要本地服务保管密钥。

本机启动脚本也会在没有虚拟环境时尝试已安装的 Codex Python 运行时；其他电脑按上面的标准步骤安装即可。浏览器需要支持 fetch、crypto.randomUUID、structuredClone 的现代版本。

## 已接入

- 首次运行的 Key 配置页：页面粘贴即写入本机 `.env`，仓库与页面均不包含任何密钥。
- DeepSeek 解析个人介绍或提取后的文件文本。
- 基于画像、历史及本次输入的真实对话；三轮后生成摘要，也纳入后续补充。
- 六维分析及动态验证任务。
- 填写真实发现、原话和来源；模型综合全部上下文生成三类建议。
- 多想法切换、草稿保存、本地服务端存储、报告历史与导出。
- 文字型 PDF、DOCX、TXT/MD/CSV/JSON 文件提取；原始文件不保存，只保存提取文本。

## 明确的限制

**尚未接入自动联网检索。** `ai_research` 任务只是待完成的公开研究任务，界面会注明需用户自行检索登记。DeepSeek 的语言回答不是网页搜索结果，用户填写的URL也不代表已核验。

不支持扫描件OCR、旧DOC格式、云同步、多人协同、账户管理或公共部署。当前服务仅绑定 `127.0.0.1`，设计为同一台机器上的单用户应用；请不要用多个标签同时编辑同一份数据。

这不是从 REDcowork 取回的原始全栈工程。它以用户提供的三文件静态版为基础，完成了本地服务及真实AI接入。当前功能仍需目标用户验证；模型建议不是创业成功保证。

## 密钥、数据与费用

- 密钥只在根目录 `.env`（首次打开页面时粘贴保存，或手动编辑），浏览器通过本机接口调用；静态文件服务采用允许列表，不会提供 `.env`、源码或数据文件。
- 文件/个人介绍在点击AI按钮后会发送给DeepSeek处理；文件提取本身在本机进行。
- 项目存于 `data/projects.json`，上次写入备份为 `data/projects.backup.json`，浏览器另有草稿副本。定期点击导出备份。
- `.env`、`data/`、虚拟环境均被 `.gitignore` 排除。不要把简历原件、密钥、个人档案或导出的真实用户备份提交到仓库。
- 默认使用 `deepseek-flash` 非思考模式，单次输入最多24000字符、输出最多2600 tokens；每日最多30次发起请求，失败尝试也计数，不自动重试。用量记录在 `data/usage.json`。
- 上述限制用于控制调用量，**不是人民币费用上限**。余额和实际费用以 DeepSeek 控制台为准。可以降低 `.env` 中 `DAILY_REQUEST_LIMIT` 后重启。
- 本地缓存同一请求ID的成功结果，避免短时重复调用；缓存不跨服务重启。

## 工程结构

```text
public/       页面、样式和前端逻辑
server.py     本地HTTP服务、DeepSeek接口、文件提取与存储
requirements.txt
.env.example  配置模板，不含密钥
start.command 本机启动入口
tests/        不消耗API额度的契约测试
docs/         产品规格与检查记录
```

运行测试：`python -m unittest discover -s tests -v`。测试不调用真实模型。

## GitHub 提交

这是带本地后端的源码项目，GitHub 仓库可供评审克隆后运行。**GitHub Pages 只能托管静态文件，不能运行 server.py，也不能安全保管此密钥。**要提供无需本机启动的在线AI作品，需要再部署具备服务端运行和秘密管理的环境，并增加访问控制与用量限制；本次未进行发布。

提交前确认 `.env` 与 `data/` 均被忽略，再提交源码和运行说明。不要上传整个文件夹的未经筛选压缩包。

## API依据

- https://api-docs.deepseek.com/api/create-chat-completion/
- https://api-docs.deepseek.com/guides/json_mode/

API调用方式依据2026-09-30检查的官方文档；模型可通过 `.env` 配置。
