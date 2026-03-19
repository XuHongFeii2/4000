#!/usr/bin/env python3
import argparse
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from uuid import uuid4


DEFAULT_WATCH_INTERVAL = "30s"
DEFAULT_SESSION_STATE_PATH = Path.home() / ".openclaw" / "agents" / "main" / "sessions" / "sessions.json"
DEFAULT_OPENCLAW_CONFIG_PATH = Path.home() / ".openclaw" / "openclaw.json"
CONVERSATION_INFO_PATTERN = re.compile(
    r"Conversation info \(untrusted metadata\):\s*```json\s*(\{.*?\})\s*```",
    re.DOTALL,
)


class WatchSchedulingError(RuntimeError):
    pass


def _read_json_file(path: Path) -> dict | list | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _parse_json_response(response):
    raw = response.read()
    if not raw:
        return None
    text = raw.decode("utf-8")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"raw": text}


def _unique_paths(paths: list[Path]) -> list[Path]:
    seen: set[str] = set()
    result: list[Path] = []
    for path in paths:
        try:
            key = str(path.resolve()).lower()
        except OSError:
            key = str(path).lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(path)
    return result


def _candidate_install_dirs() -> list[Path]:
    candidates: list[Path] = []

    configured_install_dir = os.environ.get("OPENCLAW_INSTALL_DIR", "").strip()
    if configured_install_dir:
        candidates.append(Path(configured_install_dir))

    local_app_data = os.environ.get("LOCALAPPDATA", "").strip()
    if local_app_data:
        candidates.append(Path(local_app_data) / "Programs" / "openclaw中文版")
        candidates.append(Path(local_app_data) / "Programs" / "openclaw-chinese")
        candidates.append(Path(local_app_data) / "Programs" / "EasyClaw")

    for executable_name in ("openclaw.cmd", "openclaw", "openclaw-chinese.exe", "EasyClaw.exe", "ClawX.exe"):
        resolved = shutil.which(executable_name)
        if not resolved:
            continue
        resolved_path = Path(resolved)
        if resolved_path.name.lower() in {"openclaw-chinese.exe", "easyclaw.exe", "clawx.exe"}:
            candidates.append(resolved_path.parent)
            continue
        if resolved_path.name.lower() == "openclaw.cmd" and len(resolved_path.parents) >= 3:
            candidates.append(resolved_path.parents[2])

    return _unique_paths(candidates)


def _install_dir_command_candidates(install_dir: Path) -> list[tuple[list[str], dict[str, str]]]:
    candidates: list[tuple[list[str], dict[str, str]]] = []
    openclaw_mjs = install_dir / "resources" / "openclaw" / "openclaw.mjs"
    openclaw_chinese_exe = install_dir / "openclaw-chinese.exe"
    easyclaw_exe = install_dir / "EasyClaw.exe"
    clawx_exe = install_dir / "ClawX.exe"
    openclaw_cmd = install_dir / "resources" / "cli" / "openclaw.cmd"

    if openclaw_mjs.exists():
        if openclaw_chinese_exe.exists():
            candidates.append(
                (
                    [str(openclaw_chinese_exe), str(openclaw_mjs)],
                    {
                        "ELECTRON_RUN_AS_NODE": "1",
                        "OPENCLAW_EMBEDDED_IN": "openclaw中文版",
                    },
                )
            )
        if easyclaw_exe.exists():
            candidates.append(
                (
                    [str(easyclaw_exe), str(openclaw_mjs)],
                    {
                        "ELECTRON_RUN_AS_NODE": "1",
                        "OPENCLAW_EMBEDDED_IN": "EasyClaw",
                    },
                )
            )
        if clawx_exe.exists():
            candidates.append(
                (
                    [str(clawx_exe), str(openclaw_mjs)],
                    {
                        "ELECTRON_RUN_AS_NODE": "1",
                        "OPENCLAW_EMBEDDED_IN": "ClawX",
                    },
                )
            )
        candidates.append((["node", str(openclaw_mjs)], {}))
    if openclaw_cmd.exists():
        candidates.append(([str(openclaw_cmd)], {}))
    return candidates


