import fs from "fs";
import fsPromises from "fs/promises";
import os from "os";
import path from "path";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";

const STATE_FILE_VERSION = 1;
const STATE_SUBDIR = path.join("plugins", "easyclaw");
const LEGACY_STATE_SUBDIR = path.join("plugins", "clawx-im");
const STATE_FILENAME = "bindings.json";

function resolveOpenClawStateDir(env = process.env) {
  const override = env.OPENCLAW_STATE_DIR?.trim() || env.CLAWDBOT_STATE_DIR?.trim();
  if (override) {
    return override;
  }
  return path.join(os.homedir(), ".openclaw");
}

function resolveStateFilePath(env = process.env) {
  return path.join(resolveOpenClawStateDir(env), STATE_SUBDIR, STATE_FILENAME);
}

function resolveLegacyStateFilePath(env = process.env) {
  return path.join(resolveOpenClawStateDir(env), LEGACY_STATE_SUBDIR, STATE_FILENAME);
}

function createEmptyState() {
  return {
    version: STATE_FILE_VERSION,
    accounts: {},
  };
}

function normalizeStateShape(raw) {
  if (!raw || typeof raw !== "object") {
    return createEmptyState();
  }

  const accounts =
    raw.accounts && typeof raw.accounts === "object" && !Array.isArray(raw.accounts)
      ? raw.accounts
      : {};

  return {
    version: STATE_FILE_VERSION,
    accounts,
  };
}

function readStateSync() {
  try {
    const raw = fs.readFileSync(resolveStateFilePath(), "utf8");
    return normalizeStateShape(JSON.parse(raw));
  } catch {
    try {
      const raw = fs.readFileSync(resolveLegacyStateFilePath(), "utf8");
      return normalizeStateShape(JSON.parse(raw));
    } catch {
      return createEmptyState();
    }
  }
}

async function writeState(state) {
  const filePath = resolveStateFilePath();
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function readPersistedBinding(accountId = DEFAULT_ACCOUNT_ID) {
  const state = readStateSync();
  const binding = state.accounts?.[accountId];
  return binding && typeof binding === "object" ? binding : null;
}

export async function persistBinding(accountId = DEFAULT_ACCOUNT_ID, binding) {
  const state = readStateSync();
  state.accounts[accountId] = {
    ...(state.accounts[accountId] ?? {}),
    ...binding,
    updatedAt: Date.now(),
  };
  await writeState(state);
  return state.accounts[accountId];
}

export async function clearPersistedBinding(accountId = DEFAULT_ACCOUNT_ID) {
  const state = readStateSync();
  if (!state.accounts[accountId]) {
    return false;
  }

  delete state.accounts[accountId];
  await writeState(state);
  return true;
}

export function resolvePersistedBindingStatePath() {
  return resolveStateFilePath();
}
