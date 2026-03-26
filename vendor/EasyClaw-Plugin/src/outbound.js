import { CHANNEL_ID, resolveBridgeAccount } from "./accounts.js";
import { parseEasyClawTarget } from "./targets.js";

function joinApiBase(serverUrl) {
  return `${serverUrl.replace(/\/+$/, "")}/api/v1/openclaw/bridge`;
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
  sendMedia: async ({ cfg, to, text, mediaUrl, replyToId, accountId }) => {
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

    const lower = String(mediaUrl).toLowerCase();
    const msgType = /\.(mp4|webm|mov|m4v|avi|mkv|3gp|ogv|ogg)(?:$|[?#])/i.test(lower)
      ? "video"
      : "image";
    const result = eventId
      ? await sendBridgeReply({
          cfg,
          eventId,
          content: JSON.stringify({ url: mediaUrl }),
          msgType,
          accountId,
        })
      : await sendBridgeMessage({
          cfg,
          to,
          content: JSON.stringify({ url: mediaUrl }),
          msgType,
          accountId,
        });
    logOutbound("info", eventId ? "sent outbound media via reply" : "sent outbound media via direct send", {
      to,
      replyToId: replyToId ?? null,
      eventId: eventId ?? null,
      msgType,
      hasText: Boolean(text?.trim()),
      mediaUrl,
    });
    return { channel: CHANNEL_ID, ...result };
  },
};
