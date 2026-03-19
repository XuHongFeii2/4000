import { createDedupeCache } from "openclaw/plugin-sdk";
import WebSocket from "ws";
import { resolveBridgeAccount } from "./accounts.js";
import { handleBridgeInbound } from "./inbound.js";

const RECENT_EVENT_TTL_MS = 10 * 60 * 1000;
const RECENT_EVENT_MAX = 5000;

const recentEvents = createDedupeCache({
  ttlMs: RECENT_EVENT_TTL_MS,
  maxSize: RECENT_EVENT_MAX,
});

function delay(ms, abortSignal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (abortSignal) {
      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      abortSignal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

function joinApiBase(serverUrl) {
  return `${serverUrl.replace(/\/+$/, "")}/api/v1/openclaw/bridge`;
}

function buildWsUrl(serverUrl, account) {
  const base = new URL(joinApiBase(serverUrl));
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = `${base.pathname}/ws`;
  base.searchParams.set("device_id", account.deviceId);
  base.searchParams.set("device_token", account.deviceToken);
  return base.toString();
}

function buildHttpUrl(serverUrl, path) {
  return `${joinApiBase(serverUrl)}${path}`;
}

function buildEventKey(account, event) {
  const eventId = Number(event.event_id);
  const inboundMessageId =
    event.inbound_message_id === null || event.inbound_message_id === undefined
      ? ""
      : String(event.inbound_message_id);
  return [
    account.accountId,
    account.deviceId,
    Number.isFinite(eventId) ? String(eventId) : "invalid",
    inboundMessageId,
  ].join(":");
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

class BridgeTransport {
  constructor(account, { setStatus, runtime }) {
    this.account = account;
    this.setStatus = setStatus;
    this.runtime = runtime;
    this.ws = null;
  }

  isWsOpen() {
    return Boolean(this.ws && this.ws.readyState === WebSocket.OPEN);
  }

  async sendJson(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("openclaw中文版桥接 WebSocket 未连接");
    }

    await new Promise((resolve, reject) => {
      this.ws.send(JSON.stringify(payload), (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  async sendReply({ eventId, content, msgType = "text" }) {
    const response = await fetch(buildHttpUrl(this.account.serverUrl, "/reply"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        device_id: this.account.deviceId,
        device_token: this.account.deviceToken,
        event_id: eventId,
        content,
        msg_type: msgType,
      }),
    });

    if (!response.ok) {
      const errorPayload = await parseJsonResponse(response);
      throw new Error(
        `openclaw中文版回复失败: ${response.status} ${errorPayload.detail ?? response.statusText}`,
      );
    }
  }

  async fetchInbound({ limit }) {
    const url = new URL(buildHttpUrl(this.account.serverUrl, "/inbound"));
    url.searchParams.set("device_id", this.account.deviceId);
    url.searchParams.set("device_token", this.account.deviceToken);
    url.searchParams.set("limit", String(limit));

    const response = await fetch(url.toString(), {
      method: "GET",
    });

    if (!response.ok) {
      const errorPayload = await parseJsonResponse(response);
      throw new Error(
        `openclaw中文版入站轮询失败: ${response.status} ${errorPayload.detail ?? response.statusText}`,
      );
    }

    const payload = await parseJsonResponse(response);
    return Array.isArray(payload.events) ? payload.events : [];
  }

  async open({ abortSignal, onEvent }) {
    const url = buildWsUrl(this.account.serverUrl, this.account);
    const ws = new WebSocket(url);
    this.ws = ws;

    await new Promise((resolve, reject) => {
      const cleanup = () => {
        ws.off("open", handleOpen);
        ws.off("error", handleError);
      };
      const handleOpen = () => {
        cleanup();
        resolve();
      };
      const handleError = (error) => {
        cleanup();
        reject(error);
      };
      ws.once("open", handleOpen);
      ws.once("error", handleError);
      abortSignal?.addEventListener(
        "abort",
        () => {
          cleanup();
          try {
            ws.close();
          } catch {
            // Ignore close errors during abort.
          }
          reject(new Error("Bridge connection aborted"));
        },
        { once: true },
      );
    });

    this.setStatus?.({
      connected: true,
      lastConnectAt: Date.now(),
      lastError: null,
    });

    return await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error = null) => {
        if (settled) {
          return;
        }
        settled = true;
        ws.removeAllListeners();
        this.ws = null;
        this.setStatus?.({
          connected: false,
          lastDisconnectAt: Date.now(),
        });
        if (error) {
          reject(error);
          return;
        }
        resolve();
      };

      ws.on("message", (data) => {
        const raw = data.toString();
        let message;
        try {
          message = JSON.parse(raw);
        } catch {
          this.runtime.log?.(`easyclaw: ignore invalid bridge frame: ${raw}`);
          return;
        }

        if (message.type === "ready") {
          this.runtime.log?.(`easyclaw: bridge ready for device ${message.device_id ?? this.account.deviceId}`);
          return;
        }

        if (message.type === "reply_result" || message.type === "moment_result" || message.type === "pong") {
          return;
        }

        if (message.type === "error") {
          this.runtime.error?.(`easyclaw bridge error: ${message.message ?? "unknown error"}`);
          return;
        }

        const events = Array.isArray(message.events) ? message.events : [];
        for (const event of events) {
          onEvent(event);
        }
      });

      ws.on("close", () => finish());
      ws.on("error", (error) => finish(error));
      abortSignal?.addEventListener(
        "abort",
        () => {
          try {
            ws.close();
          } catch {
            // Ignore close errors during abort.
          }
          finish();
        },
        { once: true },
      );
    });
  }
}

async function runInboundPollLoop({
  abortSignal,
  transport,
  onEvent,
  runtime,
  pollIntervalMs,
  batchSize,
}) {
  while (!abortSignal?.aborted) {
    try {
      const events = await transport.fetchInbound({ limit: batchSize });
      for (const event of events) {
        onEvent(event);
      }
    } catch (error) {
      if (!abortSignal?.aborted) {
        runtime.error?.(`easyclaw inbound poll failed: ${String(error)}`);
      }
    }

    await delay(pollIntervalMs, abortSignal);
  }
}

export async function monitorBridgeProvider({
  config,
  runtime,
  abortSignal,
  accountId,
  setStatus,
}) {
  const account = resolveBridgeAccount({ cfg: config, accountId });
  if (!account.enabled || !account.configured) {
    throw new Error(`openclaw中文版账号 "${account.accountId}" 未配置或已禁用`);
  }

  const transport = new BridgeTransport(account, { setStatus, runtime });
  const inflightEvents = new Set();
  const reconnectDelayMs = account.config.pollIntervalMs ?? 3000;
  const batchSize = account.config.batchSize ?? 20;

  const handleEvent = (event) => {
    const eventId = Number(event.event_id);
    const eventKey = buildEventKey(account, event);
    if (!Number.isFinite(eventId) || inflightEvents.has(eventKey) || recentEvents.check(eventKey)) {
      return;
    }

    inflightEvents.add(eventKey);
    Promise.resolve(
      handleBridgeInbound({
        event,
        account,
        config,
        runtime,
        transport,
        statusSink: setStatus,
      }),
    )
      .catch((error) => {
        runtime.error?.(`easyclaw inbound handling failed for event ${eventId}: ${String(error)}`);
        setStatus?.({
          lastError: String(error),
        });
      })
      .finally(() => {
        inflightEvents.delete(eventKey);
      });
  };

  const pollLoop = runInboundPollLoop({
    abortSignal,
    transport,
    onEvent: handleEvent,
    runtime,
    pollIntervalMs: reconnectDelayMs,
    batchSize,
  });

  while (!abortSignal?.aborted) {
    try {
      await transport.open({
        abortSignal,
        onEvent: handleEvent,
      });
    } catch (error) {
      if (abortSignal?.aborted) {
        break;
      }
      runtime.error?.(`easyclaw bridge disconnected: ${String(error)}`);
      setStatus?.({
        connected: false,
        lastError: String(error),
      });
      await delay(reconnectDelayMs, abortSignal);
    }
  }

  await pollLoop;
}
