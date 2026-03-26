import { CHANNEL_ID } from "./accounts.js";

export function buildEasyClawUserTarget(userId) {
  return `${CHANNEL_ID}:user:${String(userId).trim()}`;
}

export function buildEasyClawGroupTarget(groupId) {
  return `${CHANNEL_ID}:group:${String(groupId).trim()}`;
}

export function parseEasyClawTarget(target) {
  const raw = String(target || "").trim();
  if (!raw) {
    throw new Error("Missing easyclaw target");
  }

  const segments = raw.split(":").filter(Boolean);
  if (segments[0] !== CHANNEL_ID) {
    throw new Error(`Unsupported easyclaw target: ${raw}`);
  }

  if (segments.length === 2 && /^\d+$/.test(segments[1])) {
    return {
      targetType: "user",
      targetId: Number(segments[1]),
    };
  }

  if (segments.length === 3 && (segments[1] === "user" || segments[1] === "group")) {
    const targetId = Number(segments[2]);
    if (!Number.isFinite(targetId) || targetId < 1) {
      throw new Error(`Invalid easyclaw target id: ${raw}`);
    }
    return {
      targetType: segments[1],
      targetId,
    };
  }

  if (segments.length === 3 && segments[1] === "bot") {
    throw new Error(
      `easyclaw bot targets are not valid outbound destinations for async replies: ${raw}`,
    );
  }

  throw new Error(`Unsupported easyclaw target: ${raw}`);
}
