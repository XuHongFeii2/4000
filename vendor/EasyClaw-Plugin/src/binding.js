import os from "os";
import path from "path";
import { createRequire } from "module";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import { CHANNEL_ID, LEGACY_CHANNEL_ID, normalizeServerUrl } from "./accounts.js";
import { clearPersistedBinding, persistBinding, readPersistedBinding } from "./state.js";

const require = createRequire(import.meta.url);
const JSON5 = require("json5");
const QRCode = require("qrcode-terminal/vendor/QRCode/index.js");
const QRErrorCorrectLevel = require("qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel.js");
const qrcodeTerminal = require("qrcode-terminal");
const { deflateSync } = require("zlib");

const DEFAULT_SERVER_URL = "http://app.easyclaw.bar";
const POLL_INTERVAL_MS = 2000;
const DEFAULT_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

const activeBindings = new Map();

function resolveOpenClawStateDir(env = process.env) {
  const override = env.OPENCLAW_STATE_DIR?.trim() || env.CLAWDBOT_STATE_DIR?.trim();
  if (override) {
    return override;
  }
  return path.join(os.homedir(), ".openclaw");
}

function resolveConfigPath(env = process.env) {
  const explicitPath = env.OPENCLAW_CONFIG_PATH?.trim();
  if (explicitPath) {
    return explicitPath;
  }
  return path.join(resolveOpenClawStateDir(env), "openclaw.json");
}

function readConfiguredServerUrl() {
  try {
    const raw = require("fs").readFileSync(resolveConfigPath(), "utf8");
    const parsed = JSON5.parse(raw);
    return normalizeServerUrl(
      parsed?.channels?.[CHANNEL_ID]?.serverUrl ?? parsed?.channels?.[LEGACY_CHANNEL_ID]?.serverUrl,
    );
  } catch {
    return "";
  }
}

function resolveServerUrl() {
  const persisted = readPersistedBinding(DEFAULT_ACCOUNT_ID);
  return (
    normalizeServerUrl(process.env.EASYCLAW_SERVER_URL) ||
    normalizeServerUrl(process.env.CLAWX_IM_SERVER_URL) ||
    normalizeServerUrl(process.env.CLAWX_SERVER_URL) ||
    readConfiguredServerUrl() ||
    normalizeServerUrl(persisted?.serverUrl) ||
    normalizeServerUrl(DEFAULT_SERVER_URL)
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildBindingPayload(token, serverUrl) {
  const params = new URLSearchParams({
    token,
    server: serverUrl,
    channel: CHANNEL_ID,
  });
  return `easyclaw://bind?${params.toString()}`;
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const detail =
      (payload && typeof payload.detail === "string" && payload.detail) || response.statusText;
    throw new Error(`${response.status} ${detail}`.trim());
  }

  return payload ?? {};
}

async function requestBindingToken(serverUrl) {
  const url = new URL("/api/v1/binding/generate-code", serverUrl);
  url.searchParams.set("device_info", "OpenClaw");
  url.searchParams.set("channel_type", CHANNEL_ID);

  const payload = await fetchJson(url.toString(), { method: "GET" });
  const token = String(payload.connection_token ?? "").trim();
  if (!token) {
    throw new Error("Binding token missing from backend response.");
  }
  return token;
}

function createQrMatrix(input) {
  const qr = new QRCode(-1, QRErrorCorrectLevel.L);
  qr.addData(input);
  qr.make();
  return qr;
}

function fillPixel(buf, x, y, width, r, g, b, a = 255) {
  const idx = (y * width + x) * 4;
  buf[idx] = r;
  buf[idx + 1] = g;
  buf[idx + 2] = b;
  buf[idx + 3] = a;
}

function crcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let j = 0; j < 8; j += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
}

const CRC_TABLE = crcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function encodePngRgba(buffer, width, height) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let row = 0; row < height; row += 1) {
    const offset = row * (stride + 1);
    raw[offset] = 0;
    buffer.copy(raw, offset + 1, row * stride, row * stride + stride);
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    signature,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function renderQrDataUrl(rawPayload) {
  const qr = createQrMatrix(rawPayload);
  const moduleCount = qr.getModuleCount();
  const scale = 6;
  const margin = 4;
  const size = (moduleCount + margin * 2) * scale;
  const buffer = Buffer.alloc(size * size * 4, 255);

  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount; col += 1) {
      if (!qr.isDark(row, col)) {
        continue;
      }

      const startX = (col + margin) * scale;
      const startY = (row + margin) * scale;
      for (let y = 0; y < scale; y += 1) {
        for (let x = 0; x < scale; x += 1) {
          fillPixel(buffer, startX + x, startY + y, size, 0, 0, 0, 255);
        }
      }
    }
  }

  return `data:image/png;base64,${encodePngRgba(buffer, size, size).toString("base64")}`;
}

function resolveBindingAccountId(accountId) {
  return typeof accountId === "string" && accountId.trim() ? accountId.trim() : DEFAULT_ACCOUNT_ID;
}

