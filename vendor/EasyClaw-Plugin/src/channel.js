import {
  buildBaseChannelStatusSummary,
  createDefaultChannelRuntimeState,
  DEFAULT_ACCOUNT_ID,
  formatPairingApproveHint,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
} from "openclaw/plugin-sdk";
import {
  CHANNEL_ID,
  LEGACY_CHANNEL_ID,
  listBridgeAccountIds,
  normalizeAllowEntry,
  normalizeServerUrl,
  resolveBridgeAccount,
  resolveDefaultBridgeAccountId,
} from "./accounts.js";
import { loginWithTerminalQr, logoutBinding, startBindingQrLogin, waitForBindingQrLogin } from "./binding.js";
import { monitorBridgeProvider } from "./monitor.js";
import { easyClawOnboardingAdapter } from "./onboarding.js";

const meta = {
  id: CHANNEL_ID,
  label: "openclaw(chinese)",
  selectionLabel: "openclaw(chinese) (QR link)",
  docsPath: "/channels/easyclaw",
  docsLabel: "openclaw(chinese)",
  blurb: "Link openclaw(chinese) through a QR-code registration flow and the bridge WebSocket.",
  order: 68,
};

function upsertChannelConfig(cfg, patch) {
  const existingConfig = cfg.channels?.[CHANNEL_ID] ?? cfg.channels?.[LEGACY_CHANNEL_ID] ?? {};
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      [CHANNEL_ID]: {
        ...existingConfig,
        ...patch,
      },
    },
  };
}

function updateEnabledFlag(cfg, enabled) {
  return upsertChannelConfig(cfg, { enabled });
}

function deleteChannelConfig(cfg) {
  const next = {
    ...cfg,
    channels: {
      ...(cfg.channels ?? {}),
    },
  };

  if (next.channels?.[CHANNEL_ID]) {
    delete next.channels[CHANNEL_ID];
  }
  if (next.channels?.[LEGACY_CHANNEL_ID]) {
    delete next.channels[LEGACY_CHANNEL_ID];
  }
  if (next.channels && Object.keys(next.channels).length === 0) {
    delete next.channels;
  }
  return next;
}

const channelSchema = {
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      enabled: { type: "boolean" },
      name: { type: "string" },
      serverUrl: { type: "string" },
      deviceId: { type: "string" },
      deviceToken: { type: "string" },
      botId: { type: "integer", minimum: 1 },
      dmPolicy: { type: "string", enum: ["open", "pairing", "allowlist", "disabled"] },
      allowFrom: { type: "array", items: { oneOf: [{ type: "string" }, { type: "number" }] } },
      groupPolicy: { type: "string", enum: ["open", "allowlist", "disabled"] },
      groupAllowFrom: {
        type: "array",
        items: { oneOf: [{ type: "string" }, { type: "number" }] },
      },
      requireMention: { type: "boolean" },
      groupSessionScope: {
        type: "string",
        enum: ["group", "group_sender"],
      },
      pollIntervalMs: { type: "integer", minimum: 1000 },
      batchSize: { type: "integer", minimum: 1, maximum: 100 },
    },
  },
};

