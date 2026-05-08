# Anna's Archive MCP

Anna's Archive MCP 是一个面向 AI 工具的 MCP server，用于检索 Anna's Archive 元数据、按 MD5/DOI 查询文件详情，并在确认授权后下载文件到本地目录。

它适合配合 Claude、Cursor、Codex、Cherry Studio、Cline 等支持 MCP 的工具使用：AI 负责搜索、筛选、整理候选文件，你确认授权后再让 AI 下载并继续分析本地文件。

> 合规边界：本项目只应用于检索元数据，以及下载公有领域、Creative Commons、开放获取、自己拥有或已经获得授权的文件。下载前仍需要设置 `rightsConfirmed=true` 或 CLI `--confirm`。`rightsHints` 只是页面文本提示，不能替代实际授权判断。

## 快速使用

要求 Node.js `>=20`。

### 1. 先确认命令可用

```powershell
npx -y annas-archive-mcp help
```

### 2. 添加到 MCP 客户端

最小配置，只启用检索和详情查询：

```json
{
  "mcpServers": {
    "annas-archive": {
      "command": "npx",
      "args": ["-y", "annas-archive-mcp", "mcp"]
    }
  }
}
```

如果需要下载文件，加入下载 API key 和默认保存目录：

```json
{
  "mcpServers": {
    "annas-archive": {
      "command": "npx",
      "args": ["-y", "annas-archive-mcp", "mcp"],
      "env": {
        "ANNAS_SECRET_KEY": "your-api-key",
        "ANNAS_DOWNLOAD_PATH": "C:\\Data\\annas-archive-downloads",
        "ANNAS_MAX_DOWNLOAD_MB": "500"
      }
    }
  }
}
```

不同客户端的配置入口不同，但核心都是 `command`、`args`、`env`。

### 3. 直接用 CLI 测试

```powershell
# 检索
npx -y annas-archive-mcp search "Project Gutenberg mathematics" --content book_any --limit 5

# 按 MD5 或 DOI 查询详情
npx -y annas-archive-mcp lookup abcdef0123456789abcdef0123456789 --type md5
npx -y annas-archive-mcp lookup "10.1234/example.doi" --type doi

# 下载已确认可合法下载的文件
npx -y annas-archive-mcp download abcdef0123456789abcdef0123456789 --confirm --dir open-access/books --file-name example-book.pdf
```

## 主要功能

| 功能 | MCP 工具 | CLI 命令 | 是否需要 `ANNAS_SECRET_KEY` |
| --- | --- | --- | --- |
| 检索文件元数据 | `anna_search` | `search` | 否 |
| 按 MD5/DOI 查询详情 | `anna_lookup` | `lookup` | 否 |
| 授权下载文件 | `anna_download` | `download` | 是 |

检索结果会尽量返回：

- `md5`
- 标题、作者、出版社、年份、语言
- 文件格式、大小
- Anna's Archive 页面 URL
- 页面文本中的授权提示 `rightsHints`
- 原始摘要文本 `rawMeta`

下载结果会返回：

- 实际保存路径 `filePath`
- 实际保存目录 `directory`
- 实际文件名 `fileName`
- 写入字节数 `bytesWritten`
- 下载来源 URL `sourceUrl`

## 推荐 AI 工作流

1. 让 AI 调用 `anna_search` 搜索候选文件。
2. 让 AI 根据标题、作者、年份、格式、大小、`pageUrl` 和 `rightsHints` 帮你筛选。
3. 对目标条目调用 `anna_lookup` 补充详情。
4. 你确认文件属于可合法下载范围。
5. 调用 `anna_download`，指定目录、文件名、大小上限和重名策略。
6. AI 读取下载后的 `filePath`，继续做摘要、翻译、OCR、文献整理或数据分析。

可直接对 AI 说：

```text
请用 Anna's Archive MCP 搜索 Project Gutenberg mathematics 相关图书，列出标题、作者、年份、格式、大小和 MD5，不要下载。
```

```text
这个 MD5 对应的文件我确认是 open_access，请下载到 open-access/books，文件名用 example-book.pdf，若重名自动改名。
```