function getActiveBinding(accountId) {
  const binding = activeBindings.get(accountId);
  if (!binding) {
    return null;
  }
  if (Date.now() >= binding.deadlineAt) {
    activeBindings.delete(accountId);
    return null;
  }
  return binding;
}

function setActiveBinding(accountId, binding) {
  activeBindings.set(accountId, binding);
  return binding;
}

function clearActiveBinding(accountId) {
  activeBindings.delete(accountId);
}

export async function startBindingQrLogin({ accountId, force, timeoutMs, serverUrl } = {}) {
  const resolvedAccountId = resolveBindingAccountId(accountId);
  const effectiveTimeoutMs =
    typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : DEFAULT_LOGIN_TIMEOUT_MS;

  if (!force) {
    const existing = getActiveBinding(resolvedAccountId);
    if (existing) {
      return {
        qrDataUrl: existing.qrDataUrl,
        message: "Scan the QR code in the 龙虾APP mobile app.",
        rawPayload: existing.rawPayload,
      };
    }
  }

  const resolvedServerUrl = normalizeServerUrl(serverUrl) || resolveServerUrl();
  if (!resolvedServerUrl) {
    throw new Error(
      "Missing 龙虾APP server URL. Set EASYCLAW_SERVER_URL or channels.easyclaw.serverUrl first.",
    );
  }

  const token = await requestBindingToken(resolvedServerUrl);
  const rawPayload = buildBindingPayload(token, resolvedServerUrl);
  const qrDataUrl = renderQrDataUrl(rawPayload);

  setActiveBinding(resolvedAccountId, {
    accountId: resolvedAccountId,
    token,
    serverUrl: resolvedServerUrl,
    rawPayload,
    qrDataUrl,
    deadlineAt: Date.now() + effectiveTimeoutMs,
  });

  return {
    qrDataUrl,
    message: "Scan the QR code in the 龙虾APP mobile app.",
    rawPayload,
  };
}

export async function waitForBindingQrLogin({ accountId, timeoutMs } = {}) {
  const resolvedAccountId = resolveBindingAccountId(accountId);
  const active = getActiveBinding(resolvedAccountId);
  if (!active) {
    return {
      connected: false,
      message: "No active 龙虾APP QR login session. Generate a QR code first.",
    };
  }

  const requestedDeadline =
    typeof timeoutMs === "number" && timeoutMs > 0 ? Date.now() + timeoutMs : active.deadlineAt;
  const deadlineAt = Math.min(active.deadlineAt, requestedDeadline);

  while (Date.now() < deadlineAt) {
    try {
      const statusUrl = new URL(`/api/v1/binding/check-status/${active.token}`, active.serverUrl);
      const payload = await fetchJson(statusUrl.toString(), { method: "GET" });
      const status = String(payload.status ?? "").trim().toLowerCase();

      if (status === "bound") {
        const deviceId = String(payload.device_id ?? "").trim();
        const deviceToken = String(payload.device_token ?? "").trim();
        if (!deviceId || !deviceToken) {
          clearActiveBinding(resolvedAccountId);
          return {
            connected: false,
            message: "Binding completed but backend did not return device credentials.",
          };
        }

        await persistBinding(resolvedAccountId, {
          serverUrl: active.serverUrl,
          deviceId,
          deviceToken,
          botId: typeof payload.bot_id === "number" ? payload.bot_id : undefined,
          name: typeof payload.bot_name === "string" ? payload.bot_name.trim() : undefined,
          userEmail: typeof payload.user_email === "string" ? payload.user_email.trim() : undefined,
        });

        clearActiveBinding(resolvedAccountId);
        return {
          connected: true,
          message: "龙虾APP binding completed.",
        };
      }

      if (status === "expired" || status === "failed") {
        clearActiveBinding(resolvedAccountId);
        return {
          connected: false,
          message: `Binding ${status}. Generate a new QR code and retry.`,
        };
      }
    } catch (error) {
      clearActiveBinding(resolvedAccountId);
      return {
        connected: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }

    await sleep(POLL_INTERVAL_MS);
  }

  clearActiveBinding(resolvedAccountId);
  return {
    connected: false,
    message: "Binding timed out. Generate a new QR code and retry.",
  };
}

export async function loginWithTerminalQr({ accountId, runtime, timeoutMs, serverUrl }) {
  const started = await startBindingQrLogin({ accountId, force: true, timeoutMs, serverUrl });
  runtime.log?.("Scan this QR code with the 龙虾APP mobile app:");
  qrcodeTerminal.generate(started.rawPayload, { small: true });
  runtime.log?.(`If the QR code does not render, open: ${started.rawPayload}`);

  const result = await waitForBindingQrLogin({ accountId, timeoutMs });
  if (!result.connected) {
    throw new Error(result.message);
  }
  runtime.log?.(result.message);
}

export async function logoutBinding(accountId) {
  const resolvedAccountId = resolveBindingAccountId(accountId);
  clearActiveBinding(resolvedAccountId);
  return await clearPersistedBinding(resolvedAccountId);
}
