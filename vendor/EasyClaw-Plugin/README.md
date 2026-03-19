# 龙虾APP OpenClaw Plugin

This plugin exposes `easyclaw` as a real OpenClaw channel and adds plugin-side QR binding for 龙虾APP.

## What it supports

- Plugin-only QR registration flow for native OpenClaw
- Persisted binding state under the OpenClaw state directory
- Bridge WebSocket runtime after the binding succeeds
- Existing Moments tools

## QR binding flow

1. The plugin requests a binding token from `/api/v1/binding/generate-code`.
2. The plugin renders a QR code that encodes `easyclaw://bind?...`.
3. The 龙虾APP mobile app scans the QR code and calls `/api/v1/binding/bind`.
4. The plugin polls `/api/v1/binding/check-status/{token}`.
5. When binding succeeds, the plugin persists `serverUrl`, `deviceId`, and `deviceToken`.
6. OpenClaw starts the channel with the saved credentials.

## Server URL resolution

The plugin resolves the backend address in this order:

1. `CLAWX_IM_SERVER_URL`
2. `CLAWX_SERVER_URL`
3. `channels.easyclaw.serverUrl` from `openclaw.json` (falls back to legacy `channels.clawx-im.serverUrl`)
4. Previously persisted binding state
5. Fallback default: `http://app.easyclaw.bar`

If you want a different backend, set `EASYCLAW_SERVER_URL` or configure `channels.easyclaw.serverUrl`.

## Config shape

Channel config now lives under `channels.easyclaw`:

```json
{
  "channels": {
    "easyclaw": {
      "enabled": true,
      "name": "龙虾APP",
      "serverUrl": "http://app.easyclaw.bar",
      "dmPolicy": "open",
      "allowFrom": ["*"],
      "groupPolicy": "open"
    }
  }
}
```

The binding credentials are persisted separately by the plugin, so QR login works without patching OpenClaw core.

## Important note about EasyClaw

This plugin now supports QR login on the plugin side.

Your current EasyClaw Electron Channels page is still hardcoded for WhatsApp and the old `channel:requestClawxQr` path, so EasyClaw will not automatically behave like native plugin QR without EasyClaw-side UI changes.