def _openclaw_command_candidates() -> list[tuple[list[str], dict[str, str]]]:
    candidates: list[tuple[list[str], dict[str, str]]] = []
    raw = os.environ.get("OPENCLAW_BIN", "").strip()
    if raw:
        candidates.append((shlex.split(raw, posix=os.name != "nt"), {}))
    for install_dir in _candidate_install_dirs():
        candidates.extend(_install_dir_command_candidates(install_dir))
    candidates.append((["openclaw"], {}))
    return candidates


def _openclaw_base_command() -> list[str]:
    return _openclaw_command_candidates()[0][0]


def _looks_like_launcher_failure(result: subprocess.CompletedProcess[str]) -> bool:
    error_text = " ".join(part for part in ((result.stderr or "").strip(), (result.stdout or "").strip()) if part).lower()
    failure_tokens = (
        "enablecompilecache",
        "does not provide an export named",
        "is not recognized as an internal or external command",
        "operable program or batch file",
        "no such file or directory",
        "cannot find the file specified",
        "missing dist/entry",
    )
    return any(token in error_text for token in failure_tokens)


def _run_openclaw(args: list[str]) -> subprocess.CompletedProcess[str]:
    last_result: subprocess.CompletedProcess[str] | None = None
    for base_command, extra_env in _openclaw_command_candidates():
        command = [*base_command, *args]
        env = os.environ.copy()
        env.update(extra_env)
        try:
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
                env=env,
            )
        except OSError:
            continue
        if result.returncode == 0:
            return result
        last_result = result
        if not _looks_like_launcher_failure(result):
            return result
    if last_result is not None:
        return last_result
    raise WatchSchedulingError("OpenClaw CLI is unavailable on this machine.")


def _extract_job_id(payload):
    if isinstance(payload, dict):
        for key in ("id", "jobId", "job_id"):
            value = payload.get(key)
            if value not in (None, ""):
                return str(value)
        for value in payload.values():
            found = _extract_job_id(value)
            if found:
                return found
    if isinstance(payload, list):
        for item in payload:
            found = _extract_job_id(item)
            if found:
                return found
    return None


def _parse_json_output(text: str):
    content = (text or "").strip()
    if not content:
        return None
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass
    lines = [line for line in content.splitlines() if line.strip()]
    for start in range(len(lines)):
        candidate = "\n".join(lines[start:])
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue
    return None


def _find_job_id_by_name(name: str) -> str | None:
    result = _run_openclaw(["cron", "list", "--all", "--json"])
    if result.returncode != 0:
        return None
    payload = _parse_json_output(result.stdout)
    items = []
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict):
        for key in ("items", "jobs", "data"):
            value = payload.get(key)
            if isinstance(value, list):
                items = value
                break
    for item in items:
        if not isinstance(item, dict):
            continue
        if item.get("name") == name:
            job_id = item.get("jobId") or item.get("job_id") or item.get("id")
            if job_id not in (None, ""):
                return str(job_id)
    return None


def _duration_to_ms(value: str) -> int:
    raw = str(value or "").strip().lower()
    if not raw:
        raise WatchSchedulingError("Missing watcher interval.")
    match = re.fullmatch(r"(\d+)(ms|s|m|h|d)?", raw)
    if not match:
        raise WatchSchedulingError(f"Unsupported watcher interval: {value}")
    amount = int(match.group(1))
    unit = match.group(2) or "ms"
    multipliers = {
        "ms": 1,
        "s": 1000,
        "m": 60 * 1000,
        "h": 60 * 60 * 1000,
        "d": 24 * 60 * 60 * 1000,
    }
    return amount * multipliers[unit]


def _watcher_auth_args() -> list[str]:
    args: list[str] = []
    base_url = (
        os.environ.get("EASYCLAW_PLATFORM_BASE_URL", "").strip()
        or os.environ.get("CHANJING_PLATFORM_BASE_URL", "").strip()
    )
    platform_token = (
        os.environ.get("EASYCLAW_PLATFORM_API_TOKEN", "").strip()
        or os.environ.get("CHANJING_PLATFORM_API_TOKEN", "").strip()
    )
    api_key = (
        os.environ.get("EASYCLAW_PLATFORM_API_KEY", "").strip()
        or os.environ.get("CHANJING_PLATFORM_API_KEY", "").strip()
    )
    api_secret = (
        os.environ.get("EASYCLAW_PLATFORM_API_SECRET", "").strip()
        or os.environ.get("CHANJING_PLATFORM_API_SECRET", "").strip()
    )
    if base_url:
        args.extend(["--base-url", base_url])
    if platform_token:
        args.extend(["--api-token", platform_token])
        return args
    if api_key and api_secret:
        args.extend(["--api-key", api_key, "--api-secret", api_secret])
    return args


