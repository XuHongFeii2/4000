import { resolveBridgeAccount } from "./accounts.js";

const toolSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: ["status", "publish"],
    },
    content: {
      type: "string",
    },
    images: {
      type: "array",
      items: {
        type: "string",
      },
    },
  },
  required: ["action"],
};

function json(details) {
  return {
    content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
    details,
  };
}

function getConfiguredAccount(api) {
  const account = resolveBridgeAccount({
    cfg: api.config ?? {},
  });

  if (!account.configured) {
    throw new Error("龙虾APP通道尚未配置");
  }

  return account;
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

async function resolveBotInfo(account) {
  const configuredBotId = account.config?.botId;
  if (configuredBotId) {
    return {
      bot_id: configuredBotId,
      bot_name: null,
      source: "config",
    };
  }

  const url = new URL("/api/v1/openclaw/bridge/device", account.serverUrl);
  url.searchParams.set("device_id", account.deviceId);
  url.searchParams.set("device_token", account.deviceToken);

  const response = await fetch(url.toString(), { method: "GET" });
  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(payload.detail ?? `获取龙虾APP机器人失败: HTTP ${response.status}`);
  }

  return {
    bot_id: payload.bot_id ?? null,
    bot_name: payload.bot_name ?? null,
    source: "backend",
  };
}

async function publishMoment(account, { content, images }) {
  const bot = await resolveBotInfo(account);
  if (!bot.bot_id) {
    throw new Error("当前设备未绑定龙虾APP机器人");
  }

  const normalizedContent = typeof content === "string" ? content.trim() : "";
  const normalizedImages = Array.isArray(images)
    ? images.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];

  if (!normalizedContent && normalizedImages.length === 0) {
    throw new Error("Moment content or images are required");
  }

  const url = new URL(`/api/v1/openclaw/bridge/bots/${bot.bot_id}/publish-moment`, account.serverUrl);
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      device_id: account.deviceId,
      device_token: account.deviceToken,
      content: normalizedContent || null,
      images: normalizedImages,
    }),
  });

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(payload.detail ?? `发布龙虾APP虾圈失败: HTTP ${response.status}`);
  }

  return {
    ...payload,
    bot_name: bot.bot_name,
  };
}

export function createEasyClawMomentsTool(api) {
  return {
    name: "easyclaw_moments",
    label: "龙虾APP虾圈",
    description:
      "使用当前已绑定的龙虾APP机器人发布虾圈动态。 " +
      "当用户明确要求发虾圈、发动态或直接发布内容时，不要只生成文案，直接调用此工具。 " +
      "支持 status 和 publish；图片必须是公网 URL 或后端可访问路径。",
    parameters: toolSchema,
    async execute(_toolCallId, rawParams) {
      try {
        const account = getConfiguredAccount(api);
        const params = rawParams ?? {};

        if (params.action === "status") {
          const bot = await resolveBotInfo(account);
          return json({
            ok: true,
            channel: "easyclaw",
            server_url: account.serverUrl,
            device_id: account.deviceId,
            bot_id: bot.bot_id,
            bot_name: bot.bot_name,
            bot_source: bot.source,
          });
        }

        if (params.action === "publish") {
          const result = await publishMoment(account, params);
          return json({
            ok: true,
            action: "publish",
            ...result,
          });
        }

        return json({ ok: false, error: `Unsupported action: ${String(params.action)}` });
      } catch (error) {
        return json({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}

export function createEasyClawPublishMomentTool(api) {
  return {
    name: "easyclaw_publish_moment",
    label: "发布龙虾APP虾圈",
    description:
      "直接使用当前已绑定的龙虾APP机器人发布一条虾圈动态。 " +
      "用户明确要求发虾圈、发动态或立即发布时使用，不要只回复草稿。",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        content: {
          type: "string",
        },
        images: {
          type: "array",
          items: {
            type: "string",
          },
        },
      },
    },
    async execute(_toolCallId, rawParams) {
      try {
        const account = getConfiguredAccount(api);
        const result = await publishMoment(account, rawParams ?? {});
        return json({
          ok: true,
          action: "publish",
          ...result,
        });
      } catch (error) {
        return json({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}
