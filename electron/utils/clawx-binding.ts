import { EventEmitter } from 'events';
import { dirname, join } from 'path';
import { createRequire } from 'module';
import { getOpenClawDir, getOpenClawResolvedDir } from './paths';

const require = createRequire(import.meta.url);

const CLAWX_SERVER_URL = 'http://app.easyclaw.bar';
const CHANNEL_TYPE = 'easyclaw';
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

const openclawPath = getOpenClawDir();
const openclawResolvedPath = getOpenClawResolvedDir();
const openclawRequire = createRequire(join(openclawResolvedPath, 'package.json'));

function resolveOpenClawPackageJson(packageName: string): string {
  const specifier = `${packageName}/package.json`;
  try {
    return openclawRequire.resolve(specifier);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to resolve "${packageName}" from OpenClaw context. ` +
      `openclawPath=${openclawPath}, resolvedPath=${openclawResolvedPath}. ${reason}`,
      { cause: err }
    );
  }
}

const qrcodeTerminalPath = dirname(resolveOpenClawPackageJson('qrcode-terminal'));
const QRCodeModule = require(join(qrcodeTerminalPath, 'vendor', 'QRCode', 'index.js'));
const QRErrorCorrectLevelModule = require(join(qrcodeTerminalPath, 'vendor', 'QRCode', 'QRErrorCorrectLevel.js'));
const QRCode = QRCodeModule;
const QRErrorCorrectLevel = QRErrorCorrectLevelModule;

function createQrMatrix(input: string) {
  const qr = new QRCode(-1, QRErrorCorrectLevel.L);
  qr.addData(input);
  qr.make();
  return qr;
}

function fillPixel(
  buf: Buffer,
  x: number,
  y: number,
  width: number,
  r: number,
  g: number,
  b: number,
  a = 255,
) {
  const idx = (y * width + x) * 4;
  buf[idx] = r;
  buf[idx + 1] = g;
  buf[idx + 2] = b;
  buf[idx + 3] = a;
}

function crcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = crcTable();

function crc32(buf: Buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePngRgba(buffer: Buffer, width: number, height: number) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const rawOffset = row * (stride + 1);
    raw[rawOffset] = 0;
    buffer.copy(raw, rawOffset + 1, row * stride, row * stride + stride);
  }
  const { deflateSync } = require('zlib');
  const compressed = deflateSync(raw);

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function renderQrPngBase64(input: string): Promise<string> {
  const scale = 6;
  const marginModules = 4;
  const qr = createQrMatrix(input);
  const modules = qr.getModuleCount();
  const size = (modules + marginModules * 2) * scale;

  const buf = Buffer.alloc(size * size * 4, 255);
  for (let row = 0; row < modules; row += 1) {
    for (let col = 0; col < modules; col += 1) {
      if (!qr.isDark(row, col)) {
        continue;
      }
      const startX = (col + marginModules) * scale;
      const startY = (row + marginModules) * scale;
      for (let y = 0; y < scale; y += 1) {
        const pixelY = startY + y;
        for (let x = 0; x < scale; x += 1) {
          const pixelX = startX + x;
          fillPixel(buf, pixelX, pixelY, size, 0, 0, 0, 255);
        }
      }
    }
  }

  return encodePngRgba(buf, size, size).toString('base64');
}

type BindingStartResult = {
  token: string;
  qr: string;
  raw: string;
};

type BindingSuccessResult = {
  serverUrl: string;
  deviceId: string;
  deviceToken: string;
  botId?: number;
  botName?: string;
  userEmail?: string;
};

export class ClawxBindingManager extends EventEmitter {
  private active = false;
  private currentToken: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private deadlineAt = 0;

  async start(): Promise<BindingStartResult> {
    if (this.active && this.currentToken) {
      const raw = this.buildBindingPayload(this.currentToken);
      const qr = await renderQrPngBase64(raw);
      this.emit('qr', { qr, raw });
      return { token: this.currentToken, qr, raw };
    }

    await this.stop();
    const token = await this.generateBindingToken();
    const raw = this.buildBindingPayload(token);
    const qr = await renderQrPngBase64(raw);

    this.active = true;
    this.currentToken = token;
    this.deadlineAt = Date.now() + POLL_TIMEOUT_MS;
    this.emit('qr', { qr, raw });
    this.schedulePoll();
    return { token, qr, raw };
  }

  async stop(): Promise<void> {
    this.active = false;
    this.currentToken = null;
    this.deadlineAt = 0;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private buildBindingPayload(token: string): string {
    const params = new URLSearchParams({
      token,
      server: CLAWX_SERVER_URL,
      channel: CHANNEL_TYPE,
    });
    return `easyclaw://bind?${params.toString()}`;
  }

  private async generateBindingToken(): Promise<string> {
    const url = new URL('/api/v1/binding/generate-code', CLAWX_SERVER_URL);
    url.searchParams.set('device_info', 'EasyClaw');
    url.searchParams.set('channel_type', CHANNEL_TYPE);

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Failed to generate binding code: HTTP ${response.status}`);
    }

    const payload = await response.json() as { connection_token?: string };
    const token = String(payload.connection_token ?? '').trim();
    if (!token) {
      throw new Error('Binding token missing from backend response');
    }
    return token;
  }

  private schedulePoll(): void {
    if (!this.active) {
      return;
    }
    this.timer = setTimeout(() => {
      void this.pollStatus();
    }, POLL_INTERVAL_MS);
  }

  private async pollStatus(): Promise<void> {
    if (!this.active || !this.currentToken) {
      return;
    }

    if (Date.now() >= this.deadlineAt) {
      this.emit('error', '绑定超时，请重新生成二维码');
      await this.stop();
      return;
    }

    try {
      const response = await fetch(`${CLAWX_SERVER_URL}/api/v1/binding/check-status/${this.currentToken}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json() as {
        status?: string;
        user_email?: string;
        device_id?: string;
        device_token?: string;
        bot_id?: number;
        bot_name?: string;
      };

      if (payload.status === 'bound') {
        const deviceId = String(payload.device_id ?? '').trim();
        const deviceToken = String(payload.device_token ?? '').trim();
        if (!deviceId || !deviceToken) {
          throw new Error('绑定成功但后端未返回设备凭据');
        }

        const result: BindingSuccessResult = {
          serverUrl: CLAWX_SERVER_URL,
          deviceId,
          deviceToken,
          botId: typeof payload.bot_id === 'number' ? payload.bot_id : undefined,
          botName: payload.bot_name ? String(payload.bot_name) : undefined,
          userEmail: payload.user_email ? String(payload.user_email) : undefined,
        };
        this.emit('success', result);
        await this.stop();
        return;
      }
    } catch (error) {
      this.emit('error', error instanceof Error ? error.message : String(error));
      await this.stop();
      return;
    }

    this.schedulePoll();
  }
}

export const CLAWX_BINDING_SERVER_URL = CLAWX_SERVER_URL;
export const clawxBindingManager = new ClawxBindingManager();
