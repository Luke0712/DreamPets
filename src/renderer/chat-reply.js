const thinking = document.getElementById("thinking");
const replyBox = document.getElementById("replyBox");
const replyContent = document.getElementById("replyContent");
const replyText = document.getElementById("replyText");
const replyImages = document.getElementById("replyImages");
const ackReply = document.getElementById("ackReply");
const params = new URLSearchParams(window.location.search);
let resizeReplyTimer = null;

renderReply({
  message: params.get("message") || "思考中",
  thinking: params.get("thinking") !== "false"
});

loadCurrentReply();
window.pet.replyReady();

window.pet.onReplyUpdate((payload) => {
  renderReply(payload);
});

new ResizeObserver(scheduleReplyResize).observe(document.body);

ackReply.addEventListener("click", () => {
  window.pet.closeReply();
});

function renderReply(payload) {
  const isThinking = Boolean(payload?.thinking);
  document.body.classList.toggle("is-thinking", isThinking);
  thinking.hidden = !isThinking;
  replyBox.hidden = isThinking;
  thinking.textContent = isThinking ? String(payload?.message || "思考中") : "";
  const message = isThinking ? "" : String(payload?.message || "");
  const imageUrls = extractImageUrls(message);
  const visibleText = getVisibleReplyText(message, imageUrls.length > 0);
  replyText.textContent = visibleText;
  replyText.hidden = !visibleText;
  renderImages(imageUrls);
  scheduleReplyResize();
}

async function loadCurrentReply() {
  const payload = await window.pet.getCurrentReply();
  if (payload) {
    renderReply(payload);
  }
}

function extractImageUrls(message) {
  const urls = new Set();
  const patterns = [
    /!\[[^\]]*]\(([^)]+)\)/g,
    /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,
    /\bhttps?:\/\/[^\s<>)"']+\.(?:png|jpe?g|webp|gif)(?:\?[^\s<>)"']*)?/gi,
    /\bhttps?:\/\/[^\s<>)"']*(?:image|img|photo|picture|cdn|output|generated)[^\s<>)"']*/gi,
    /\bfile:\/\/[^\s<>)"']+\.(?:png|jpe?g|webp|gif)/gi,
    /\/[^\s<>)"']+\.(?:png|jpe?g|webp|gif)/gi,
    /\bdata:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+/gi
  ];

  for (const pattern of patterns) {
    for (const match of message.matchAll(pattern)) {
      urls.add(normalizeImageUrl(match[1] || match[0]));
    }
  }

  return [...urls].filter(Boolean);
}

function normalizeImageUrl(url) {
  const trimmedUrl = String(url || "")
    .trim()
    .replace(/^<|>$/g, "")
    .replace(/[.,;，。；]+$/, "");
  if (trimmedUrl.startsWith("/")) {
    return `file://${trimmedUrl}`;
  }
  return trimmedUrl;
}

function removeRenderedImageReferences(message) {
  return String(message || "")
    .replace(/!\[[^\]]*]\(([^)]+)\)/g, "")
    .replace(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi, "")
    .replace(/\bhttps?:\/\/[^\s<>)"']+\.(?:png|jpe?g|webp|gif)(?:\?[^\s<>)"']*)?/gi, "")
    .replace(/\bhttps?:\/\/[^\s<>)"']*(?:image|img|photo|picture|cdn|output|generated)[^\s<>)"']*/gi, "")
    .replace(/\bfile:\/\/[^\s<>)"']+\.(?:png|jpe?g|webp|gif)/gi, "")
    .replace(/\/[^\s<>)"']+\.(?:png|jpe?g|webp|gif)/gi, "")
    .replace(/\bdata:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function getVisibleReplyText(message, hasImages) {
  const text = removeRenderedImageReferences(message);
  if (!hasImages) {
    return text.trim();
  }

  return text
    .split("\n")
    .filter((line) => !isImageMetadataLine(line))
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isImageMetadataLine(line) {
  const text = String(line || "").trim();
  if (!text) return false;

  return [
    /^(?:模型|model)\s*[:：]/i,
    /^(?:尺寸|size|resolution|分辨率)\s*[:：]/i,
    /^(?:文件大小|大小|bytes?)\s*[:：]/i,
    /^(?:保存(?:到|为|路径)?|目标文件|文件路径|本地路径|输出文件|落盘)\s*[:：]/i,
    /^(?:baseurl|endpoint|url|路径)\s*[:：]/i,
    /^\d+(?:\.\d+)?\s*(?:bytes?|kb|mb)$/i,
    /^\d{2,5}\s*[x×]\s*\d{2,5}$/i,
    /^gpt[-_\w.]+$/i
  ].some((pattern) => pattern.test(text));
}

function renderImages(imageUrls) {
  replyImages.replaceChildren();
  replyImages.hidden = imageUrls.length === 0;

  for (const imageUrl of imageUrls) {
    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = "";
    image.loading = "lazy";
    image.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      window.pet.showReplyImageMenu(imageUrl);
    });
    image.addEventListener("error", () => {
      image.replaceWith(createImageError(imageUrl));
      scheduleReplyResize();
    });
    image.addEventListener("load", scheduleReplyResize);
    replyImages.append(image);
  }

  scheduleReplyResize();
}

function createImageError(imageUrl) {
  const error = document.createElement("div");
  error.className = "reply-image-error";
  const title = document.createElement("strong");
  title.textContent = "图片无法加载";
  const detail = document.createElement("span");
  detail.textContent = getImageName(imageUrl);
  detail.title = imageUrl;
  error.append(title, detail);
  return error;
}

function getImageName(imageUrl) {
  try {
    const url = new URL(imageUrl);
    return decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) || imageUrl);
  } catch {
    return String(imageUrl || "").split("/").filter(Boolean).at(-1) || "未知图片";
  }
}

function scheduleReplyResize() {
  clearTimeout(resizeReplyTimer);
  resizeReplyTimer = setTimeout(() => {
    const bodyPadding = 16;
    const panelPaddingAndBorder = 26;
    const boxGap = 10;
    const buttonHeight = ackReply.hidden || replyBox.hidden ? 0 : ackReply.offsetHeight;
    const contentHeight = replyBox.hidden ? thinking.scrollHeight : replyContent.scrollHeight + boxGap + buttonHeight;
    const height = Math.ceil(bodyPadding + panelPaddingAndBorder + contentHeight);
    window.pet.resizeReply(height);
  }, 20);
}
