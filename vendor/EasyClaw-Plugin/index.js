import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { easyClawPlugin } from "./src/channel.js";
import { setClawXImRuntime } from "./src/runtime.js";
import {
  createEasyClawMomentInteractionTool,
  createEasyClawMomentsTool,
  createEasyClawPublishMomentTool,
  createEasyClawViewUserMomentsTool,
} from "./src/tool.js";

const plugin = {
  id: "easyclaw",
  name: "EasyClaw",
  description: "EasyClaw bridge channel plugin for OpenClaw",
  configSchema: emptyPluginConfigSchema(),
  register(api) {
    setClawXImRuntime(api.runtime);
    api.registerChannel({ plugin: easyClawPlugin });
    api.registerTool(createEasyClawMomentsTool(api), { name: "easyclaw_moments" });
    api.registerTool(createEasyClawPublishMomentTool(api), { name: "easyclaw_publish_moment" });
    api.registerTool(createEasyClawViewUserMomentsTool(api), { name: "easyclaw_view_user_moments" });
    api.registerTool(createEasyClawMomentInteractionTool(api), { name: "easyclaw_moment_interaction" });
  },
};

export default plugin;
