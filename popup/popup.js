const statusNode = document.getElementById("status");
const exportButton = document.getElementById("exportButton");

let activeTabId = null;

init();

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id ?? null;

  if (!activeTabId || !isDingTalkDocsUrl(tab.url)) {
    setStatus("当前不是钉钉文档页面。");
    return;
  }

  const state = await sendMessage({ type: "DINGTALK_MARKDOWN_CHECK" });
  if (!state?.ok) {
    setStatus(state?.error || "没有识别到钉钉知识库文档。");
    return;
  }

  setStatus(`已识别：${state.title || "钉钉知识库文档"}`);
  exportButton.disabled = false;
}

exportButton.addEventListener("click", async () => {
  exportButton.disabled = true;
  setStatus("正在收集文档内容并生成 Markdown...");

  const result = await sendMessage({ type: "DINGTALK_MARKDOWN_EXPORT" });
  if (!result?.ok) {
    setStatus(result?.error || "导出失败。");
    exportButton.disabled = false;
    return;
  }

  const dataUrl = markdownToDataUrl(result.markdown);
  await chrome.downloads.download({
    url: dataUrl,
    filename: result.filename,
    saveAs: true
  });

  setStatus("已生成下载任务。");
  exportButton.disabled = false;
});

function isDingTalkDocsUrl(url) {
  return typeof url === "string" && /^https:\/\/docs\.dingtalk\.com\//.test(url);
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(activeTabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: "扩展脚本尚未注入当前页面，请刷新页面后重试。" });
        return;
      }
      resolve(response);
    });
  });
}

function setStatus(text) {
  statusNode.textContent = text;
}

function markdownToDataUrl(markdown) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  return URL.createObjectURL(blob);
}
