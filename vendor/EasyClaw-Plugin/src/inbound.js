import {
  createNormalizedOutboundDeliverer,
  createReplyPrefixOptions,
  createScopedPairingAccess,
  formatTextWithAttachmentLinks,
  logInboundDrop,
  readStoreAllowFromForDmPolicy,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  resolveDmGroupAccessWithCommandGate,
  resolveOutboundMediaUrls,
  warnMissingProviderGroupPolicyFallbackOnce,
  GROUP_POLICY_BLOCKED_LABEL,
} from "openclaw/plugin-sdk";
import { CHANNEL_ID } from "./accounts.js";
import { getClawXImRuntime } from "./runtime.js";

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeAllowlist(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries
    .map((entry) => String(entry).trim())
    .filter(Boolean);
}

function isSenderAllowed(allowFrom, senderId) {
  if (!Array.isArray(allowFrom) || allowFrom.length === 0) {
    return false;
  }
  if (allowFrom.includes("*")) {
    return true;
  }
  return allowFrom.includes(senderId);
}

function hasBotMention(text, botName) {
  const normalizedName = String(botName ?? "").trim();
  if (!normalizedName) {
    return false;
  }
  const pattern = new RegExp(
    `(^|[\\s\\u3000])[@\\uFF20]${escapeRegExp(normalizedName)}(?=($|[\\s\\u3000,\\uFF0C:\\uFF1A]))`,
  );
  return pattern.test(text);
}

function stripBotMention(text, botName) {
  const normalizedName = String(botName ?? "").trim();
  if (!normalizedName) {
    return text;
  }
  const pattern = new RegExp(
    `(^|[\\s\\u3000])[@\\uFF20]${escapeRegExp(normalizedName)}(?=($|[\\s\\u3000,\\uFF0C:\\uFF1A]))`,
    "g",
  );
  return text.replace(pattern, "$1").replace(/\s{2,}/g, " ").trim();
}

function resolveMentionState({ event, isGroup, rawBody }) {
  if (!isGroup) {
    return {
      mentionedBot: false,
      bodyForAgent: rawBody,
    };
  }

  const botName = String(event.bot_name ?? "").trim();
  const explicitMention = event.mentioned_bot === true;
  const textMention = botName ? hasBotMention(rawBody, botName) : false;
  const mentionedBot = explicitMention || textMention;

  return {
    mentionedBot,
    bodyForAgent: botName ? stripBotMention(rawBody, botName) : rawBody,
  };
}

function resolveGroupPeerId({ groupId, senderId, groupSessionScope }) {
  if (groupSessionScope === "group_sender") {
    return `${groupId}:sender:${senderId}`;
  }
  return groupId;
}

async function deliverBridgeReply({ payload, transport, eventId, statusSink }) {
  const combined = formatTextWithAttachmentLinks(payload.text, resolveOutboundMediaUrls(payload));
  if (!combined) {
    return;
  }

  await transport.sendReply({
    eventId,
    content: combined,
    msgType: "text",
  });
  statusSink?.({ lastOutboundAt: Date.now() });
}

