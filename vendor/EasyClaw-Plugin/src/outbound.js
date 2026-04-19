import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadOutboundMediaFromUrl } from "openclaw/plugin-sdk";
import { CHANNEL_ID, resolveBridgeAccount } from "./accounts.js";
import { parseEasyClawTarget } from "./targets.js";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif", "heic", "heif"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v", "avi", "mkv", "3gp", "ogv", "ogg"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "aac", "m4a", "oga", "flac", "opus"]);
const MIME_BY_EXTENSION = new Map([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["gif", "image/gif"],
  ["webp", "image/webp"],
  ["bmp", "image/bmp"],
  ["svg", "image/svg+xml"],
  ["avif", "image/avif"],
  ["heic", "image/heic"],
  ["heif", "image/heif"],
  ["mp4", "video/mp4"],
  ["webm", "video/webm"],
  ["mov", "video/quicktime"],
  ["m4v", "video/x-m4v"],
  ["avi", "video/x-msvideo"],
  ["mkv", "video/x-matroska"],
  ["3gp", "video/3gpp"],
  ["ogv", "video/ogg"],
  ["ogg", "video/ogg"],
  ["mp3", "audio/mpeg"],
  ["wav", "audio/wav"],
  ["aac", "audio/aac"],
  ["m4a", "audio/mp4"],
  ["oga", "audio/ogg"],
  ["flac", "audio/flac"],
  ["opus", "audio/opus"],
  ["pdf", "application/pdf"],
  ["doc", "application/msword"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["xls", "application/vnd.ms-excel"],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["ppt", "application/vnd.ms-powerpoint"],
  ["pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ["zip", "application/zip"],
  ["rar", "application/vnd.rar"],
  ["7z", "application/x-7z-compressed"],
  ["txt", "text/plain"],
]);

function joinApiBase(serverUrl) {
  return `${serverUrl.replace(/\/+$/, "")}/api/v1/openclaw/bridge`;
}

function joinServerBase(serverUrl) {
  return `${serverUrl.replace(/\/+$/, "")}`;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}

function logOutbound(level, message, extra) {
  const suffix = extra ? ` ${JSON.stringify(extra)}` : "";
  const line = `[easyclaw/outbound] ${message}${suffix}`;
  if (level === "error") {
    console.error(line);
    return;
  }
  console.log(line);
}

function normalizeMimeType(value) {
  return String(value || "").trim().toLowerCase().split(";")[0].trim();
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function isLocalFileLike(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return false;
  return (
    /^file:\/\//i.test(trimmed)
    || /^[a-z]:[\\/]/i.test(trimmed)
    || /^\\\\/.test(trimmed)
    || trimmed.startsWith("./")
    || trimmed.startsWith("../")
    || trimmed.startsWith("/")
  );
}

function decodeMaybeUriComponent(value) {
  const raw = String(value || "");
  if (!raw.includes("%")) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function extractFileName(value, fallback = "file") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;

  let normalized = raw;
  if (isHttpUrl(raw) || /^file:\/\//i.test(raw)) {
    try {
      normalized = new URL(raw).pathname;
    } catch {
      normalized = raw;
    }
  }

  const base = decodeMaybeUriComponent(
    normalized.split("?")[0].split("#")[0].split(/[\\/]/).filter(Boolean).pop() || "",
  ).trim();
  return base || fallback;
}

function getExtension(value) {
  const fileName = extractFileName(value, "");
  const index = fileName.lastIndexOf(".");
  if (index < 0 || index === fileName.length - 1) {
    return "";
  }
  return fileName.slice(index + 1).toLowerCase();
}

function inferMimeType({ mediaUrl, fileName, mimeType }) {
  const normalizedMimeType = normalizeMimeType(mimeType);
  if (normalizedMimeType) {
    return normalizedMimeType;
  }
  const extension = getExtension(fileName) || getExtension(mediaUrl);
  return MIME_BY_EXTENSION.get(extension) || "application/octet-stream";
}

function classifyOutboundAttachment({ mediaUrl, fileName, mimeType }) {
  const normalizedMimeType = inferMimeType({ mediaUrl, fileName, mimeType });
  if (normalizedMimeType.startsWith("image/")) {
    return { msgType: "image", mimeType: normalizedMimeType };
  }
  if (normalizedMimeType.startsWith("video/")) {
    return { msgType: "video", mimeType: normalizedMimeType };
  }
  if (normalizedMimeType.startsWith("audio/")) {
    return { msgType: "file", mimeType: normalizedMimeType };
  }

  const extension = getExtension(fileName) || getExtension(mediaUrl);
  if (IMAGE_EXTENSIONS.has(extension)) {
    return { msgType: "image", mimeType: normalizedMimeType };
  }
  if (VIDEO_EXTENSIONS.has(extension)) {
    return { msgType: "video", mimeType: normalizedMimeType };
  }
  if (AUDIO_EXTENSIONS.has(extension)) {
    return { msgType: "file", mimeType: normalizedMimeType };
  }
  return { msgType: "file", mimeType: normalizedMimeType };
}

function buildFilePayload({ url, fileName, size, mimeType }) {
  return JSON.stringify({
    url,
    name: extractFileName(fileName || url, "file"),
    size: Number.isFinite(Number(size)) ? Number(size) : 0,
    mime_type: inferMimeType({ mediaUrl: url, fileName, mimeType }),
  });
}

async function uploadBridgeFile({
  cfg,
  mediaUrl,
  accountId,
  mediaLocalRoots,
}) {
  const account = resolveBridgeAccount({ cfg, accountId });
  if (!account.configured || !account.serverUrl) {
    throw new Error("easyclaw bridge account is not configured");
  }

  let media;
  if (isLocalFileLike(mediaUrl)) {
    const localPath = /^file:\/\//i.test(String(mediaUrl).trim())
      ? fileURLToPath(String(mediaUrl).trim())
      : path.resolve(String(mediaUrl).trim());
    const [buffer, stats] = await Promise.all([
      fs.readFile(localPath),
      fs.stat(localPath),
    ]);
    media = {
      buffer,
      fileName: path.basename(localPath),
      contentType: inferMimeType({ mediaUrl: localPath, fileName: path.basename(localPath) }),
      size: stats.size,
    };
  } else {
    media = await loadOutboundMediaFromUrl(
      mediaUrl,
      mediaLocalRoots ? { mediaLocalRoots } : undefined,
    );
  }

  const fileName = extractFileName(media.fileName || mediaUrl, "file");
  const mimeType = inferMimeType({
    mediaUrl,
    fileName,
    mimeType: media.contentType,
  });
  const form = new FormData();
  form.append(
    "file",
    new Blob([media.buffer], { type: mimeType || "application/octet-stream" }),
    fileName,
  );

  const response = await fetch(`${joinServerBase(account.serverUrl)}/api/v1/files/upload`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    const errorPayload = await parseJsonResponse(response);
    throw new Error(
      `easyclaw file upload failed: ${response.status} ${errorPayload.detail ?? response.statusText}`,
    );
  }

  const payload = await parseJsonResponse(response);
  const resolvedUrl = String(payload.access_url || payload.url || payload.path || "").trim();
  if (!resolvedUrl) {
    throw new Error("easyclaw file upload succeeded without a returned url");
  }

  return {
    url: resolvedUrl,
    fileName: String(payload.original_filename || payload.filename || fileName).trim() || fileName,
    size: Number(payload.size) || Number(media.size) || media.buffer.length || 0,
    mimeType: inferMimeType({
      mediaUrl: resolvedUrl,
      fileName: payload.original_filename || fileName,
      mimeType: payload.content_type || mimeType,
    }),
  };
}

async function lookupBridgeEvent({
  cfg,
  to,
  replyToId,
  accountId,
}) {
  if (!replyToId) {
    logOutbound("info", "replyToId missing, skip event lookup", {
      to,
      accountId: accountId ?? null,
    });
    return null;
  }

  const account = resolveBridgeAccount({ cfg, accountId });
  if (!account.configured || !account.serverUrl || !account.deviceId || !account.deviceToken) {
    throw new Error("easyclaw bridge account is not configured");
  }
  if (!account.config.botId) {
    throw new Error("easyclaw bridge bot_id is missing");
  }

  const { targetId, targetType } = parseEasyClawTarget(to);
  const url = new URL(`${joinApiBase(account.serverUrl)}/event-lookup`);
  url.searchParams.set("device_id", account.deviceId);
  url.searchParams.set("device_token", account.deviceToken);
  url.searchParams.set("inbound_message_id", String(replyToId));
  url.searchParams.set("bot_id", String(account.config.botId));
  url.searchParams.set("chat_type", targetType === "group" ? "group" : "direct");
  if (targetType === "group") {
    url.searchParams.set("group_id", String(targetId));
  } else {
    url.searchParams.set("user_id", String(targetId));
  }

  const response = await fetch(url.toString(), { method: "GET" });
  if (response.status === 404) {
    logOutbound("info", "event lookup missed, fallback to direct send", {
      to,
      replyToId,
      targetType,
      targetId,
    });
    return null;
  }
  if (!response.ok) {
    const errorPayload = await parseJsonResponse(response);
    throw new Error(
      `easyclaw event lookup failed: ${response.status} ${errorPayload.detail ?? response.statusText}`,
    );
  }

  const payload = await parseJsonResponse(response);
  const eventId = Number(payload.event_id);
  if (!Number.isFinite(eventId) || eventId < 1) {
    return null;
  }

  logOutbound("info", "resolved bridge event for outbound reply", {
    to,
    replyToId,
    eventId,
    targetType,
  });
  return eventId;
}

async function sendBridgeReply({
  cfg,
  eventId,
  content,
  msgType = "text",
  accountId,
}) {
  const account = resolveBridgeAccount({ cfg, accountId });
  if (!account.configured || !account.serverUrl || !account.deviceId || !account.deviceToken) {
    throw new Error("easyclaw bridge account is not configured");
  }

  const response = await fetch(`${joinApiBase(account.serverUrl)}/reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      device_id: account.deviceId,
      device_token: account.deviceToken,
      event_id: eventId,
      content,
      msg_type: msgType,
    }),
  });

  if (!response.ok) {
    const errorPayload = await parseJsonResponse(response);
    throw new Error(
      `easyclaw outbound reply failed: ${response.status} ${errorPayload.detail ?? response.statusText}`,
    );
  }

  return parseJsonResponse(response);
}

async function sendBridgeMessage({
  cfg,
  to,
  content,
  msgType = "text",
  accountId,
}) {
  const account = resolveBridgeAccount({ cfg, accountId });
  if (!account.configured || !account.serverUrl || !account.deviceId || !account.deviceToken) {
    throw new Error("easyclaw bridge account is not configured");
  }
  if (!account.config.botId) {
    throw new Error("easyclaw bridge bot_id is missing");
  }

  const { targetId, targetType } = parseEasyClawTarget(to);
  const response = await fetch(`${joinApiBase(account.serverUrl)}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      device_id: account.deviceId,
      device_token: account.deviceToken,
      bot_id: account.config.botId,
      target_id: targetId,
      target_type: targetType,
      content,
      msg_type: msgType,
    }),
  });

  if (!response.ok) {
    const errorPayload = await parseJsonResponse(response);
    throw new Error(
      `easyclaw outbound send failed: ${response.status} ${errorPayload.detail ?? response.statusText}`,
    );
  }

  return parseJsonResponse(response);
}