export const easyClawPlugin = {
  id: CHANNEL_ID,
  meta,
  onboarding: easyClawOnboardingAdapter,
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
    threads: false,
    blockStreaming: true,
  },
  reload: { configPrefixes: [`channels.${CHANNEL_ID}`, `channels.${LEGACY_CHANNEL_ID}`] },
  configSchema: channelSchema,
  config: {
    listAccountIds: () => listBridgeAccountIds(),
    resolveAccount: (cfg, accountId) => resolveBridgeAccount({ cfg, accountId }),
    defaultAccountId: () => resolveDefaultBridgeAccountId(),
    setAccountEnabled: ({ cfg, enabled }) => updateEnabledFlag(cfg, enabled),
    deleteAccount: ({ cfg }) => deleteChannelConfig(cfg),
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      name: account.name,
      serverUrl: account.serverUrl,
      deviceId: account.deviceId,
      botId: account.config.botId ?? null,
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (resolveBridgeAccount({ cfg, accountId }).config.allowFrom ?? []).map((entry) => String(entry)),
    formatAllowFrom: ({ allowFrom }) => allowFrom.map((entry) => normalizeAllowEntry(entry)).filter(Boolean),
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolved = account ?? resolveBridgeAccount({ cfg, accountId });
      return {
        policy: resolved.config.dmPolicy ?? "open",
        allowFrom: resolved.config.allowFrom ?? ["*"],
        policyPath: `channels.${CHANNEL_ID}.dmPolicy`,
        allowFromPath: `channels.${CHANNEL_ID}.allowFrom`,
        approveHint: formatPairingApproveHint(CHANNEL_ID),
        normalizeEntry: (raw) => normalizeAllowEntry(raw),
      };
    },
    collectWarnings: ({ cfg, accountId }) => {
      const account = resolveBridgeAccount({ cfg, accountId });
      const defaultGroupPolicy = resolveDefaultGroupPolicy(cfg);
      const { groupPolicy } = resolveAllowlistProviderRuntimeGroupPolicy({
        providerConfigPresent:
          cfg.channels?.[CHANNEL_ID] !== undefined || cfg.channels?.[LEGACY_CHANNEL_ID] !== undefined,
        groupPolicy: account.config.groupPolicy,
        defaultGroupPolicy,
      });

      if (groupPolicy !== "open") {
        return [];
      }

      const mentionHint =
        account.config.requireMention === false
          ? "allows any group member to trigger the bot without @mention"
          : "allows any group member who can @mention the bot to trigger it";

      return [
        `- openclaw中文版 groups: groupPolicy="open" ${mentionHint}. Set channels.${CHANNEL_ID}.groupPolicy="allowlist" and channels.${CHANNEL_ID}.groupAllowFrom to restrict senders.`,
      ];
    },
  },
  outbound: {
    deliveryMode: "direct",
    sendText: async () => {
      throw new Error("openclaw中文版 direct send is not wired yet. Use the bridge reply flow instead.");
    },
    sendMedia: async () => {
      throw new Error("openclaw中文版 media send is not wired yet. Use the bridge reply flow instead.");
    },
  },
  status: {
    defaultRuntime: createDefaultChannelRuntimeState(DEFAULT_ACCOUNT_ID, {
      connected: false,
      serverUrl: null,
      deviceId: null,
    }),
    buildChannelSummary: ({ snapshot }) => ({
      ...buildBaseChannelStatusSummary(snapshot),
      connected: snapshot.connected ?? false,
      serverUrl: snapshot.serverUrl ?? null,
      deviceId: snapshot.deviceId ?? null,
      lastConnectAt: snapshot.lastConnectAt ?? null,
      lastDisconnectAt: snapshot.lastDisconnectAt ?? null,
    }),
    buildAccountSnapshot: ({ account, runtime }) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      name: account.name,
      serverUrl: account.serverUrl,
      deviceId: account.deviceId,
      running: runtime?.running ?? false,
      connected: runtime?.connected ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      lastConnectAt: runtime?.lastConnectAt ?? null,
      lastDisconnectAt: runtime?.lastDisconnectAt ?? null,
    }),
  },
  setup: {
    resolveAccountId: ({ accountId }) => accountId?.trim() || DEFAULT_ACCOUNT_ID,
    applyAccountName: ({ cfg, name }) => {
      const nextName = typeof name === "string" ? name.trim() : "";
      return nextName ? upsertChannelConfig(cfg, { name: nextName }) : cfg;
    },
    validateInput: ({ input }) => {
      const candidateUrl =
        typeof input.url === "string" && input.url.trim()
          ? input.url.trim()
          : typeof input.httpUrl === "string" && input.httpUrl.trim()
            ? input.httpUrl.trim()
            : "";
      if (candidateUrl && !normalizeServerUrl(candidateUrl)) {
        return "Invalid openclaw(chinese) server URL.";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, input }) => {
      const patch = { enabled: true };
      if (typeof input.name === "string" && input.name.trim()) {
        patch.name = input.name.trim();
      }
      if (typeof input.url === "string" && input.url.trim()) {
        patch.serverUrl = normalizeServerUrl(input.url);
      } else if (typeof input.httpUrl === "string" && input.httpUrl.trim()) {
        patch.serverUrl = normalizeServerUrl(input.httpUrl);
      }
      return upsertChannelConfig(cfg, patch);
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = resolveBridgeAccount({ cfg: ctx.cfg, accountId: ctx.accountId });
      ctx.setStatus({
        accountId: ctx.accountId,
        serverUrl: account.serverUrl || null,
        deviceId: account.deviceId || null,
      });
      ctx.log?.info(`starting easyclaw[${ctx.accountId}] bridge for device ${account.deviceId || "<unbound>"}`);
      return monitorBridgeProvider({
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        accountId: ctx.accountId,
        setStatus: (patch) => {
          ctx.setStatus({
            accountId: ctx.accountId,
            ...patch,
          });
        },
      });
    },
    loginWithQrStart: async ({ accountId, force, timeoutMs }) =>
      await startBindingQrLogin({ accountId, force, timeoutMs }),
    loginWithQrWait: async ({ accountId, timeoutMs }) =>
      await waitForBindingQrLogin({ accountId, timeoutMs }),
    logoutAccount: async ({ accountId }) => {
      const cleared = await logoutBinding(accountId);
      return {
        cleared,
        loggedOut: cleared,
      };
    },
  },
  auth: {
    login: async ({ accountId, runtime, channelInput }) => {
      await loginWithTerminalQr({ accountId, runtime, serverUrl: channelInput });
    },
  },
};