def _latest_non_cron_session_entry() -> dict[str, str] | None:
    state_path = Path(os.environ.get("OPENCLAW_SESSION_STATE_PATH", "").strip() or DEFAULT_SESSION_STATE_PATH)
    payload = _read_json_file(state_path)
    if isinstance(payload, dict):
        entries = list(payload.items())
    elif isinstance(payload, list):
        entries = list(enumerate(payload))
    else:
        return None
    candidates: list[dict[str, str | int]] = []
    for session_key, item in entries:
        if not isinstance(item, dict):
            continue
        session_key_text = str(session_key or "")
        if ":cron:" in session_key_text:
            continue
        delivery = item.get("deliveryContext")
        if not isinstance(delivery, dict):
            continue
        channel = str(delivery.get("channel") or "").strip()
        to = str(delivery.get("to") or "").strip()
        account_id = str(delivery.get("accountId") or "").strip()
        updated_at = int(item.get("updatedAt") or 0)
        if not channel:
            continue
        candidates.append(
            {
                "session_key": session_key_text,
                "channel": channel,
                "to": to,
                "account_id": account_id,
                "updated_at": updated_at,
                "session_file": str(item.get("sessionFile") or "").strip(),
            }
        )
    if not candidates:
        return None
    latest = max(candidates, key=lambda item: int(item.get("updated_at") or 0))
    return {
        "session_key": str(latest["session_key"]),
        "channel": str(latest["channel"]),
        "to": str(latest["to"]),
        "account_id": str(latest.get("account_id") or ""),
        "session_file": str(latest.get("session_file") or ""),
    }


def _resolve_delivery_target() -> dict[str, str] | None:
    latest = _latest_non_cron_session_entry()
    if latest is None:
        return None
    if not latest.get("channel") or not latest.get("to"):
        return None
    return {
        "channel": latest["channel"],
        "to": latest["to"],
        "account_id": latest.get("account_id") or "",
    }


def _extract_latest_conversation_info(session_file: str) -> dict | None:
    if not session_file:
        return None
    path = Path(session_file)
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    for line in reversed(lines[-80:]):
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if payload.get("type") != "message":
            continue
        message = payload.get("message") or {}
        if message.get("role") != "user":
            continue
        for item in message.get("content") or []:
            if not isinstance(item, dict) or item.get("type") != "text":
                continue
            text = str(item.get("text") or "")
            match = CONVERSATION_INFO_PATTERN.search(text)
            if not match:
                continue
            try:
                parsed = json.loads(match.group(1))
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict):
                return parsed
    return None


def _load_clawx_im_config() -> dict | None:
    payload = _read_json_file(DEFAULT_OPENCLAW_CONFIG_PATH)
    if not isinstance(payload, dict):
        return None
    channels = payload.get("channels")
    if not isinstance(channels, dict):
        return None
    clawx = channels.get("clawx-im")
    if not isinstance(clawx, dict):
        return None
    server_url = str(clawx.get("serverUrl") or "").strip()
    device_id = str(clawx.get("deviceId") or "").strip()
    device_token = str(clawx.get("deviceToken") or "").strip()
    if not server_url or not device_id or not device_token:
        return None
    return {
        "server_url": server_url.rstrip("/"),
        "device_id": device_id,
        "device_token": device_token,
    }


