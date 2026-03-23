import { resolveBridgeAccount } from "./accounts.js";

const toolSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: ["status", "publish", "feed", "like", "comment"],
    },
    owner_user_id: {
      type: "integer",
      minimum: 1,
    },
    group_id: {
      type: "integer",
      minimum: 1,
    },
    moment_id: {
      type: "integer",
      minimum: 1,
    },
    page: {
      type: "integer",
      minimum: 1,
    },
    size: {
      type: "integer",
      minimum: 1,
      maximum: 50,
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

function toPositiveInt(value, fieldName, { optional = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (optional) {
      return null;
    }
    throw new Error(`${fieldName} is required`);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return Math.floor(parsed);
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function getConfiguredAccount(api) {
  const account = resolveBridgeAccount({
    cfg: api.config ?? {},
  });

  if (!account.configured) {
    throw new Error("EasyClaw APP bridge account is not configured");
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

async function requestJson(url, init) {
  const response = await fetch(url.toString(), init);
  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(payload.detail ?? `Request failed: HTTP ${response.status}`);
  }
  return payload;
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

  const payload = await requestJson(url, { method: "GET" });
  return {
    bot_id: payload.bot_id ?? null,
    bot_name: payload.bot_name ?? null,
    source: "backend",
  };
}

async function requireBotInfo(account) {
  const bot = await resolveBotInfo(account);
  if (!bot.bot_id) {
    throw new Error("No bridge bot is bound to the current EasyClaw device");
  }
  return bot;
}

async function publishMoment(account, { content, images }) {
  const bot = await requireBotInfo(account);
  const normalizedContent = typeof content === "string" ? content.trim() : "";
  const normalizedImages = normalizeStringArray(images);

  if (!normalizedContent && normalizedImages.length === 0) {
    throw new Error("Moment content or images are required");
  }

  const url = new URL(`/api/v1/openclaw/bridge/bots/${bot.bot_id}/publish-moment`, account.serverUrl);
  const payload = await requestJson(url, {
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

  return {
    ...payload,
    bot_name: bot.bot_name,
  };
}

async function fetchUserMoments(account, params) {
  const bot = await requireBotInfo(account);
  const ownerUserId = toPositiveInt(params.owner_user_id, "owner_user_id");
  const groupId = toPositiveInt(params.group_id, "group_id", { optional: true });
  const page = toPositiveInt(params.page ?? 1, "page");
  const size = Math.min(toPositiveInt(params.size ?? 10, "size"), 50);

  const url = new URL(`/api/v1/openclaw/bridge/bots/${bot.bot_id}/moments/feed`, account.serverUrl);
  url.searchParams.set("device_id", account.deviceId);
  url.searchParams.set("device_token", account.deviceToken);
  url.searchParams.set("owner_user_id", String(ownerUserId));
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(size));
  if (groupId) {
    url.searchParams.set("group_id", String(groupId));
  }

  const payload = await requestJson(url, { method: "GET" });
  return {
    ...payload,
    bot_id: bot.bot_id,
    bot_name: bot.bot_name,
    owner_user_id: ownerUserId,
    group_id: groupId,
  };
}

async function likeMoment(account, params) {
  const bot = await requireBotInfo(account);
  const momentId = toPositiveInt(params.moment_id, "moment_id");
  const groupId = toPositiveInt(params.group_id, "group_id", { optional: true });

  const url = new URL(`/api/v1/openclaw/bridge/bots/${bot.bot_id}/moments/${momentId}/like`, account.serverUrl);
  url.searchParams.set("device_id", account.deviceId);
  url.searchParams.set("device_token", account.deviceToken);
  if (groupId) {
    url.searchParams.set("group_id", String(groupId));
  }

  const liked = await requestJson(url, { method: "POST" });
  return {
    ok: true,
    action: "like",
    bot_id: bot.bot_id,
    bot_name: bot.bot_name,
    moment_id: momentId,
    group_id: groupId,
    liked: Boolean(liked),
  };
}

async function commentMoment(account, params) {
  const bot = await requireBotInfo(account);
  const momentId = toPositiveInt(params.moment_id, "moment_id");
  const groupId = toPositiveInt(params.group_id, "group_id", { optional: true });
  const content = String(params.content ?? "").trim();

  if (!content) {
    throw new Error("content is required");
  }

  const url = new URL(`/api/v1/openclaw/bridge/bots/${bot.bot_id}/moments/${momentId}/comment`, account.serverUrl);
  url.searchParams.set("device_id", account.deviceId);
  url.searchParams.set("device_token", account.deviceToken);
  if (groupId) {
    url.searchParams.set("group_id", String(groupId));
  }

  const payload = await requestJson(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  return {
    ok: true,
    action: "comment",
    bot_id: bot.bot_id,
    bot_name: bot.bot_name,
    moment_id: momentId,
    group_id: groupId,
    comment: payload,
  };
}

function createToolResult(result) {
  return json({
    ok: true,
    ...result,
  });
}

export function createEasyClawMomentsTool(api) {
  return {
    name: "easyclaw_moments",
    label: "EasyClaw Moments",
    description:
      "Manage EasyClaw moments for the current bridge bot. Use `status` to inspect binding, `publish` to post a moment, `feed` to read a user's moments only when a shared group exists, `like` to toggle a like on a permitted moment, and `comment` to comment on a permitted moment. Prefer `group_id` when known so permission checks stay scoped to the current group.",
    parameters: toolSchema,
    async execute(_toolCallId, rawParams) {
      try {
        const account = getConfiguredAccount(api);
        const params = rawParams ?? {};

        if (params.action === "status") {
          const bot = await resolveBotInfo(account);
          return json({
            ok: true,
            action: "status",
            channel: "easyclaw",
            server_url: account.serverUrl,
            device_id: account.deviceId,
            bot_id: bot.bot_id,
            bot_name: bot.bot_name,
            bot_source: bot.source,
          });
        }

        if (params.action === "publish") {
          return createToolResult({
            action: "publish",
            ...(await publishMoment(account, params)),
          });
        }

        if (params.action === "feed") {
          return createToolResult({
            action: "feed",
            ...(await fetchUserMoments(account, params)),
          });
        }

        if (params.action === "like") {
          return json(await likeMoment(account, params));
        }

        if (params.action === "comment") {
          return json(await commentMoment(account, params));
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
    label: "EasyClaw Publish Moment",
    description:
      "Publish a new moment for the current EasyClaw bridge bot. Use this only when the intent is clearly to post the bot's own moment, not to interact with someone else's moments.",
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
        return createToolResult({
          action: "publish",
          ...(await publishMoment(account, rawParams ?? {})),
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

export function createEasyClawViewUserMomentsTool(api) {
  return {
    name: "easyclaw_view_user_moments",
    label: "EasyClaw View User Moments",
    description:
      "View a user's moments as the current EasyClaw bridge bot. Use only for a specific `owner_user_id`, and only when the bot needs to inspect that user's moments because they are in the same group. Pass `group_id` whenever available.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        owner_user_id: {
          type: "integer",
          minimum: 1,
        },
        group_id: {
          type: "integer",
          minimum: 1,
        },
        page: {
          type: "integer",
          minimum: 1,
        },
        size: {
          type: "integer",
          minimum: 1,
          maximum: 50,
        },
      },
      required: ["owner_user_id"],
    },
    async execute(_toolCallId, rawParams) {
      try {
        const account = getConfiguredAccount(api);
        return createToolResult({
          action: "feed",
          ...(await fetchUserMoments(account, rawParams ?? {})),
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

export function createEasyClawMomentInteractionTool(api) {
  return {
    name: "easyclaw_moment_interaction",
    label: "EasyClaw Moment Interaction",
    description:
      "Like or comment on a moment as the current EasyClaw bridge bot. Use `like` when the user explicitly asks for a like or when the bot has already inspected the moment. Use `comment` only with a concrete comment text. These operations are still restricted by shared-group permission on the backend.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: {
          type: "string",
          enum: ["like", "comment"],
        },
        moment_id: {
          type: "integer",
          minimum: 1,
        },
        group_id: {
          type: "integer",
          minimum: 1,
        },
        content: {
          type: "string",
        },
      },
      required: ["action", "moment_id"],
    },
    async execute(_toolCallId, rawParams) {
      try {
        const account = getConfiguredAccount(api);
        const params = rawParams ?? {};

        if (params.action === "like") {
          return json(await likeMoment(account, params));
        }

        if (params.action === "comment") {
          return json(await commentMoment(account, params));
        }

        return json({
          ok: false,
          error: `Unsupported action: ${String(params.action)}`,
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
