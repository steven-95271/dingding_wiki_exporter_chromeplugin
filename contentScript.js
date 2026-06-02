(function () {
  const WIKI_NODE_PATH = /^\/i\/nodes\//;
  const WIKI_IFRAME_SELECTOR = "iframe#wiki-doc-iframe, iframe[src*='/note/preview']";
  const ARTICLE_SELECTOR = "article[data-cangjie-content='true'], article.body-editor-content";
  const VIRTUAL_PLACEHOLDER_SELECTOR = [
    "[data-cangjie-virualize-placeholder]",
    "[data-cangjie-virtualize-placeholder]"
  ].join(",");

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "DINGTALK_MARKDOWN_CHECK") {
      handleCheck().then(sendResponse);
      return true;
    }

    if (message?.type === "DINGTALK_MARKDOWN_EXPORT") {
      handleExport().then(sendResponse);
      return true;
    }

    return false;
  });

  async function handleCheck() {
    const target = await findTargetDocument();
    if (!target) {
      return { ok: false, error: "没有找到钉钉知识库文档正文。" };
    }

    return {
      ok: true,
      title: getDocumentTitle(target.document)
    };
  }

  async function handleExport() {
    const target = await findTargetDocument();
    if (!target) {
      return { ok: false, error: "没有找到钉钉知识库文档正文。" };
    }

    try {
      const title = getDocumentTitle(target.document);
      const htmlDocument = await buildReadableDocument(target.document, title);
      const markdown = htmlToMarkdown(htmlDocument.body.innerHTML, title, target.sourceUrl);

      return {
        ok: true,
        filename: `${safeFilename(title || "dingding-wiki-doc")}.md`,
        markdown
      };
    } catch (error) {
      return { ok: false, error: `导出失败：${error.message}` };
    }
  }

  async function findTargetDocument() {
    if (!isDingTalkDocsPage()) {
      return null;
    }

    if (document.querySelector(ARTICLE_SELECTOR)) {
      return { document, sourceUrl: location.href };
    }

    const iframe = document.querySelector(WIKI_IFRAME_SELECTOR);
    if (!iframe) {
      return null;
    }

    await waitForIframeLoad(iframe);

    try {
      const iframeDocument = iframe.contentDocument;
      if (iframeDocument?.querySelector(ARTICLE_SELECTOR)) {
        return { document: iframeDocument, sourceUrl: location.href };
      }
    } catch (_error) {
      return null;
    }

    return null;
  }

  function isDingTalkDocsPage() {
    if (!["docs.dingtalk.com", "alidocs.dingtalk.com"].includes(location.hostname)) {
      return false;
    }

    return WIKI_NODE_PATH.test(location.pathname)
      || location.pathname === "/note/preview"
      || Boolean(document.querySelector(WIKI_IFRAME_SELECTOR))
      || Boolean(document.querySelector(ARTICLE_SELECTOR));
  }

  function waitForIframeLoad(iframe) {
    if (iframe.contentDocument?.readyState === "complete") {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const timeout = window.setTimeout(resolve, 3000);
      iframe.addEventListener("load", () => {
        window.clearTimeout(timeout);
        resolve();
      }, { once: true });
    });
  }

  async function buildReadableDocument(sourceDocument, title) {
    const article = sourceDocument.querySelector(ARTICLE_SELECTOR);
    if (!article) {
      throw new Error("正文区域不存在");
    }

    const cleanArticle = await cloneCompleteArticle(sourceDocument, article);
    cleanArticle.querySelector("#doc-title-area")?.remove();
    normalizeCodeBlocks(sourceDocument, cleanArticle);
    cleanArticle.querySelectorAll([
      "script",
      "style",
      "svg",
      "[data-annotations-bubbles-wrapper]",
      "[data-cangjie-selection-layer]",
      VIRTUAL_PLACEHOLDER_SELECTOR,
      "[contenteditable='false']",
      "[aria-hidden='true']"
    ].join(",")).forEach((node) => node.remove());

    cleanArticle.querySelectorAll("span").forEach((node) => {
      if (node.textContent === "\uFEFF") {
        node.remove();
      }
    });

    const html = sourceDocument.implementation.createHTMLDocument(title);
    html.body.innerHTML = `<article><h1>${escapeHtml(title)}</h1>${cleanArticle.innerHTML}</article>`;
    html.querySelectorAll("[style], [class], [data-spm-anchor-id], [data-spm-act-id]").forEach((node) => {
      node.removeAttribute("style");
      node.removeAttribute("class");
      node.removeAttribute("data-spm-anchor-id");
      node.removeAttribute("data-spm-act-id");
    });

    return html;
  }

  function normalizeCodeBlocks(sourceDocument, root) {
    root.querySelectorAll(".cm-editor").forEach((editor) => {
      const code = getCodeMirrorText(editor);
      if (!code.trim()) {
        return;
      }

      const pre = sourceDocument.createElement("pre");
      const codeNode = sourceDocument.createElement("code");
      codeNode.textContent = code;
      pre.appendChild(codeNode);

      const block = editor.closest("[data-block-uuid]") || editor;
      block.replaceWith(pre);
    });
  }

  function getCodeMirrorText(editor) {
    const lines = Array.from(editor.querySelectorAll(".cm-content .cm-line"));
    if (lines.length > 0) {
      return lines.map((line) => line.textContent.replace(/\uFEFF/g, "")).join("\n");
    }

    const content = editor.querySelector(".cm-content");
    if (content) {
      return content.textContent.replace(/\uFEFF/g, "");
    }

    return editor.textContent
      .replace(/^\s*(?:\d+\s*)+/g, "")
      .replace(/\uFEFF/g, "");
  }

  async function cloneCompleteArticle(sourceDocument, article) {
    if (!article.querySelector(VIRTUAL_PLACEHOLDER_SELECTOR)) {
      return article.cloneNode(true);
    }

    const scrollTarget = findScrollTarget(sourceDocument, article);
    const initialScrollTop = getScrollTop(scrollTarget);
    const collectedBlocks = new Map();

    const maxScrollTop = getMaxScrollTop(scrollTarget);
    const viewportHeight = getViewportHeight(scrollTarget);
    const step = Math.max(500, Math.floor(viewportHeight * 0.75));

    for (let scrollTop = 0; scrollTop <= maxScrollTop; scrollTop += step) {
      setScrollTop(scrollTarget, scrollTop);
      await waitForRender();
      await collectMountedBlocks(article, collectedBlocks);
    }

    setScrollTop(scrollTarget, maxScrollTop);
    await waitForRender();
    await collectMountedBlocks(article, collectedBlocks);
    setScrollTop(scrollTarget, initialScrollTop);

    if (collectedBlocks.size === 0) {
      return article.cloneNode(true);
    }

    const mergedArticle = article.cloneNode(false);
    const titleArea = article.querySelector("#doc-title-area");
    if (titleArea) {
      mergedArticle.appendChild(titleArea.cloneNode(true));
    }

    const content = sourceDocument.createElement("div");
    collectedBlocks.forEach((block) => content.appendChild(block));
    mergedArticle.appendChild(content);

    return mergedArticle;
  }

  async function collectMountedBlocks(article, collectedBlocks) {
    getTopLevelContentBlocks(article).forEach((block) => {
      const key = block.getAttribute("data-block-uuid");
      if (!key || collectedBlocks.has(key) || block.closest("#doc-title-area")) {
        return;
      }
      collectedBlocks.set(key, block.cloneNode(true));
    });
  }

  function getTopLevelContentBlocks(article) {
    return Array.from(article.querySelectorAll("[data-block-uuid]")).filter((block) => {
      const parentBlock = block.parentElement?.closest("[data-block-uuid]");
      return !parentBlock || !article.contains(parentBlock);
    });
  }

  function findScrollTarget(sourceDocument, article) {
    const scrollingElement = sourceDocument.scrollingElement || sourceDocument.documentElement;
    const candidates = [
      scrollingElement,
      sourceDocument.body,
      ...Array.from(sourceDocument.querySelectorAll("*"))
    ].filter((node) => {
      return node
        && node.contains(article)
        && node.scrollHeight > node.clientHeight + 100;
    });

    return candidates.sort((a, b) => {
      return getScrollRange(b) - getScrollRange(a);
    })[0] || scrollingElement;
  }

  function getScrollRange(node) {
    return Math.max(0, node.scrollHeight - node.clientHeight);
  }

  function getMaxScrollTop(scrollTarget) {
    return getScrollRange(scrollTarget);
  }

  function getViewportHeight(scrollTarget) {
    return scrollTarget.clientHeight
      || scrollTarget.ownerDocument?.defaultView?.innerHeight
      || 800;
  }

  function getScrollTop(scrollTarget) {
    if (scrollTarget === scrollTarget.ownerDocument?.scrollingElement) {
      return scrollTarget.ownerDocument.defaultView.scrollY;
    }
    return scrollTarget.scrollTop;
  }

  function setScrollTop(scrollTarget, scrollTop) {
    if (scrollTarget === scrollTarget.ownerDocument?.scrollingElement) {
      scrollTarget.ownerDocument.defaultView.scrollTo(0, scrollTop);
      return;
    }
    scrollTarget.scrollTop = scrollTop;
  }

  function waitForRender() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => window.setTimeout(resolve, 120));
    });
  }

  function htmlToMarkdown(html, title, sourceUrl) {
    const turndown = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-"
    });
    turndown.use(turndownPluginGfm.gfm);
    addDingTalkTableRule(turndown);

    turndown.addRule("dingTalkBlank", {
      filter: (node) => node.nodeType === Node.ELEMENT_NODE
        && ["P", "DIV"].includes(node.nodeName)
        && node.textContent.trim() === "",
      replacement: () => ""
    });

    const body = convertDingTalkListMarkers(removeDuplicateTitle(turndown.turndown(html), title))
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return [
      `# ${title || "钉钉知识库文档"}`,
      "",
      body,
      "",
      `> Source: ${sourceUrl}`,
      ""
    ].join("\n").replace(/\n{3,}/g, "\n\n");
  }

  function addDingTalkTableRule(turndown) {
    turndown.addRule("dingTalkTable", {
      filter: (node) => node.nodeName === "TABLE" && node.rows.length > 0,
      replacement: (_content, table) => {
        const rows = Array.from(table.rows).map((row) => {
          return Array.from(row.cells).flatMap((cell) => {
            const colspan = Number(cell.getAttribute("colspan") || 1);
            return [tableCellText(cell), ...Array(Math.max(colspan - 1, 0)).fill("")];
          });
        });
        const columnCount = Math.max(...rows.map((row) => row.length));
        const normalizedRows = rows.map((row) => {
          return [...row, ...Array(columnCount - row.length).fill("")];
        });
        const [header, ...body] = normalizedRows;

        return [
          "",
          markdownTableRow(header),
          markdownTableRow(Array(columnCount).fill("---")),
          ...body.map(markdownTableRow),
          ""
        ].join("\n");
      }
    });
  }

  function tableCellText(cell) {
    return cell.textContent
      .replace(/\uFEFF/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function markdownTableRow(cells) {
    return `| ${cells.map(escapeMarkdownTableCell).join(" | ")} |`;
  }

  function escapeMarkdownTableCell(value) {
    return value
      .replace(/\\/g, "\\\\")
      .replace(/\|/g, "\\|")
      .replace(/\n/g, "<br>");
  }

  function convertDingTalkListMarkers(markdown) {
    const lines = markdown.split("\n");
    const result = [];
    const markerIndentMap = new Map([
      ["●", ""],
      ["○", "  "],
      ["■", "    "]
    ]);

    for (let index = 0; index < lines.length; index += 1) {
      const marker = lines[index].trim();
      if (!markerIndentMap.has(marker)) {
        result.push(lines[index]);
        continue;
      }

      let textIndex = index + 1;
      while (textIndex < lines.length && lines[textIndex].trim() === "") {
        textIndex += 1;
      }

      if (textIndex >= lines.length) {
        result.push(lines[index]);
        continue;
      }

      result.push(`${markerIndentMap.get(marker)}- ${lines[textIndex].trim()}`);

      let nextMarkerIndex = textIndex + 1;
      while (nextMarkerIndex < lines.length && lines[nextMarkerIndex].trim() === "") {
        nextMarkerIndex += 1;
      }

      if (markerIndentMap.has(lines[nextMarkerIndex]?.trim())) {
        index = nextMarkerIndex - 1;
      } else {
        index = textIndex;
      }
    }

    return result.join("\n");
  }

  function getDocumentTitle(targetDocument) {
    const titleNode = targetDocument.querySelector("#doc-title-name")
      || targetDocument.querySelector("#doc-title")
      || targetDocument.querySelector("h1");
    const title = titleNode?.textContent?.trim() || targetDocument.title.trim();
    return title || "钉钉知识库文档";
  }

  function removeDuplicateTitle(markdown, title) {
    const lines = markdown.split("\n");
    const firstContentLine = lines.findIndex((line) => line.trim() !== "");
    if (firstContentLine === -1) {
      return "";
    }

    if (lines[firstContentLine].trim() === `# ${title}`) {
      lines.splice(firstContentLine, 1);
    }

    return lines.join("\n");
  }

  function safeFilename(value) {
    return value
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
  }

  function escapeHtml(value) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
