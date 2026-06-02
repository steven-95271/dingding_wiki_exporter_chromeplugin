# DingTalk Wiki Markdown Exporter

钉钉知识库文档 Markdown 导出 Chrome 扩展。

## 功能说明

该扩展用于把钉钉知识库文档导出为 `.md` 文件，当前支持如下形式的钉钉知识库页面：

```text
https://docs.dingtalk.com/i/nodes/...
https://alidocs.dingtalk.com/i/nodes/...
```

扩展会在当前页面中查找钉钉知识库正文区域，清理编辑器相关的页面元素，并使用 Turndown 将 HTML 内容转换为 Markdown。导出的文件名会优先使用文档标题。

## 本地安装

1. 打开 Chrome 浏览器，进入 `chrome://extensions`。
2. 打开右上角的「开发者模式」。
3. 点击「加载已解压的扩展程序」。
4. 选择本项目目录。
5. 安装完成后，浏览器工具栏会出现扩展入口。

## 使用方法

1. 在 Chrome 中打开要导出的钉钉知识库文档。
2. 确认页面已经登录，并且文档内容已经完整加载。
3. 点击浏览器工具栏中的扩展图标。
4. 如果扩展识别到文档，会显示文档标题，并启用「导出 Markdown」按钮。
5. 点击「导出 Markdown」。
6. 在浏览器弹出的下载窗口中选择保存位置。

## 注意事项

- 当前仅支持 `docs.dingtalk.com` 和 `alidocs.dingtalk.com` 下的知识库文档页面，不保证支持所有钉钉文档类型。
- 如果弹窗提示「扩展脚本尚未注入当前页面」，请刷新当前钉钉页面后重试。
- 如果弹窗提示没有找到正文，请确认当前页面是知识库文档页面，并等待文档加载完成后再试。
- 导出过程中扩展会读取当前页面已经渲染出来的文档内容，因此请先确认页面中能正常看到正文。
- 导出的 Markdown 末尾会包含原始文档地址，方便回溯来源。

## 项目文件

- `manifest.json`：Chrome 扩展配置。
- `contentScript.js`：识别钉钉文档正文并转换 Markdown。
- `popup/`：扩展弹窗页面和交互逻辑。
- `vendor/`：Markdown 转换依赖。