def _fetch_clawx_im_events(*, server_url: str, device_id: str, device_token: str, limit: int = 50) -> list[dict]:
    url = urllib.parse.urljoin(server_url.rstrip("/") + "/", "api/v1/openclaw/bridge/inbound")
    query = urllib.parse.urlencode(
        {
            "device_id": device_id,
            "device_token": device_token,
            "limit": str(limit),
        }
    )
    request = urllib.request.Request(f"{url}?{query}", method="GET")
    try:
        with urllib.request.urlopen(request) as response:
            payload = _parse_json_response(response)
    except urllib.error.HTTPError:
        return []
    except urllib.error.URLError:
        return []
    if not isinstance(payload, dict):
        return []
    events = payload.get("events")
    if not isinstance(events, list):
        return []
    return [item for item in events if isinstance(item, dict)]


def _resolve_clawx_im_reply_target() -> dict[str, str] | None:
    latest = _latest_non_cron_session_entry()
    if latest is None or latest.get("channel") != "clawx-im":
        return None
    conversation_info = _extract_latest_conversation_info(latest.get("session_file") or "")
    if not isinstance(conversation_info, dict):
        return None
    config = _load_clawx_im_config()
    if config is None:
        return None
    message_id = str(conversation_info.get("message_id") or "").strip()
    sender_id = str(conversation_info.get("sender_id") or "").strip()
    is_group = bool(conversation_info.get("is_group_chat"))
    if not message_id or not sender_id:
        return None
    expected_chat_type = "group" if is_group else "direct"
    events = _fetch_clawx_im_events(
        server_url=config["server_url"],
        device_id=config["device_id"],
        device_token=config["device_token"],
    )
    for event in events:
        event_id = event.get("event_id")
        inbound_message_id = str(event.get("inbound_message_id") or "").strip()
        event_sender_id = str(event.get("user_id") or "").strip()
        event_chat_type = str(event.get("chat_type") or "").strip().lower()
        if inbound_message_id != message_id:
            continue
        if event_sender_id != sender_id:
            continue
        if event_chat_type and event_chat_type != expected_chat_type:
            continue
        if event_id in (None, ""):
            continue
        return {
            "mode": "clawx-im-reply",
            "event_id": str(event_id),
            "server_url": config["server_url"],
            "device_id": config["device_id"],
            "device_token": config["device_token"],
            "message_id": message_id,
        }
    return None


def _iter_session_store_paths() -> list[Path]:
    configured_path = Path(os.environ.get("OPENCLAW_SESSION_STATE_PATH", "").strip() or DEFAULT_SESSION_STATE_PATH)
    candidates = [configured_path]
    agents_dir = configured_path.parent.parent if configured_path.parent.parent.name == "agents" else Path.home() / ".openclaw" / "agents"
    try:
        for child in agents_dir.iterdir():
            candidate = child / "sessions" / "sessions.json"
            if candidate.exists():
                candidates.append(candidate)
    except OSError:
        pass
    return [path for path in _unique_paths(candidates) if path.exists()]


def _resolve_session_append_target(*, notify_session_key: str = "", notify_session_id: str = "") -> dict[str, str] | None:
    requested_key = notify_session_key.strip()
    requested_session_id = notify_session_id.strip()
    if not requested_key and not requested_session_id:
        latest = _latest_non_cron_session_entry()
        if latest is not None:
            requested_key = str(latest.get("session_key") or "").strip()
    if not requested_key and not requested_session_id:
        return None

    for store_path in _iter_session_store_paths():
        payload = _read_json_file(store_path)
        if isinstance(payload, dict):
            entries = list(payload.items())
        elif isinstance(payload, list):
            entries = list(enumerate(payload))
        else:
            continue
        for session_key, item in entries:
            if not isinstance(item, dict):
                continue
            session_key_text = str(session_key or "").strip()
            session_id = str(item.get("sessionId") or "").strip()
            if requested_key and session_key_text != requested_key:
                continue
            if requested_session_id and session_id != requested_session_id:
                continue
            session_file = str(item.get("sessionFile") or "").strip()
            if not session_file:
                continue
            return {
                "mode": "session-append",
                "session_key": session_key_text,
                "session_id": session_id,
                "session_file": session_file,
                "session_store_path": str(store_path),
            }
    return None


