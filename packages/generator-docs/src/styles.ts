export const styles = `
:root {
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  color: #15272e;
  background: #f8faf8;
  font-synthesis: none;
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
  color: #106b5b;
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}
a:focus-visible,
input:focus-visible {
  outline: 3px solid #4bc5aa;
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
  border-right: 1px solid #dce7e2;
  background: #fff;
}
.brand {
  display: flex;
  gap: 11px;
  align-items: center;
  font-size: 17px;
  font-weight: 750;
  color: #17382f;
  line-height: 1.2;
  margin-bottom: 36px;
}
.brand-mark {
  display: grid;
  place-items: center;
  width: 29px;
  height: 29px;
  border-radius: 9px;
  background: #127968;
  color: #fff;
  font-family: Georgia, serif;
  font-style: italic;
  font-size: 22px;
}
.search-label {
  display: block;
  font-size: 12px;
  font-weight: 650;
  color: #547069;
  margin-bottom: 7px;
}
.sidebar input {
  width: 100%;
  border: 1px solid #d2dfd9;
  border-radius: 8px;
  padding: 10px 11px;
  font: inherit;
  font-size: 13px;
  background: #f8faf8;
}
.search-results {
  margin: 8px 0;
  padding: 4px;
  border: 1px solid #dce7e2;
  border-radius: 10px;
  box-shadow: 0 6px 20px #143e2512;
}
.search-results[hidden] {
  display: none;
}
.search-results a {
  display: flex;
  flex-direction: column;
  padding: 8px;
  border-radius: 6px;
  color: #193c31;
}
.search-results a:hover {
  background: #eff7f3;
  text-decoration: none;
}
.search-results small {
  color: #71847b;
  margin-top: 3px;
}
.search-results p {
  font-size: 13px;
  color: #71847b;
  margin: 8px;
}
.nav-heading {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #8c9e96;
  margin: 29px 10px 10px;
}
.nav-link {
  display: block;
  padding: 8px 10px;
  border-radius: 7px;
  color: #3f5b51;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.nav-link:hover,
.nav-link.active {
  background: #e8f5ed;
  color: #0e654a;
  text-decoration: none;
}
.nav-empty {
  font-size: 12px;
  color: #8c9e96;
  padding: 8px 10px;
  display: block;
}
.main {
  max-width: 1120px;
  width: 100%;
  padding: 70px clamp(28px, 6vw, 92px) 120px;
  margin: auto;
}
.eyebrow {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  color: #168269;
}
.version {
  letter-spacing: 0;
  background: #e9f4ee;
  padding: 4px 7px;
  border-radius: 5px;
  margin-left: 7px;
}
h1 {
  font-size: clamp(36px, 5vw, 56px);
  letter-spacing: -0.045em;
  line-height: 1.09;
  margin: 18px 0 16px;
  color: #153c32;
}
h2 {
  font-size: 25px;
  letter-spacing: -0.025em;
  color: #153c32;
  margin: 0 0 15px;
}
h3 {
  font-size: 16px;
  color: #20473d;
  margin: 27px 0 10px;
}
p {
  line-height: 1.7;
  color: #536b62;
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
  background: #fff;
  border: 1px solid #dfe9e2;
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
  color: #748d7f;
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
  border: 1px solid #dce7e0;
  border-radius: 11px;
  background: #fff;
}
.resource-card:hover {
  border-color: #49a889;
  box-shadow: 0 8px 22px #2b765612;
  text-decoration: none;
}
.card-name {
  font-weight: 700;
  color: #21453b;
}
.card-detail {
  font-size: 12px;
  color: #789083;
}
.card-detail span {
  float: right;
  color: #168269;
}
.type-list {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
}
.type-list a {
  background: #fff;
  border: 1px solid #dce7e0;
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
  border: 1px solid #e2eae5;
  border-radius: 8px;
  background: #fff;
  color: #294c41;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.method-index a:hover {
  border-color: #59af96;
  text-decoration: none;
}
.method {
  border-top: 1px solid #dce7e0;
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
  background: #eaf1ed;
  border: 1px solid #d8e5dc;
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
  background: #dbece6;
  color: #0d7259;
}
.verb.post {
  background: #e3edff;
  color: #315ba8;
}
.verb.put,
.verb.patch {
  background: #fff0db;
  color: #a75f11;
}
.verb.delete {
  background: #ffe8e4;
  color: #a94838;
}
code {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 0.9em;
}
p code,
td code {
  background: #eef3ef;
  border-radius: 4px;
  padding: 2px 4px;
  color: #27594c;
}
.table-wrap {
  overflow-x: auto;
  border: 1px solid #e0e9e2;
  border-radius: 9px;
  background: #fff;
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
  color: #657c70;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: #f2f6f2;
}
th,
td {
  padding: 12px 15px;
  border-bottom: 1px solid #e7ede7;
  vertical-align: top;
}
tr:last-child td {
  border-bottom: 0;
}
td {
  color: #4f6559;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.required,
.deprecated {
  font-size: 11px;
  background: #fff0df;
  color: #9a5a12;
  border-radius: 4px;
  padding: 4px 6px;
  vertical-align: middle;
}
.deprecated {
  background: #fbe8e5;
  color: #a34237;
}
.muted {
  font-size: 13px;
  color: #758a7d;
}
.note {
  border-left: 3px solid #49a889;
  background: #eef8f1;
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
    border-bottom: 1px solid #dce7e2;
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