export const easyClawOutbound = {
  deliveryMode: "direct",
  sendText: async ({ cfg, to, text, replyToId, accountId }) => {
    logOutbound("info", "begin outbound text", {
      to,
      replyToId: replyToId ?? null,
      textLength: String(text ?? "").length,
      accountId: accountId ?? null,
    });
    const eventId = await lookupBridgeEvent({
      cfg,
      to,
      replyToId,
      accountId,
    });
    const result = eventId
      ? await sendBridgeReply({
          cfg,
          eventId,
          content: text ?? "",
          msgType: "text",
          accountId,
        })
      : await sendBridgeMessage({
          cfg,
          to,
          content: text ?? "",
          msgType: "text",
          accountId,
        });
    logOutbound("info", eventId ? "sent outbound text via reply" : "sent outbound text via direct send", {
      to,
      replyToId: replyToId ?? null,
      eventId: eventId ?? null,
      textLength: String(text ?? "").length,
    });
    return { channel: CHANNEL_ID, ...result };
  },
  sendMedia: async ({ cfg, to, text, mediaUrl, replyToId, accountId, mediaLocalRoots }) => {
    logOutbound("info", "begin outbound media", {
      to,
      replyToId: replyToId ?? null,
      hasText: Boolean(text?.trim()),
      mediaUrl: mediaUrl ?? null,
      accountId: accountId ?? null,
    });
    const eventId = await lookupBridgeEvent({
      cfg,
      to,
      replyToId,
      accountId,
    });

    if (text?.trim()) {
      if (eventId) {
        await sendBridgeReply({
          cfg,
          eventId,
          content: text,
          msgType: "text",
          accountId,
        });
      } else {
        await sendBridgeMessage({
          cfg,
          to,
          content: text,
          msgType: "text",
          accountId,
        });
      }
    }

    if (!mediaUrl) {
      return { channel: CHANNEL_ID, ok: true };
    }

    let resolvedMediaUrl = String(mediaUrl).trim();
    let fileName = extractFileName(resolvedMediaUrl, "file");
    let fileSize = 0;
    let mimeType = inferMimeType({ mediaUrl: resolvedMediaUrl, fileName });

    if (isLocalFileLike(resolvedMediaUrl)) {
      const uploaded = await uploadBridgeFile({
        cfg,
        mediaUrl: resolvedMediaUrl,
        accountId,
        mediaLocalRoots,
      });
      resolvedMediaUrl = uploaded.url;
      fileName = uploaded.fileName;
      fileSize = uploaded.size;
      mimeType = uploaded.mimeType;
    }

    const attachment = classifyOutboundAttachment({
      mediaUrl: resolvedMediaUrl,
      fileName,
      mimeType,
    });
    const msgType = attachment.msgType;
    const content = msgType === "file"
      ? buildFilePayload({
          url: resolvedMediaUrl,
          fileName,
          size: fileSize,
          mimeType: attachment.mimeType,
        })
      : JSON.stringify({ url: resolvedMediaUrl });
    const result = eventId
      ? await sendBridgeReply({
          cfg,
          eventId,
          content,
          msgType,
          accountId,
        })
      : await sendBridgeMessage({
          cfg,
          to,
          content,
          msgType,
          accountId,
        });
    logOutbound("info", eventId ? "sent outbound media via reply" : "sent outbound media via direct send", {
      to,
      replyToId: replyToId ?? null,
      eventId: eventId ?? null,
      msgType,
      hasText: Boolean(text?.trim()),
      mediaUrl: resolvedMediaUrl,
      originalMediaUrl: String(mediaUrl),
      fileName,
      mimeType: attachment.mimeType,
    });
    return { channel: CHANNEL_ID, ...result };
  },
};