def _shell_command(
    script_path: Path,
    *,
    task_id: str,
    task_kind: str,
    label: str,
    watch_key: str,
    job_id: str | None,
    notification: dict | None,
) -> str:
    args = [
        sys.executable,
        str(script_path),
        "--task-id",
        str(task_id),
        "--task-kind",
        task_kind,
        "--watch-key",
        watch_key,
    ]
    if label:
        args.extend(["--label", label])
    if job_id:
        args.extend(["--job-id", job_id])
    if notification and notification.get("mode") == "clawx-im-reply":
        args.extend(["--notify-clawx-event-id", str(notification["event_id"])])
        args.extend(["--notify-clawx-server-url", str(notification["server_url"])])
        args.extend(["--notify-clawx-device-id", str(notification["device_id"])])
        args.extend(["--notify-clawx-device-token", str(notification["device_token"])])
    elif notification and notification.get("mode") == "session-append":
        args.extend(["--notify-session-key", str(notification["session_key"])])
        args.extend(["--notify-session-id", str(notification.get("session_id") or "")])
        args.extend(["--notify-session-file", str(notification["session_file"])])
        args.extend(["--notify-session-store-path", str(notification["session_store_path"])])
    args.extend(_watcher_auth_args())
    return " ".join(shlex.quote(part) for part in args)


def _build_prompt(
    script_path: Path,
    *,
    task_id: str,
    task_kind: str,
    label: str,
    watch_key: str,
    job_id: str | None,
    notification: dict | None,
) -> str:
    command = _shell_command(
        script_path,
        task_id=task_id,
        task_kind=task_kind,
        label=label,
        watch_key=watch_key,
        job_id=job_id,
        notification=notification,
    )
    return "\n".join(
        [
            "Check one async VEO relay task.",
            "Run this exact command in the terminal:",
            command,
            "If the command prints exactly NO_REPLY, reply with exactly NO_REPLY and nothing else.",
            "Otherwise reply with the command output verbatim and nothing else.",
        ]
    )


def build_watch_job_plan(
    *,
    task_id: str,
    task_kind: str,
    label: str = "",
    every: str = DEFAULT_WATCH_INTERVAL,
    notify_session_key: str = "",
    notify_session_id: str = "",
) -> dict:
    script_path = Path(__file__).with_name("cron_watch_task.py").resolve()
    if not script_path.exists():
        raise WatchSchedulingError(f"Watcher script not found: {script_path}")

    latest_session = _latest_non_cron_session_entry()
    session_notification = _resolve_session_append_target(
        notify_session_key=notify_session_key,
        notify_session_id=notify_session_id,
    )
    clawx_notification = None if session_notification is not None else _resolve_clawx_im_reply_target()
    notification = session_notification or clawx_notification
    if notify_session_key.strip() and session_notification is None:
        raise WatchSchedulingError(f"Unable to resolve session notification target: {notify_session_key.strip()}")
    if notify_session_id.strip() and session_notification is None:
        raise WatchSchedulingError(f"Unable to resolve session notification target: {notify_session_id.strip()}")
    if latest_session is not None and latest_session.get("channel") == "clawx-im" and notification is None:
        raise WatchSchedulingError("Unable to resolve the current ClawX IM reply target for background notification.")

    watch_key = uuid4().hex
    job_name = f"veo2-watch-{task_kind}-{task_id}-{watch_key[:8]}"
    prompt = _build_prompt(
        script_path,
        task_id=task_id,
        task_kind=task_kind,
        label=label,
        watch_key=watch_key,
        job_id=None,
        notification=notification,
    )
    create_cli_args = [
        "cron",
        "create",
        "--name",
        job_name,
        "--every",
        every,
        "--session",
        "isolated",
        "--wake",
        "now",
        "--message",
        prompt,
        "--light-context",
        "--json",
    ]
    delivery_target = _resolve_delivery_target()
    if notification is not None:
        create_cli_args.append("--no-deliver")
    else:
        create_cli_args.extend(["--announce", "--channel", "last"])
        if delivery_target is not None:
            create_cli_args.extend(["--to", delivery_target["to"]])
            if delivery_target.get("account_id"):
                create_cli_args.extend(["--account", delivery_target["account_id"]])
    legacy_cli_args = [
        "cron",
        "add",
        "--name",
        job_name,
        "--every",
        every,
        "--session",
        "isolated",
        "--message",
        prompt,
        "--wake",
        "now",
        "--light-context",
        "--json",
    ]
    if notification is not None:
        legacy_cli_args.append("--no-deliver")
    else:
        legacy_cli_args.extend(["--announce", "--channel", "last"])
        if delivery_target is not None:
            legacy_cli_args.extend(["--to", delivery_target["to"]])
            if delivery_target.get("account_id"):
                legacy_cli_args.extend(["--account", delivery_target["account_id"]])
    return {
        "name": job_name,
        "watch_key": watch_key,
        "every": every,
        "delivery_target": delivery_target,
        "notification": notification,
        "notification_mode": (notification or {}).get("mode") or "announce",
        "every_ms": _duration_to_ms(every),
        "create_cli_args": create_cli_args,
        "legacy_cli_args": legacy_cli_args,
        "tool_params": {
            "name": job_name,
            "schedule": {"kind": "every", "everyMs": _duration_to_ms(every)},
            "sessionTarget": "isolated",
            "wakeMode": "now",
            "payload": {
                "kind": "agentTurn",
                "message": prompt,
                "lightContext": True,
            },
            "delivery": (
                {
                    "mode": "none",
                }
                if notification is not None
                else {
                    "mode": "announce",
                    "channel": "last",
                }
            ),
        },
        "shell_command": " ".join(shlex.quote(part) for part in [*_openclaw_base_command(), *create_cli_args]),
    }


