// Official Catppuccin Latte and Mocha palette: https://catppuccin.com/palette/
export const styles = `
:root {
  color-scheme: light;
  --ctp-base: #eff1f5;
  --ctp-mantle: #e6e9ef;
  --ctp-crust: #dce0e8;
  --ctp-surface0: #ccd0da;
  --ctp-surface1: #bcc0cc;
  --ctp-text: #4c4f69;
  --ctp-subtext1: #5c5f77;
  --ctp-subtext0: #6c6f85;
  --ctp-overlay1: #8c8fa1;
  --ctp-blue: #1e66f5;
  --ctp-mauve: #8839ef;
  --ctp-peach: #fe640b;
  --ctp-red: #d20f39;
  --link: color-mix(in srgb, var(--ctp-blue) 80%, var(--ctp-text));
  --panel: var(--ctp-mantle);
  --border: var(--ctp-crust);
  --code-bg: var(--ctp-crust);
  --accent-soft: color-mix(in srgb, var(--ctp-blue) 12%, var(--ctp-base));
  --mauve-soft: color-mix(in srgb, var(--ctp-mauve) 12%, var(--ctp-base));
  --peach-soft: color-mix(in srgb, var(--ctp-peach) 12%, var(--ctp-base));
  --red-soft: color-mix(in srgb, var(--ctp-red) 12%, var(--ctp-base));
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  color: var(--ctp-text);
  background: var(--ctp-base);
  font-synthesis: none;
}
:root[data-theme='dark'] {
  color-scheme: dark;
  --ctp-base: #1e1e2e;
  --ctp-mantle: #181825;
  --ctp-crust: #11111b;
  --ctp-surface0: #313244;
  --ctp-surface1: #45475a;
  --ctp-text: #cdd6f4;
  --ctp-subtext1: #bac2de;
  --ctp-subtext0: #a6adc8;
  --ctp-overlay1: #7f849c;
  --ctp-blue: #89b4fa;
  --ctp-mauve: #cba6f7;
  --ctp-peach: #fab387;
  --ctp-red: #f38ba8;
  --link: var(--ctp-blue);
  --panel: var(--ctp-surface0);
  --border: var(--ctp-surface1);
  --code-bg: var(--ctp-mantle);
}
* {
  box-sizing: border-box;
}
html {
  scroll-behavior: smooth;
}
body {
  margin: 0;
}
a {
  color: var(--link);
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}
a:focus-visible,
input:focus-visible,
button:focus-visible {
  outline: 3px solid var(--ctp-blue);
  outline-offset: 2px;
}
.layout {
  display: grid;
  grid-template-columns: 272px minmax(0, 1fr);
  min-height: 100vh;
}
.sidebar {
  position: sticky;
  top: 0;
  align-self: start;
  height: 100vh;
  overflow-y: auto;
  padding: 30px 20px;
  border-right: 1px solid var(--border);
  background: var(--panel);
}
.brand {
  display: flex;
  gap: 11px;
  align-items: center;
  font-size: 17px;
  font-weight: 750;
  color: var(--ctp-text);
  line-height: 1.2;
  margin-bottom: 36px;
}
.brand-mark {
  display: grid;
  place-items: center;
  width: 29px;
  height: 29px;
  border-radius: 9px;
  background: var(--ctp-blue);
  color: var(--ctp-base);
  font-family: Georgia, serif;
  font-style: italic;
  font-size: 22px;
}
.theme-toggle {
  display: block;
  width: 100%;
  margin: -17px 0 24px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--ctp-base);
  color: var(--ctp-text);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.theme-toggle:hover {
  border-color: var(--ctp-blue);
}
.theme-toggle[hidden] {
  display: none;
}
.search-label {
  display: block;
  font-size: 12px;
  font-weight: 650;
  color: var(--ctp-subtext0);
  margin-bottom: 7px;
}
.sidebar input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 11px;
  font: inherit;
  font-size: 13px;
  background: var(--ctp-base);
}
.search-results {
  margin: 8px 0;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 6px 20px color-mix(in srgb, var(--ctp-crust) 35%, transparent);
}
.search-results[hidden] {
  display: none;
}
.search-results a {
  display: flex;
  flex-direction: column;
  padding: 8px;
  border-radius: 6px;
  color: var(--ctp-text);
}
.search-results a:hover {
  background: var(--accent-soft);
  text-decoration: none;
}
.search-results small {
  color: var(--ctp-subtext0);
  margin-top: 3px;
}
.search-results p {
  font-size: 13px;
  color: var(--ctp-subtext0);
  margin: 8px;
}
.nav-heading {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ctp-overlay1);
  margin: 29px 10px 10px;
}
.nav-link {
  display: block;
  padding: 8px 10px;
  border-radius: 7px;
  color: var(--ctp-subtext1);
  font-size: 13px;
  overflow-wrap: anywhere;
}
.nav-link:hover,
.nav-link.active {
  background: var(--accent-soft);
  color: var(--link);
  text-decoration: none;
}
.nav-empty {
  font-size: 12px;
  color: var(--ctp-overlay1);
  padding: 8px 10px;
  display: block;
}
.main {
  max-width: 1120px;
  width: 100%;
  padding: 70px clamp(28px, 6vw, 92px) 120px;
  margin: 0 auto;
}
.eyebrow {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  color: var(--link);
}
.version {
  letter-spacing: 0;
  background: var(--accent-soft);
  padding: 4px 7px;
  border-radius: 5px;
  margin-left: 7px;
}
h1 {
  font-size: clamp(36px, 5vw, 56px);
  letter-spacing: -0.045em;
  line-height: 1.09;
  margin: 18px 0 16px;
  color: var(--ctp-text);
}
.type-title {
  font-size: clamp(34px, 4.5vw, 52px);
  overflow-wrap: anywhere;
}
.type-identifier {
  margin: 0 0 30px;
}
.type-identifier code {
  background: var(--code-bg);
  border-radius: 5px;
  padding: 5px 8px;
  color: var(--ctp-text);
}
h2 {
  font-size: 25px;
  letter-spacing: -0.025em;
  color: var(--ctp-text);
  margin: 0 0 15px;
}
h3 {
  font-size: 16px;
  color: var(--ctp-text);
  margin: 27px 0 10px;
}
p {
  line-height: 1.7;
  color: var(--ctp-subtext1);
  white-space: pre-line;
}
.lede {
  font-size: 17px;
  max-width: 670px;
  margin: 0 0 39px;
}
.intro-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin: 40px 0 64px;
}
.intro-panel {
  padding: 21px 23px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  min-width: 0;
}
.intro-panel code {
  overflow-wrap: anywhere;
}
.panel-label {
  font-size: 10px;
  color: var(--ctp-subtext0);
  letter-spacing: 0.12em;
  font-weight: 800;
}
.main section:not(.method) {
  margin-top: 50px;
}
.section-intro {
  margin-top: -5px;
  margin-bottom: 20px;
}
.card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.resource-card {
  display: flex;
  flex-direction: column;
  gap: 17px;
  padding: 22px;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: var(--panel);
}
.resource-card:hover {
  border-color: var(--ctp-blue);
  box-shadow: 0 8px 22px color-mix(in srgb, var(--ctp-blue) 12%, transparent);
  text-decoration: none;
}
.card-name {
  font-weight: 700;
  color: var(--ctp-text);
}
.card-detail {
  font-size: 12px;
  color: var(--ctp-subtext0);
}
.card-detail span {
  float: right;
  color: var(--link);
}
.type-list {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
}
.type-list a {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 8px 12px;
  font-size: 13px;
}
.method-index {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 24px 0 55px;
}
.method-index a {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  color: var(--ctp-text);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.method-index a:hover {
  border-color: var(--ctp-blue);
  text-decoration: none;
}
.method {
  border-top: 1px solid var(--border);
  padding-top: 43px;
  margin-top: 48px;
  scroll-margin-top: 30px;
}
.method h2 {
  margin-top: 9px;
}
.method > p {
  margin-bottom: 20px;
}
.endpoint {
  display: flex;
  align-items: center;
  gap: 13px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 12px 15px;
  margin: 24px 0 30px;
  overflow-wrap: anywhere;
}
.verb {
  display: inline-block;
  min-width: 56px;
  text-align: center;
  padding: 5px 7px;
  border-radius: 5px;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-weight: 800;
  font-size: 10px;
  letter-spacing: 0.04em;
  background: var(--accent-soft);
  color: var(--link);
}
.verb.post {
  background: var(--mauve-soft);
  color: var(--ctp-mauve);
}
.verb.put,
.verb.patch {
  background: var(--peach-soft);
  color: var(--ctp-text);
}
.verb.delete {
  background: var(--red-soft);
  color: var(--ctp-red);
}
code {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 0.9em;
}
p code,
td code {
  background: var(--code-bg);
  border-radius: 4px;
  padding: 2px 4px;
  color: var(--ctp-text);
}
.type-expression {
  white-space: normal;
  overflow-wrap: anywhere;
}
.type-expression a {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--panel);
}
table {
  border-collapse: collapse;
  width: 100%;
  font-size: 13px;
  min-width: 540px;
}
th {
  text-align: left;
  font-size: 11px;
  color: var(--ctp-subtext0);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: var(--ctp-crust);
}
th,
td {
  padding: 12px 15px;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}
tr:last-child td {
  border-bottom: 0;
}
td {
  color: var(--ctp-subtext1);
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.required,
.deprecated {
  font-size: 11px;
  background: var(--peach-soft);
  color: var(--ctp-text);
  border-radius: 4px;
  padding: 4px 6px;
  vertical-align: middle;
}
.deprecated {
  background: var(--red-soft);
  color: var(--ctp-red);
}
.muted {
  font-size: 13px;
  color: var(--ctp-subtext0);
}
.note {
  border-left: 3px solid var(--ctp-blue);
  background: var(--accent-soft);
  padding: 9px 14px;
  font-size: 13px;
}
.schema-value {
  margin-top: 44px;
}
@media (max-width: 800px) {
  .layout {
    display: block;
  }
  .sidebar {
    position: relative;
    height: auto;
    max-height: none;
    padding: 18px 22px;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }
  .brand {
    margin-bottom: 16px;
  }
  .sidebar nav {
    display: flex;
    gap: 5px;
    overflow-x: auto;
    align-items: center;
    margin-top: 10px;
  }
  .nav-heading,
  .nav-empty {
    display: none;
  }
  .nav-link {
    white-space: nowrap;
  }
  .main {
    padding: 42px 24px 80px;
  }
  .intro-grid,
  .card-grid {
    grid-template-columns: 1fr;
  }
}
`;
