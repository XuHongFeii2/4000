import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import { readPersistedBinding } from "./state.js";

export const CHANNEL_ID = "easyclaw";
export const LEGACY_CHANNEL_ID = "clawx-im";
const SUPPORTED_GROUP_SESSION_SCOPES = new Set(["group", "group_sender"]);

function toTrimmedString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export function normalizeServerUrl(value) {
  const raw = toTrimmedString(value).replace(/\/+$/, "");
  if (!raw) {
    return "";
  }
  return raw.replace(/\/api\/v1$/i, "");
}

function normalizeAllowFrom(value, fallback = []) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  const normalized = value
    .map((entry) => String(entry).trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : [...fallback];
}

function normalizeOptionalInt(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

export function listBridgeAccountIds() {
  return [DEFAULT_ACCOUNT_ID];
}

export function resolveDefaultBridgeAccountId() {
  return DEFAULT_ACCOUNT_ID;
}

export function resolveBridgeAccount({ cfg, accountId }) {
  const channelConfig = cfg?.channels?.[CHANNEL_ID] ?? cfg?.channels?.[LEGACY_CHANNEL_ID] ?? {};
  const resolvedAccountId = accountId ?? DEFAULT_ACCOUNT_ID;
  const persisted = readPersistedBinding(resolvedAccountId);

  const serverUrl =
    normalizeServerUrl(channelConfig.serverUrl) || normalizeServerUrl(persisted?.serverUrl);
  const deviceId = toTrimmedString(channelConfig.deviceId) || toTrimmedString(persisted?.deviceId);
  const deviceToken =
    toTrimmedString(channelConfig.deviceToken) || toTrimmedString(persisted?.deviceToken);
  const botId = normalizeOptionalInt(channelConfig.botId) ?? normalizeOptionalInt(persisted?.botId);
  const dmPolicy = channelConfig.dmPolicy ?? "open";
  const groupPolicy = channelConfig.groupPolicy ?? "open";
  const requireMention = channelConfig.requireMention !== false;
  const groupSessionScope = SUPPORTED_GROUP_SESSION_SCOPES.has(channelConfig.groupSessionScope)
    ? channelConfig.groupSessionScope
    : "group";
  const allowFallback = dmPolicy === "open" ? ["*"] : [];

  return {
    accountId: resolvedAccountId,
    name: toTrimmedString(channelConfig.name) || toTrimmedString(persisted?.name) || "龙虾APP",
    enabled: channelConfig.enabled !== false,
    configured: Boolean(serverUrl && deviceId && deviceToken),
    serverUrl,
    deviceId,
    deviceToken,
    config: {
      ...persisted,
      ...channelConfig,
      serverUrl,
      deviceId,
      deviceToken,
      botId,
      dmPolicy,
      groupPolicy,
      requireMention,
      groupSessionScope,
      allowFrom: normalizeAllowFrom(channelConfig.allowFrom, allowFallback),
      groupAllowFrom: normalizeAllowFrom(channelConfig.groupAllowFrom),
      pollIntervalMs:
        typeof channelConfig.pollIntervalMs === "number" && channelConfig.pollIntervalMs >= 1000
          ? Math.floor(channelConfig.pollIntervalMs)
          : 3000,
      batchSize:
        typeof channelConfig.batchSize === "number" && channelConfig.batchSize >= 1
          ? Math.min(Math.floor(channelConfig.batchSize), 100)
          : 20,
    },
  };
}

export function normalizeAllowEntry(entry) {
  return String(entry ?? "").trim();
}
