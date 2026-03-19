import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { easyClawPlugin } from "./src/channel.js";
import { setClawXImRuntime } from "./src/runtime.js";
import { createEasyClawMomentsTool, createEasyClawPublishMomentTool } from "./src/tool.js";

const plugin = {
  id: "easyclaw",
  name: "openclaw(chinese)",
  description: "openclaw(chinese) bridge channel plugin for OpenClaw",
  configSchema: emptyPluginConfigSchema(),
  register(api) {
    setClawXImRuntime(api.runtime);
    api.registerChannel({ plugin: easyClawPlugin });
    api.registerTool(createEasyClawMomentsTool(api), { name: "easyclaw_moments" });
    api.registerTool(createEasyClawPublishMomentTool(api), { name: "easyclaw_publish_moment" });
  },
};

export default plugin;