## MCP 工具

### `anna_search`

按标题、作者、主题、DOI 或关键词检索。

```json
{
  "query": "Project Gutenberg mathematics",
  "content": "book_any",
  "limit": 10
}
```

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

按 MD5 或 DOI 查询详情。

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
  "rightsConfirmed": true,
  "directory": "open-access/books",
  "fileName": "example-book.pdf",
  "ifExists": "rename",
  "maxMegabytes": 500
}
```

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `md5` | string | 必填 | 32 位 MD5 |
| `rightsBasis` | enum | `owned_or_authorized` | 授权依据；确认已授权时可省略 |
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
  "filePath": "C:\\Data\\annas-archive-downloads\\open-access\\books\\example-book.pdf",
  "directory": "C:\\Data\\annas-archive-downloads\\open-access\\books",
  "fileName": "example-book.pdf",
  "bytesWritten": 12345678,
  "rightsBasis": "owned_or_authorized",
  "sourceUrl": "https://..."
}
```

## CLI 命令

```powershell
annas-archive-mcp mcp
annas-archive-mcp search "query" [--content book_any] [--limit 10]
annas-archive-mcp lookup <md5-or-doi> [--type md5|doi]
annas-archive-mcp download <md5> --confirm [--rights <basis>] [--dir ./books] [--file-name file.pdf] [--if-exists rename|fail] [--max-mb 250]
```

下载参数：

```text
--dir, --directory    保存目录；相对路径位于 ANNAS_DOWNLOAD_PATH 内
--file-name           保存文件名；没有扩展名时自动推断
--output              文件名或完整输出路径的快捷写法
--if-exists           rename 或 fail，默认 rename
--max-mb              单次下载大小上限
--confirm             确认文件属于允许下载范围
--rights              授权依据，默认 owned_or_authorized
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `ANNAS_BASE_URLS` | 内置镜像列表 | 多个 Anna's Archive 镜像，按顺序尝试 |
| `ANNAS_BASE_URL` | 无 | 兼容旧配置的单镜像变量；`ANNAS_BASE_URLS` 优先 |
| `ANNAS_SECRET_KEY` | 空 | 下载需要；检索和查找不需要 |
| `ANNAS_DOWNLOAD_PATH` | `./downloads` | 默认下载根目录 |
| `ANNAS_TIMEOUT_MS` | `30000` | 单次请求超时时间 |
| `ANNAS_MAX_DOWNLOAD_MB` | `250` | 全局下载大小上限 |

`.env` 示例：

```ini
ANNAS_BASE_URLS=https://annas-archive.pk,https://annas-archive.gd,https://annas-archive.gl
ANNAS_SECRET_KEY=
ANNAS_DOWNLOAD_PATH=./downloads
ANNAS_TIMEOUT_MS=30000
ANNAS_MAX_DOWNLOAD_MB=250
```

## 发布信息

- npm package: `annas-archive-mcp`
- CLI binary: `annas-archive-mcp`
- MCP Registry name: `io.github.doradx/annas-archive-mcp`
- GitHub: https://github.com/Doradx/annas-archive-mcp

## 从源码开发

```powershell
git clone https://github.com/Doradx/annas-archive-mcp.git
cd annas-archive-mcp
npm install
npm run check
npm run build
node scripts/smoke-mcp.mjs "Project Gutenberg" --limit 3
```

开发时也可以直接启动 MCP server：

```powershell
npm run dev
```

## 实现说明

- MCP 通讯使用官方 `@modelcontextprotocol/sdk` 和 stdio transport。
- 搜索和详情解析使用 Anna's Archive 页面 HTML；如果上游页面结构调整，解析字段可能需要同步维护。
- 下载使用 Anna's Archive fast download API，因此 `anna_download` 需要 `ANNAS_SECRET_KEY`。
- 下载写入前会创建目录、净化文件名，并阻止相对目录逃逸默认下载根目录。
- 默认不会覆盖已有文件；`ifExists=rename` 会自动生成不冲突的文件名。

## 参考

- Anna's Archive MCP Server and CLI: https://github.com/iosifache/annas-mcp
- Model Context Protocol TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