def schedule_task_watch(
    *,
    task_id: str,
    task_kind: str,
    label: str = "",
    every: str = DEFAULT_WATCH_INTERVAL,
    notify_session_key: str = "",
    notify_session_id: str = "",
) -> dict:
    plan = build_watch_job_plan(
        task_id=task_id,
        task_kind=task_kind,
        label=label,
        every=every,
        notify_session_key=notify_session_key,
        notify_session_id=notify_session_id,
    )
    watch_key = plan["watch_key"]
    job_name = plan["name"]

    add_result = _run_openclaw(plan["create_cli_args"])
    creation_mode = "create"
    if add_result.returncode != 0:
        add_result = _run_openclaw(plan["legacy_cli_args"])
        creation_mode = "add"
        if add_result.returncode != 0:
            stderr = (add_result.stderr or add_result.stdout or "").strip()
            raise WatchSchedulingError(stderr or "Failed to create OpenClaw cron watch job.")

    payload = _parse_json_output(add_result.stdout)
    job_id = _extract_job_id(payload) or _find_job_id_by_name(job_name)
    if not job_id:
        raise WatchSchedulingError("Cron watcher creation could not be verified because no job id was returned.")

    edit_applied = False
    if job_id:
        script_path = Path(__file__).with_name("cron_watch_task.py").resolve()
        final_prompt = _build_prompt(
            script_path,
            task_id=task_id,
            task_kind=task_kind,
            label=label,
            watch_key=watch_key,
            job_id=job_id,
            notification=plan.get("notification"),
        )
        edit_result = _run_openclaw(
            [
                "cron",
                "edit",
                job_id,
                "--message",
                final_prompt,
                "--light-context",
                "--json",
            ]
        )
        edit_applied = edit_result.returncode == 0

    return {
        "name": job_name,
        "task_id": task_id,
        "task_kind": task_kind,
        "label": label,
        "watch_key": watch_key,
        "job_id": job_id,
        "schedule": every,
        "delivery": "none" if plan.get("notification") is not None else "announce",
        "delivery_channel": "" if plan.get("notification") is not None else "last",
        "notification_mode": plan.get("notification_mode") or "announce",
        "light_context": True,
        "creation_mode": creation_mode,
        "edit_applied": edit_applied,
    }


def remove_task_watch(job_id: str | None) -> bool:
    if not job_id:
        return False
    result = _run_openclaw(["cron", "remove", str(job_id)])
    return result.returncode == 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Create an OpenClaw cron watcher for a VEO relay task.")
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--task-kind", required=True)
    parser.add_argument("--label", default="")
    parser.add_argument("--every", default=DEFAULT_WATCH_INTERVAL)
    args = parser.parse_args()

    result = schedule_task_watch(
        task_id=str(args.task_id),
        task_kind=args.task_kind,
        label=args.label,
        every=args.every,
    )
    sys.stdout.write(json.dumps(result, ensure_ascii=False, indent=2))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
