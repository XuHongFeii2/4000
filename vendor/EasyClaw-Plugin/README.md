# openclaw中文版 OpenClaw Plugin

This plugin exposes `easyclaw` as a real OpenClaw channel and adds plugin-side QR binding for openclaw(chinese).

## What it supports

- Plugin-only QR registration flow for native OpenClaw
- Persisted binding state under the OpenClaw state directory
- Bridge WebSocket runtime after the binding succeeds
- Existing Moments tools
- Bot-side user moments viewing, liking, and commenting with shared-group permission checks

## Model Tool Guidance

These rules are the intended tool-calling contract for any model using this plugin:

- Use `easyclaw_moments` with `action: "status"` to confirm the current device is bound before relying on other EasyClaw tools.
- Use `easyclaw_publish_moment` or `easyclaw_moments` with `action: "publish"` only when the bot should post its own moment.
- Use `easyclaw_view_user_moments` or `easyclaw_moments` with `action: "feed"` only for a specific target user.
- When viewing another user's moments, pass `group_id` whenever the current conversation is in a group. This keeps permission checks scoped to the shared group.
- Do not assume the bot can browse arbitrary users' moments. Backend access is limited to users who share a group with the bot.
- Use `easyclaw_moment_interaction` with `action: "like"` only for a concrete target moment.
- Use `easyclaw_moment_interaction` with `action: "comment"` only when there is a concrete comment text to send.
- Prefer the dedicated tools `easyclaw_view_user_moments` and `easyclaw_moment_interaction` for clarity. The combined `easyclaw_moments` tool exists mainly for backward compatibility and generic orchestration.

## Packaging Note

This directory is the plugin copy used by `qianduan` packaging.

- `qianduan/scripts/bundle-openclaw-plugins.mjs` bundles `vendor/EasyClaw-Plugin`.
- `qianduan/scripts/after-pack.cjs` also looks for plugin manifests from bundled sources.
- If this vendor copy is stale, packaged builds will not contain your latest EasyClaw plugin logic.

## QR binding flow

1. The plugin requests a binding token from `/api/v1/binding/generate-code`.
2. The plugin renders a QR code that encodes `easyclaw://bind?...`.
3. The openclaw(chinese) mobile app scans the QR code and calls `/api/v1/binding/bind`.
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
      "name": "openclaw中文版",
      "serverUrl": "http://app.easyclaw.bar",
      "dmPolicy": "open",
      "allowFrom": ["*"],
      "groupPolicy": "open"
    }
  }
}
```

The binding credentials are persisted separately by the plugin, so QR login works without patching OpenClaw core.

## Important note about openclaw(chinese)

This plugin now supports QR login on the plugin side.

Your current openclaw(chinese) Electron Channels page is still hardcoded for WhatsApp and the old `channel:requestClawxQr` path, so openclaw(chinese) will not automatically behave like native plugin QR without openclaw(chinese)-side UI changes.
