# Anna's Archive MCP

面向 MCP 客户端和其他 AI 工具的 Anna's Archive 检索、元数据分析与授权下载服务。它把 Anna's Archive 的公开检索页、MD5/DOI 详情页和 fast download API 封装成标准 MCP tools，让 Claude、Cursor、Codex、Cherry Studio 等支持 MCP 的工具可以直接完成：

- 按书名、作者、主题、DOI、关键词检索文件元数据。
- 按 MD5 或 DOI 解析单条文件详情。
- 在确认授权后按 MD5 下载文件，并指定保存目录、文件名、大小上限和重名策略。
- 将下载后的本地文件路径继续交给其他 AI 工具做摘要、抽取、翻译、OCR、文献整理或数据分析。

> 合规边界：本项目只应用于检索元数据，以及下载公有领域、Creative Commons、开放获取、自己拥有或已经获得授权的文件。`anna_download` 必须显式传入 `rightsBasis` 并设置 `rightsConfirmed=true`；`rightsHints` 只是页面文本中的提示，不能替代实际授权判断。

## 能力概览

| 能力 | MCP 工具 | 是否需要 `ANNAS_SECRET_KEY` | 说明 |
| --- | --- | --- | --- |
| 元数据检索 | `anna_search` | 否 | 返回 MD5、标题、作者、出版信息、格式、大小、页面 URL、授权提示等 |
| 单条详情 | `anna_lookup` | 否 | 支持 `md5` 和 `doi`，DOI 会解析到首个匹配的 MD5 条目 |
| 授权下载 | `anna_download` | 是 | 支持每次调用指定目录、文件名、大小上限和冲突处理 |
| 命令行调试 | `search` / `lookup` / `download` | 下载需要 | 不接 MCP 客户端时可直接验证功能 |

## 典型 AI 工作流

1. AI 调用 `anna_search` 搜索候选文件。
2. AI 根据标题、作者、年份、格式、大小、`pageUrl` 和 `rightsHints` 帮你筛选候选项。
3. AI 对目标条目调用 `anna_lookup` 补充详情。
4. 你确认文件属于可合法下载范围。
5. AI 调用 `anna_download`，把文件保存到指定目录和文件名。
6. 下载结果返回本地 `filePath`，后续 AI 工具可以继续读取该文件做分析。

## 安装

直接通过 npm 使用：

```powershell
npx -y annas-archive-mcp help
```

从源码构建：

```powershell
git clone https://github.com/Doradx/annas-archive-mcp.git
cd annas-archive-mcp
npm install
npm run build
```

要求 Node.js `>=20`。

## 环境变量

复制 `.env.example` 为 `.env`，按需填写：

```ini
ANNAS_BASE_URLS=https://annas-archive.pk,https://annas-archive.gd,https://annas-archive.gl
ANNAS_SECRET_KEY=
ANNAS_DOWNLOAD_PATH=./downloads
ANNAS_TIMEOUT_MS=30000
ANNAS_MAX_DOWNLOAD_MB=250
```

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `ANNAS_BASE_URLS` | 内置镜像列表 | 多个 Anna's Archive 镜像，按顺序尝试 |
| `ANNAS_BASE_URL` | 无 | 兼容旧配置的单镜像变量；`ANNAS_BASE_URLS` 优先 |
| `ANNAS_SECRET_KEY` | 空 | 下载需要；检索和查找不需要 |
| `ANNAS_DOWNLOAD_PATH` | `./downloads` | 默认下载根目录 |
| `ANNAS_TIMEOUT_MS` | `30000` | 单次请求超时时间 |
| `ANNAS_MAX_DOWNLOAD_MB` | `250` | 全局下载大小上限 |

## MCP 客户端配置

在支持 MCP 的客户端里加入类似配置：

```json
{
  "mcpServers": {
    "annas-archive": {
      "command": "npx",
      "args": [
        "-y",
        "annas-archive-mcp",
        "mcp"
      ],
      "env": {
        "ANNAS_BASE_URLS": "https://annas-archive.pk,https://annas-archive.gd,https://annas-archive.gl",
        "ANNAS_SECRET_KEY": "your-api-key",
        "ANNAS_DOWNLOAD_PATH": "C:\\Data\\annas-archive-downloads",
        "ANNAS_MAX_DOWNLOAD_MB": "500"
      }
    }
  }
}
```

不同客户端的配置入口名称不同，但核心都是 `command`、`args`、`env` 这三部分。

官方 MCP Registry 名称：

```text
io.github.doradx/annas-archive-mcp
```

## MCP Tools

### `anna_search`

按标题、作者、主题、DOI 或关键词检索。

```json
{
  "query": "Project Gutenberg mathematics",
  "content": "book_any",
  "limit": 10
}
```

