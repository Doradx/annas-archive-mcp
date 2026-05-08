# Anna's Archive MCP Node

这是一个用 Node.js/TypeScript 编写的 Anna's Archive MCP Server，同时提供一个轻量 CLI。它参考了 `iosifache/annas-mcp` 的功能边界：检索、按 MD5/DOI 查找、按 MD5 下载；但实现上使用官方 MCP TypeScript SDK，方便通过 `npm install` 后构建和接入 MCP 客户端。

> 重要：本项目只应当用于检索元数据，以及下载公有领域、Creative Commons、开放获取、自己拥有或已经获得授权的文件。下载工具要求显式传入 `rightsBasis` 并设置 `rightsConfirmed=true`，未知授权状态不会被默认放行。

## 功能

- `anna_search`：按标题、作者、主题、DOI 或关键词检索，返回 MD5、标题、作者、格式、大小、页面地址等元数据。
- `anna_lookup`：按 MD5 查找详情，或用 DOI 解析到第一个匹配的 MD5 条目。
- `anna_download`：按 MD5 调用 Anna's Archive API 获取下载地址并保存文件，需要 `ANNAS_SECRET_KEY` 和授权声明。
- CLI：提供 `search`、`lookup`、`download` 三个同名工作流，便于 MCP 之外调试。

## 安装

```powershell
cd E:\水文统计年鉴\annas-archive-mcp-node
npm install
npm run build
```

Node.js 版本要求：`>=20`。

## 环境变量

复制 `.env.example` 为 `.env` 后填写：

```ini
ANNAS_BASE_URLS=https://annas-archive.pk,https://annas-archive.gd,https://annas-archive.gl
ANNAS_SECRET_KEY=your-api-key
ANNAS_DOWNLOAD_PATH=./downloads
ANNAS_TIMEOUT_MS=30000
ANNAS_MAX_DOWNLOAD_MB=250
```

说明：

- `ANNAS_BASE_URLS`：Anna's Archive 镜像列表，按顺序尝试；默认使用 `annas-archive.pk`、`annas-archive.gd`、`annas-archive.gl`。
- `ANNAS_BASE_URL`：兼容旧配置的单镜像变量；如果同时设置了 `ANNAS_BASE_URLS`，优先使用 `ANNAS_BASE_URLS`。
- `ANNAS_SECRET_KEY`：下载时必需；只搜索和查找可不填。
- `ANNAS_DOWNLOAD_PATH`：文件保存目录，默认是项目内 `downloads`。
- `ANNAS_MAX_DOWNLOAD_MB`：全局下载上限，工具调用里的 `maxMegabytes` 不能超过它。

## MCP 客户端配置示例

```json
{
  "mcpServers": {
    "annas-archive": {
      "command": "node",
      "args": [
        "E:\\水文统计年鉴\\annas-archive-mcp-node\\dist\\index.js",
        "mcp"
      ],
      "env": {
        "ANNAS_BASE_URLS": "https://annas-archive.pk,https://annas-archive.gd,https://annas-archive.gl",
        "ANNAS_SECRET_KEY": "your-api-key",
        "ANNAS_DOWNLOAD_PATH": "E:\\水文统计年鉴\\annas-archive-mcp-node\\downloads"
      }
    }
  }
}
```

## CLI 用法

```powershell
# 检索图书
node dist/index.js search "hydrology statistics" --content book_any --limit 5

# 检索期刊文章
node dist/index.js search "10.1038/example" --content journal --limit 5

# 按 MD5 或 DOI 查找
node dist/index.js lookup abcdef0123456789abcdef0123456789 --type md5
node dist/index.js lookup "10.1038/example" --type doi

# 下载已确认可合法下载的文件
node dist/index.js download abcdef0123456789abcdef0123456789 --rights open_access --confirm --output paper.pdf
```

`--rights` 可选值：

- `public_domain`
- `creative_commons`
- `open_access`
- `owned_or_authorized`

## MCP 工具参数

### `anna_search`

```json
{
  "query": "machine learning",
  "content": "book_any",
  "limit": 10
}
```

### `anna_lookup`

```json
{
  "identifier": "abcdef0123456789abcdef0123456789",
  "identifierType": "md5"
}
```

### `anna_download`

```json
{
  "md5": "abcdef0123456789abcdef0123456789",
  "rightsBasis": "open_access",
  "rightsConfirmed": true,
  "fileName": "paper.pdf",
  "maxMegabytes": 250
}
```

## 参考

- Anna's Archive MCP Server and CLI: https://github.com/iosifache/annas-mcp
- MCP TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
