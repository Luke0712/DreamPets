const thinking = document.getElementById("thinking");
const replyBox = document.getElementById("replyBox");
const replyText = document.getElementById("replyText");
const replyImages = document.getElementById("replyImages");
const ackReply = document.getElementById("ackReply");
const params = new URLSearchParams(window.location.search);

renderReply({
  message: params.get("message") || "思考中",
  thinking: params.get("thinking") !== "false"
});

loadCurrentReply();
window.pet.replyReady();

window.pet.onReplyUpdate((payload) => {
  renderReply(payload);
});

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
  const visibleText = removeRenderedImageReferences(message).trim();
  replyText.textContent = visibleText;
  replyText.hidden = !visibleText;
  renderImages(imageUrls);
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
    });
    replyImages.append(image);
  }
}

function createImageError(imageUrl) {
  const error = document.createElement("div");
  error.className = "reply-image-error";
  error.textContent = `图片无法加载：${imageUrl}`;
  return error;
}
