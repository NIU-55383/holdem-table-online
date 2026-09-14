"use strict";
((root, factory) => {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AvatarData = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const MAX_PHOTO_LENGTH = 16000;
  const BOT_SYMBOLS = ["bot-smile", "bot-wink", "bot-cool", "robber"];
  const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
  function firstLetter(name) {
    const text = String(name || "").trim();
    return (segmenter ? [...segmenter.segment(text)][0]?.segment : Array.from(text)[0]) || "?";
  }
  function jpegSize(data) {
    const bytes = typeof Buffer !== "undefined" ? Buffer.from(data, "base64") : Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    if (bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) return null;
    let offset = 2;
    while (offset + 3 < bytes.length) {
      if (bytes[offset++] !== 255) return null;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 218 || marker === 217) return null;
      const length = bytes[offset] * 256 + bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) return null;
      if ([192, 193, 194].includes(marker)) {
        if (length < 8) return null;
        return { width: bytes[offset + 5] * 256 + bytes[offset + 6], height: bytes[offset + 3] * 256 + bytes[offset + 4] };
      }
      offset += length;
    }
    return null;
  }
  function normalize(value, allowSymbol = false) {
    if (value == null) return null;
    if (typeof value !== "object" || typeof value.value !== "string") throw new Error("无效头像 / Invalid avatar");
    const content = value.value.trim();
    if (value.kind === "emoji") {
      const emoji = /\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3/u;
      const allowed = /^[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u200D\uFE0F\u20E3\u{E0020}-\u{E007F}0-9#*]+$/u;
      if (!content || content.length > 64 || !emoji.test(content) || !allowed.test(content)
        || (segmenter && [...segmenter.segment(content)].length !== 1)) throw new Error("请输入一个 emoji / Enter one emoji");
      return { kind: "emoji", value: content };
    }
    if (value.kind === "photo") {
      if (content.length > MAX_PHOTO_LENGTH || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(content)) throw new Error("头像图片过大或格式无效 / Invalid or oversized avatar image");
      const size = jpegSize(content.slice(content.indexOf(",") + 1));
      if (!size || size.width < 1 || size.height < 1 || size.width > 256 || size.height > 256) throw new Error("请使用压缩后的头像 / Use a resized avatar image");
      return { kind: "photo", value: content };
    }
    if (allowSymbol && value.kind === "symbol" && BOT_SYMBOLS.includes(content)) return { kind: "symbol", value: content };
    throw new Error("无效头像 / Invalid avatar");
  }
  function randomBot(rng = Math.random) {
    return rng() < .5 ? null : { kind: "symbol", value: BOT_SYMBOLS[Math.min(BOT_SYMBOLS.length - 1, Math.floor(rng() * BOT_SYMBOLS.length))] };
  }
  return Object.freeze({ normalize, firstLetter, randomBot, MAX_PHOTO_LENGTH, BOT_SYMBOLS: Object.freeze(BOT_SYMBOLS) });
});
