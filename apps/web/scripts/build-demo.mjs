// Builds the keyless demo (VITE_MOCK_LIVE=1) and folds it into ONE html
// fragment (title + style + #root + inline module script) at
// dist-demo/demo.html, for hosts that only allow inline code. The demo
// shows a drawn scene instead of a camera and uses canned playbooks.
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

execSync("npx vite build --outDir dist-demo", {
  stdio: "inherit",
  env: { ...process.env, MEND_DEMO: "1", VITE_MOCK_LIVE: "1" },
});

const dir = "dist-demo";
const assets = join(dir, "assets");
const files = readdirSync(assets);
// The audio worklet is a separate chunk that demo mode never loads.
const js = files.filter((f) => f.endsWith(".js") && !f.startsWith("pcmRecorderWorklet"));
const css = files.filter((f) => f.endsWith(".css"));
if (js.length !== 1 || css.length !== 1) {
  throw new Error(`expected 1 js and 1 css asset, got ${js.length} js and ${css.length} css`);
}

const script = readFileSync(join(assets, js[0]), "utf8").replaceAll("</script", "<\\/script");
const style = readFileSync(join(assets, css[0]), "utf8").replaceAll("</style", "<\\/style");

writeFileSync(
  join(dir, "demo.html"),
  `<title>Mend Live UI</title>
<style>${style}
:root{padding:0!important}html,body{height:100%;margin:0;overflow:hidden}#root{height:100%}</style>
<div id="root"></div>
<script type="module">${script}</script>
`,
);
console.log(`wrote ${dir}/demo.html`);
