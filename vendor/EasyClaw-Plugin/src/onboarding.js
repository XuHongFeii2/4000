import { DEFAULT_ACCOUNT_ID, formatDocsLink } from "openclaw/plugin-sdk";
import { CHANNEL_ID, resolveBridgeAccount } from "./accounts.js";
import { loginWithTerminalQr } from "./binding.js";
import { resolvePersistedBindingStatePath } from "./state.js";

function upsertChannelConfig(cfg, patch) {
  const existing = cfg.channels?.[CHANNEL_ID] ?? {};
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      [CHANNEL_ID]: {
        ...existing,
        ...patch,
      },
    },
  };
}

export const easyClawOnboardingAdapter = {
  channel: CHANNEL_ID,

  getStatus: async ({ cfg }) => {
    const account = resolveBridgeAccount({ cfg, accountId: DEFAULT_ACCOUNT_ID });
    const boundLabel = account.name || account.deviceId || "default";

    return {
      channel: CHANNEL_ID,
      configured: account.configured,
      statusLines: [
        account.configured
          ? `龙虾APP (${boundLabel}): bound`
          : "龙虾APP: needs QR binding",
      ],
      selectionHint: account.configured ? "bound" : "needs QR",
      quickstartScore: account.configured ? 4 : 5,
    };
  },

  configure: async ({ cfg, runtime, prompter }) => {
    const account = resolveBridgeAccount({ cfg, accountId: DEFAULT_ACCOUNT_ID });
    let next = upsertChannelConfig(cfg, { enabled: true });

    if (!account.configured) {
      await prompter.note(
        [
          "Scan the QR with 龙虾APP on your phone.",
          `Binding state is stored under ${resolvePersistedBindingStatePath()}.`,
          `Docs: ${formatDocsLink("/channels/easyclaw", "easyclaw")}`,
        ].join("\n"),
        "龙虾APP binding",
      );
    }

    const shouldLink = await prompter.confirm({
      message: account.configured ? "龙虾APP already bound. Re-bind now?" : "Bind 龙虾APP now (QR)?",
      initialValue: !account.configured,
    });

    if (!shouldLink) {
      if (!account.configured) {
        await prompter.note(
          "Run `openclaw channels login --channel easyclaw` later to bind 龙虾APP.",
          "龙虾APP",
        );
      }
      return {
        cfg: next,
        accountId: DEFAULT_ACCOUNT_ID,
      };
    }

    try {
      await loginWithTerminalQr({
        accountId: DEFAULT_ACCOUNT_ID,
        runtime,
        serverUrl: account.serverUrl,
      });
    } catch (error) {
      runtime.error?.(`easyclaw login failed: ${String(error)}`);
      await prompter.note(
        `Docs: ${formatDocsLink("/channels/easyclaw", "easyclaw")}`,
        "龙虾APP help",
      );
    }

    next = upsertChannelConfig(next, { enabled: true });
    return {
      cfg: next,
      accountId: DEFAULT_ACCOUNT_ID,
    };
  },

  disable: (cfg) => upsertChannelConfig(cfg, { enabled: false }),
};