export async function handleBridgeInbound({
  event,
  account,
  config,
  runtime,
  transport,
  statusSink,
}) {
  const core = getClawXImRuntime();
  const pairing = createScopedPairingAccess({
    core,
    channel: CHANNEL_ID,
    accountId: account.accountId,
  });

  const rawBody = String(event.content ?? "").trim();
  if (!rawBody) {
    return;
  }

  const senderId = String(event.user_id);
  const senderName = event.sender_name || `User ${senderId}`;
  const isGroup = event.chat_type === "group" && event.group_id !== null && event.group_id !== undefined;
  const requireMention = account.config.requireMention !== false;
  const mentionState = resolveMentionState({
    event,
    isGroup,
    rawBody,
  });
  const bodyForAgent = mentionState.bodyForAgent;
  const peerId = isGroup
    ? resolveGroupPeerId({
        groupId: String(event.group_id),
        senderId,
        groupSessionScope: account.config.groupSessionScope ?? "group",
      })
    : senderId;

  statusSink?.({ lastInboundAt: Date.now() });

  const dmPolicy = account.config.dmPolicy ?? "open";
  const defaultGroupPolicy = resolveDefaultGroupPolicy(config);
  const { groupPolicy, providerMissingFallbackApplied } =
    resolveAllowlistProviderRuntimeGroupPolicy({
      providerConfigPresent: config.channels?.[CHANNEL_ID] !== undefined,
      groupPolicy: account.config.groupPolicy,
      defaultGroupPolicy,
    });

  warnMissingProviderGroupPolicyFallbackOnce({
    providerMissingFallbackApplied,
    providerKey: CHANNEL_ID,
    accountId: account.accountId,
    blockedLabel: GROUP_POLICY_BLOCKED_LABEL.room,
    log: (message) => runtime.log?.(message),
  });

  const configAllowFrom = normalizeAllowlist(account.config.allowFrom);
  const configGroupAllowFrom = normalizeAllowlist(account.config.groupAllowFrom);
  const storeAllowFrom = normalizeAllowlist(
    await readStoreAllowFromForDmPolicy({
      provider: CHANNEL_ID,
      accountId: account.accountId,
      dmPolicy,
      readStore: pairing.readStoreForDmPolicy,
    }),
  );

  const allowTextCommands = core.channel.commands.shouldHandleTextCommands({
    cfg: config,
    surface: CHANNEL_ID,
  });
  const useAccessGroups = (config.commands ?? {}).useAccessGroups !== false;
  const hasControlCommand = core.channel.text.hasControlCommand(rawBody, config);

  const access = resolveDmGroupAccessWithCommandGate({
    isGroup,
    dmPolicy,
    groupPolicy,
    allowFrom: configAllowFrom,
    groupAllowFrom: configGroupAllowFrom,
    storeAllowFrom,
    isSenderAllowed: (allowFrom) => isSenderAllowed(allowFrom, senderId),
    command: {
      useAccessGroups,
      allowTextCommands,
      hasControlCommand,
    },
  });

  if (isGroup) {
    if (access.decision !== "allow") {
      runtime.log?.(`easyclaw: drop group sender ${senderId} (reason=${access.reason})`);
      return;
    }
    if (requireMention && !mentionState.mentionedBot) {
      runtime.log?.(`easyclaw: group ${event.group_id} message did not mention bot, ignoring`);
      return;
    }
  } else if (access.decision !== "allow") {
    if (access.decision === "pairing") {
      const { code, created } = await pairing.upsertPairingRequest({
        id: senderId,
        meta: { name: senderName || undefined },
      });
      if (created) {
        await transport.sendReply({
          eventId: event.event_id,
          content: core.channel.pairing.buildPairingReply({
            channel: CHANNEL_ID,
            idLine: `Your openclaw(chinese) user id: ${senderId}`,
            code,
          }),
          msgType: "text",
        });
        statusSink?.({ lastOutboundAt: Date.now() });
      }
    }
    runtime.log?.(`easyclaw: drop DM sender ${senderId} (reason=${access.reason})`);
    return;
  }

  if (access.shouldBlockControlCommand) {
    logInboundDrop({
      log: (message) => runtime.log?.(message),
      channel: CHANNEL_ID,
      reason: "control command (unauthorized)",
      target: senderId,
    });
    return;
  }

  const route = core.channel.routing.resolveAgentRoute({
    cfg: config,
    channel: CHANNEL_ID,
    accountId: account.accountId,
    peer: {
      kind: isGroup ? "group" : "direct",
      id: peerId,
    },
  });

  const fromLabel = isGroup
    ? `${event.group_name || `Group ${event.group_id}`}:${senderName}`
    : senderName;
  const storePath = core.channel.session.resolveStorePath(
    config.session?.store,
    {
      agentId: route.agentId,
    },
  );
  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(config);
  const previousTimestamp = core.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });
  const body = core.channel.reply.formatAgentEnvelope({
    channel: "openclaw中文版",
    from: fromLabel,
    timestamp: Date.now(),
    previousTimestamp,
    envelope: envelopeOptions,
    body: bodyForAgent,
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: bodyForAgent,
    RawBody: rawBody,
    CommandBody: bodyForAgent,
    From: `easyclaw:${senderId}`,
    To: isGroup ? `easyclaw:group:${event.group_id}` : `easyclaw:bot:${event.bot_id}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: isGroup ? "group" : "direct",
    ConversationLabel: isGroup ? event.group_name || `Group ${event.group_id}` : senderName,
    SenderName: senderName || undefined,
    SenderId: senderId,
    GroupSubject: isGroup ? event.group_name || `Group ${event.group_id}` : undefined,
    Provider: CHANNEL_ID,
    Surface: CHANNEL_ID,
    MessageSid: String(event.inbound_message_id ?? event.event_id),
    Timestamp: Date.now(),
    OriginatingChannel: CHANNEL_ID,
    OriginatingTo: `easyclaw:bot:${event.bot_id}`,
    CommandAuthorized: access.commandAuthorized,
    WasMentioned: mentionState.mentionedBot,
  });

  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
    ctx: ctxPayload,
    onRecordError: (err) => {
      runtime.error?.(`easyclaw: failed updating session meta: ${String(err)}`);
    },
  });

  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg: config,
    agentId: route.agentId,
    channel: CHANNEL_ID,
    accountId: account.accountId,
  });
  const deliverReply = createNormalizedOutboundDeliverer(async (payload) => {
    await deliverBridgeReply({
      payload,
      transport,
      eventId: event.event_id,
      statusSink,
    });
  });

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config,
    dispatcherOptions: {
      ...prefixOptions,
      deliver: deliverReply,
      onError: (err, info) => {
        runtime.error?.(`easyclaw ${info.kind} reply failed: ${String(err)}`);
      },
    },
    replyOptions: {
      onModelSelected,
      disableBlockStreaming: false,
    },
  });
}
