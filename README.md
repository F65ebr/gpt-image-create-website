# gpt-image-create-website

一个调用 OpenAI `gpt-image-2.5` 模型的纯前端图像生成页面。整个应用是**单个 HTML 文件**，无构建步骤、无依赖、无后端，可直接通过 GitHub Pages 部署访问。

## 在线访问

<https://f65ebr.github.io/gpt-image-create-website/>

首次使用需点击右上角「设置 API」，填写 API Base URL 和 Token：

| 字段 | 说明 |
| --- | --- |
| API Base URL | 例如 `https://api.openai.com/v1`，使用中转服务时填写对应的 `/v1` 地址 |
| API Token | 你的 API Key |

配置通过 `localStorage` 存储在浏览器本地，不会上传到任何第三方服务器。请求由浏览器直接发往你填写的 API 地址。

> 注意：Token 保存在浏览器本地存储中，请勿在公用设备上使用。

## 功能

### 图像生成与编辑

- **文本生成图像**：输入提示词直接出图。
- **参考图编辑**：支持上传、拖拽、剪贴板粘贴参考图，自动切换到编辑模式。
- **连续编辑**：上一次的生成结果会自动作为下一轮的参考图，可以对同一张图反复修改。
- **提示词收藏**：常用提示词可保存、拖拽排序、导入导出为 JSON。
- **图片查看器**：点击结果可放大查看，支持缩放与拖动。
- **一键下载**：iOS 上会调用系统分享面板以便保存到相册。
- **深色 / 浅色主题**：可跟随系统或手动切换。

### 可调参数

| 参数 | 可选值 | 说明 |
| --- | --- | --- |
| 图像比例 | 1:1 / 3:2 / 2:3 / 16:9 / 9:16 / 自动 | 决定可选的分辨率列表 |
| 图像分辨率 | 随比例变化，最高 3840×2160 | 超过 2560×1440 属官方实验性高分辨率 |
| 质量 | 自动 / 最高 / 极高 / 高 / 中 / 低 | 对应 `auto` `max` `xhigh` `high` `medium` `low` |
| 输出格式 | PNG / JPEG / WebP | JPEG 生成更快，PNG 无损 |
| 压缩级别 | 0–100 | 仅 JPEG 和 WebP 生效，PNG 请求不发送该参数 |
| 内容审核 | 自动 / 宽松 | 对应 `auto` `low` |
| 背景 | 自动 / 透明 / 不透明 | 选「透明」时会自动避开 JPEG（透明底需要 PNG 或 WebP） |

`max` 与 `xhigh` 质量档、以及 `opaque` 背景值均为 GPT Image 2.5 新增能力。

## API 调用方式

页面使用 Images API 的两个端点，二者按是否存在参考图自动切换：

- 无参考图 → `POST {baseUrl}/images/generations`（JSON 请求体）
- 有参考图 → `POST {baseUrl}/images/edits`（`multipart/form-data`）

请求示例：

```bash
curl "$BASE_URL/images/generations" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2.5",
    "prompt": "一只坐在窗台上的橘猫，午后逆光",
    "n": 1,
    "size": "1024x1024",
    "quality": "high",
    "output_format": "png",
    "moderation": "low"
  }'
```

响应中的 `data[0].b64_json` 即为图像数据，页面直接以 base64 内联渲染，不产生外部图片请求。

关于模型 ID：官方另有 `gpt-image-2.5-flare`（延迟更低）和 `gpt-image-2.5-sunburst`（细节更强、更慢）两个变体。本页面固定使用通用别名 `gpt-image-2.5`（定义在 `index.html` 的 `IMAGE_MODEL` 常量），如需指定变体可直接修改该常量。

GPT Image 2.5 **仅支持** `images/generations` 与 `images/edits`，不支持 Chat Completions 与 Responses API。若使用中转服务，请确认其转发了这两个图像端点。

## 自定义分辨率约束

官方对自定义尺寸的限制如下，修改 `index.html` 中的 `resolutionMap` 时需遵守：

- 宽高均为 16 的倍数
- 宽高比在 1:3 至 3:1 之间
- 单边不超过 3840 px
- 总像素数在 655,360 至 8,294,400 之间

## 本地运行

直接用浏览器打开 `index.html` 即可。若需以 HTTP 方式访问：

```bash
python -m http.server 8000
# 然后打开 http://localhost:8000
```

## 部署

仓库根目录的 `index.html` 即为入口，在 GitHub 仓库的 Settings → Pages 中将来源设为 `main` 分支根目录即可完成部署。

## 常见问题

**报错 model not found / 404** — 中转服务可能未支持 `gpt-image-2.5` 或未转发图像端点，可尝试改用 `gpt-image-2.5-flare`。

**报错涉及 moderation** — 输出被内容安全策略拦截，需调整提示词，「宽松」档也无法绕过。

**透明背景没生效** — 需同时满足背景选「透明」且格式为 PNG 或 WebP。

**高分辨率很慢或失败** — 超过 2560×1440 为官方实验性支持，可用性和耗时都可能不稳定。