参数：

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `query` | string | 必填 | 检索关键词 |
| `content` | enum | `book_any` | 内容类型 |
| `limit` | number | `10` | 返回数量，范围 `1-50` |

`content` 可选值：

```text
book_any, book_unknown, book_fiction, book_nonfiction, journal, comic, magazine, standards_document
```

### `anna_lookup`

按 MD5 或 DOI 查找详情。

```json
{
  "identifier": "abcdef0123456789abcdef0123456789",
  "identifierType": "md5"
}
```

```json
{
  "identifier": "10.1234/example.doi",
  "identifierType": "doi"
}
```

如果省略 `identifierType`，服务会自动把 32 位十六进制字符串识别为 MD5，否则按 DOI 处理。

### `anna_download`

按 MD5 下载已确认可合法下载的文件。

```json
{
  "md5": "abcdef0123456789abcdef0123456789",
  "rightsBasis": "open_access",
  "rightsConfirmed": true,
  "directory": "open-access/books",
  "fileName": "example-book.pdf",
  "ifExists": "rename",
  "maxMegabytes": 500
}
```

参数：

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `md5` | string | 必填 | 32 位 MD5 |
| `rightsBasis` | enum | 必填 | 授权依据 |
| `rightsConfirmed` | boolean | 必填 | 必须为 `true` 才会下载 |
| `directory` | string | `ANNAS_DOWNLOAD_PATH` | 保存目录；绝对路径直接使用，相对路径会解析到 `ANNAS_DOWNLOAD_PATH` 内 |
| `fileName` | string | 自动推断 | 保存文件名；不传时用标题或 MD5，未写扩展名时会尽量按响应或格式补齐 |
| `ifExists` | enum | `rename` | 重名策略：`rename` 自动加 `-1`、`-2`，`fail` 则拒绝覆盖 |
| `maxMegabytes` | number | `ANNAS_MAX_DOWNLOAD_MB` | 单次调用大小上限，不能超过全局上限 |

`rightsBasis` 可选值：

```text
public_domain, creative_commons, open_access, owned_or_authorized
```

返回示例：

```json
{
  "md5": "abcdef0123456789abcdef0123456789",
  "title": "Example Book",
  "filePath": "C:\\Tools\\annas-archive-mcp\\downloads\\open-access\\books\\example-book.pdf",
  "directory": "C:\\Tools\\annas-archive-mcp\\downloads\\open-access\\books",
  "fileName": "example-book.pdf",
  "bytesWritten": 12345678,
  "rightsBasis": "open_access",
  "sourceUrl": "https://..."
}
```

## CLI 用法

CLI 与 MCP tools 使用同一套实现，适合先在终端验证。

```powershell
# 检索图书
npx -y annas-archive-mcp search "Project Gutenberg mathematics" --content book_any --limit 5

# 检索期刊文章
npx -y annas-archive-mcp search "10.1234/example.doi" --content journal --limit 5

# 按 MD5 或 DOI 查找
npx -y annas-archive-mcp lookup abcdef0123456789abcdef0123456789 --type md5
npx -y annas-archive-mcp lookup "10.1234/example.doi" --type doi

# 下载到默认根目录下的相对目录
npx -y annas-archive-mcp download abcdef0123456789abcdef0123456789 --rights open_access --confirm --dir open-access/books --file-name example-book.pdf

# 也可以用 --output 直接给出文件名或完整路径
npx -y annas-archive-mcp download abcdef0123456789abcdef0123456789 --rights open_access --confirm --output "C:\Data\Books\example-book.pdf" --if-exists rename --max-mb 500
```

下载相关参数：

```text
--dir, --directory    保存目录；相对路径位于 ANNAS_DOWNLOAD_PATH 内
--file-name           保存文件名
--output              文件名或完整输出路径的快捷写法
--if-exists           rename 或 fail，默认 rename
--max-mb              单次下载大小上限
--confirm             确认文件属于允许下载范围
```

## 验证

```powershell
# 类型检查
npm run check

# 构建
npm run build

# MCP smoke test，会启动本地 MCP server 并调用 anna_search
node scripts/smoke-mcp.mjs "Project Gutenberg" --limit 3
```

## 实现说明

- MCP 通讯使用官方 `@modelcontextprotocol/sdk` 和 stdio transport。
- 搜索和详情解析使用 Anna's Archive 页面 HTML；如果上游页面结构调整，解析字段可能需要同步维护。
- 下载使用 Anna's Archive fast download API，因此需要 `ANNAS_SECRET_KEY`。
- 下载写入前会创建目录、净化文件名，并阻止相对目录逃逸默认下载根目录。
- 默认不会覆盖已有文件；`ifExists=rename` 会自动生成不冲突的文件名。

## 参考

- Anna's Archive MCP Server and CLI: https://github.com/iosifache/annas-mcp
- Model Context Protocol TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
