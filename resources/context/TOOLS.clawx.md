## ClawX Tool Notes

### uv (Python)

- `uv` is bundled with ClawX and on PATH. Do NOT use bare `python` or `pip`.
- Run scripts: `uv run python <script>` | Install packages: `uv pip install <package>`

### Browser

- `browser` tool provides full automation (scraping, form filling, testing) via an isolated managed browser.
- Flow: `action="start"` → `action="snapshot"` (see page + get element refs like `e12`) → `action="act"` (click/type using refs).
- Open new tabs: `action="open"` with `targetUrl`.
- To just open a URL for the user to view, use `shell:openExternal` instead.

### Moments

- Use `clawx_im_moments` or `clawx_publish_moment` to actually publish a bot Moment to ClawX.
- When the user asks to 发朋友圈, 发动态, or 发布朋友圈, publish it instead of only writing draft text.
- Only skip publishing when the user asked for copywriting or a draft and did not ask to post it.
