/** Static, dependency-free API reference generated from the shared IR. */
import type { IR, MethodNode, ParamNode, ResourceNode, TypeRef } from '@ironic/core';
import { styles } from './styles.js';
import { searchScript } from './search.js';

export interface DocsOptions {
  title?: string;
}

interface ResourcePage {
  resource: ResourceNode;
  label: string;
  path: string;
}
interface SearchEntry {
  title: string;
  detail: string;
  href: string;
}

export function emit(ir: IR, options: DocsOptions = {}): Map<string, string> {
  const title = options.title ?? `${ir.meta.prettyName} API`;
  const files = new Map<string, string>();
  const resourcePages: ResourcePage[] = [];
  const resourceSlugs = new Set<string>();
  const typeSlugs = new Set<string>();
  const typePaths = new Map<string, string>();

  const visit = (resource: ResourceNode, parents: string[]): void => {
    const names = [...parents, resource.name];
    const slug = uniqueSlug(names.join('-'), resourceSlugs);
    resourcePages.push({
      resource,
      label: names.join(' / '),
      path: `resources/${slug}.html`,
    });
    for (const child of resource.children) visit(child, names);
  };
  for (const resource of ir.resources) visit(resource, []);
  for (const type of ir.types) {
    typePaths.set(type.name, `types/${uniqueSlug(type.name, typeSlugs)}.html`);
  }

  const linkType = (ref: TypeRef, root: string): string => formatType(ref, root, typePaths);
  const sidebarTypes = ir.types.slice(0, 20);
  const nav = (root: string, active?: string): string => `
    <aside class="sidebar" aria-label="Documentation navigation">
      <a class="brand" href="${root}index.html"><span class="brand-mark">I</span><span>${escapeHtml(title)}</span></a>
      <label class="search-label" for="doc-search">Search documentation</label>
      <input id="doc-search" type="search" placeholder="Search docs…" autocomplete="off" aria-controls="search-results">
      <div id="search-results" class="search-results" role="status" hidden></div>
      <nav aria-label="API reference">
        <div class="nav-heading">Overview</div>
        <a class="nav-link${active === 'index.html' ? ' active' : ''}" href="${root}index.html">Introduction</a>
        <div class="nav-heading">Resources</div>
        ${resourcePages.map((page) => `<a class="nav-link${active === page.path ? ' active' : ''}" href="${root}${page.path}">${escapeHtml(page.label)}</a>`).join('') || '<span class="nav-empty">No resources</span>'}
        <div class="nav-heading">Types</div>
        ${sidebarTypes.map((type) => `<a class="nav-link${active === typePaths.get(type.name) ? ' active' : ''}" href="${root}${typePaths.get(type.name)}">${escapeHtml(type.name)}</a>`).join('') || '<span class="nav-empty">No types</span>'}
        ${ir.types.length > 20 ? `<a class="nav-link" href="${root}index.html#types">All ${ir.types.length} types →</a>` : ''}
      </nav>
    </aside>`;
  const page = (pageTitle: string, content: string, root: string, active: string): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark"><title>${escapeHtml(pageTitle === title ? title : `${pageTitle} · ${title}`)}</title>
<link rel="stylesheet" href="${root}assets/site.css"><script src="${root}assets/site.js" defer></script></head>
<body data-root="${root}"><div class="layout">${nav(root, active)}<main id="main-content" class="main">${content}</main></div></body></html>`;

  const overview = `
    <div class="eyebrow">API REFERENCE <span class="version">v${escapeHtml(ir.meta.version)}</span></div>
    <h1>${escapeHtml(title)}</h1><p class="lede">${escapeHtml(ir.meta.description)}</p>
    <section class="intro-grid"><div class="intro-panel"><span class="panel-label">BASE URL</span><code>${escapeHtml(ir.meta.baseURL)}</code></div>
    <div class="intro-panel"><span class="panel-label">AUTHENTICATION</span><span>${authLabel(ir)}</span></div></section>
    <section><h2>Resources</h2><p class="section-intro">Explore endpoints, parameters, request bodies, and responses.</p>
    <div class="card-grid">${resourcePages.map(({ resource, label, path }) => `<a class="resource-card" href="${path}"><span class="card-name">${escapeHtml(label)}</span><span class="card-detail">${resource.methods.length} ${resource.methods.length === 1 ? 'endpoint' : 'endpoints'} <span aria-hidden="true">↗</span></span></a>`).join('') || '<p>No resources are defined in this specification.</p>'}</div></section>
    <section id="types"><h2>Data types</h2><p class="section-intro">Schemas used across requests and responses.</p>
    <div class="type-list">${ir.types.map((type) => `<a href="${typePaths.get(type.name)}">${escapeHtml(type.name)}</a>`).join('') || '<p>No named types are defined.</p>'}</div></section>`;
  files.set('index.html', page(title, overview, '', 'index.html'));

  for (const { resource, label, path } of resourcePages) {
    const methods = resource.methods.map((method, index) => methodSection(method, index, linkType, '../')).join('');
    const content = `<div class="eyebrow">RESOURCE</div><h1>${escapeHtml(label)}</h1>
      <p class="lede">${resource.methods.length} ${resource.methods.length === 1 ? 'endpoint' : 'endpoints'} in this resource.</p>
      <div class="method-index">${resource.methods.map((method, index) => `<a href="#method-${index}"><span class="verb ${method.httpMethod}">${method.httpMethod.toUpperCase()}</span> ${escapeHtml(method.path)}</a>`).join('') || '<p>No endpoints on this resource. See its subresources in the navigation.</p>'}</div>${methods}`;
    files.set(path, page(label, content, '../', path));
  }
  for (const type of ir.types) {
    const path = typePaths.get(type.name)!;
    const properties =
      type.type.kind === 'object'
        ? type.type.properties
        : type.type.kind === 'record'
          ? type.type.properties
          : undefined;
    const content = `<div class="eyebrow">${type.isRequestBody ? 'REQUEST TYPE' : 'DATA TYPE'}</div>
      <h1>${escapeHtml(type.name)}</h1>${type.description ? `<p class="lede">${escapeHtml(type.description)}</p>` : ''}
      ${properties ? propertyTable(properties, linkType, '../') : `<section class="schema-value"><h2>Definition</h2><p>${linkType(type.type, '../')}</p></section>`}`;
    files.set(path, page(type.name, content, '../', path));
  }

  const searchEntries: SearchEntry[] = [
    { title: 'Introduction', detail: title, href: 'index.html' },
    ...resourcePages.flatMap(({ resource, label, path }) => [
      { title: label, detail: 'Resource', href: path },
      ...resource.methods.map((method, index) => ({
        title: method.name,
        detail: `${method.httpMethod.toUpperCase()} ${method.path}`,
        href: `${path}#method-${index}`,
      })),
    ]),
    ...ir.types.map((type) => ({
      title: type.name,
      detail: type.description ?? 'Data type',
      href: typePaths.get(type.name)!,
    })),
  ];
  files.set('assets/site.css', styles);
  files.set('assets/site.js', `const entries = ${JSON.stringify(searchEntries)};\n${searchScript}`);
  return files;
}

function methodSection(
  method: MethodNode,
  index: number,
  linkType: (ref: TypeRef, root: string) => string,
  root: string,
): string {
  const groups: Array<[string, ParamNode[] | undefined]> = [
    ['Path parameters', method.pathParams],
    ['Query parameters', method.queryParams],
    ['Header parameters', method.headerParams],
    ['Cookie parameters', method.cookieParams],
  ];
  const params = groups
    .filter(([, values]) => values?.length)
    .map(
      ([heading, values]) => `<h3>${heading}</h3>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Type</th><th>Required</th><th>Description</th></tr></thead><tbody>
    ${values!.map((param) => `<tr><td><code>${escapeHtml(param.name)}</code></td><td>${linkType(param.type, root)}</td><td>${param.required ? 'Yes' : 'No'}</td><td>${escapeHtml(param.description ?? '—')}</td></tr>`).join('')}
    </tbody></table></div>`,
    )
    .join('');
  const body = method.requestBody
    ? `<h3>Request body ${method.requestBodyRequired ? '<span class="required">Required</span>' : ''}</h3>
    ${method.requestBodyContentType ? `<p class="muted">Content type: <code>${escapeHtml(method.requestBodyContentType)}</code></p>` : ''}
    <p>${linkType(method.requestBody, root)}</p>${method.requestBody.kind === 'object' ? propertyTable(method.requestBody.properties, linkType, root) : ''}`
    : '';
  return `<section class="method" id="method-${index}"><div class="eyebrow">ENDPOINT ${String(index + 1).padStart(2, '0')}</div>
    <h2>${escapeHtml(method.name)}${method.deprecated ? ' <span class="deprecated">Deprecated</span>' : ''}</h2>
    ${method.description ? `<p>${escapeHtml(method.description)}</p>` : ''}
    <div class="endpoint"><span class="verb ${method.httpMethod}">${method.httpMethod.toUpperCase()}</span><code>${escapeHtml(method.path)}</code></div>
    ${params}${body}<h3>Response</h3><p>${linkType(method.responseType, root)}</p>
    ${method.responseContentType ? `<p class="muted">Content type: <code>${escapeHtml(method.responseContentType)}</code></p>` : ''}
    ${method.responseType.kind === 'object' ? propertyTable(method.responseType.properties, linkType, root) : ''}
    ${method.pagination ? `<p class="note">Paginated response (${escapeHtml(method.pagination)}).</p>` : ''}
    ${method.streaming ? '<p class="note">Streaming response.</p>' : ''}</section>`;
}

function propertyTable(
  properties: Record<string, { type: TypeRef; required: boolean; description?: string }>,
  linkType: (ref: TypeRef, root: string) => string,
  root: string,
): string {
  return `<div class="table-wrap"><table><thead><tr><th>Property</th><th>Type</th><th>Required</th><th>Description</th></tr></thead><tbody>
    ${Object.entries(properties)
      .map(
        ([name, property]) =>
          `<tr><td><code>${escapeHtml(name)}</code></td><td>${linkType(property.type, root)}</td><td>${property.required ? 'Yes' : 'No'}</td><td>${escapeHtml(property.description ?? '—')}</td></tr>`,
      )
      .join('')}
    </tbody></table></div>`;
}

function formatType(ref: TypeRef, root: string, paths: Map<string, string>): string {
  switch (ref.kind) {
    case 'primitive':
      return `<code>${escapeHtml(ref.type)}</code>`;
    case 'ref': {
      const path = paths.get(ref.name);
      return path
        ? `<a href="${root}${path}"><code>${escapeHtml(ref.name)}</code></a>`
        : `<code>${escapeHtml(ref.name)}</code>`;
    }
    case 'array':
      return `${formatType(ref.items, root, paths)}[]`;
    case 'record':
      return `Record&lt;string, ${formatType(ref.valueType, root, paths)}&gt;`;
    case 'object':
      return `<code>object</code>${Object.keys(ref.properties).length ? ` <span class="muted">(${Object.keys(ref.properties).length} properties)</span>` : ''}`;
    case 'enum':
      return ref.values.map((value) => `<code>${escapeHtml(value)}</code>`).join(' | ');
    case 'union':
      return ref.members.map((member) => formatType(member, root, paths)).join(' | ');
    case 'intersection':
      return ref.members.map((member) => formatType(member, root, paths)).join(' &amp; ');
    case 'nullable':
      return `${formatType(ref.inner, root, paths)} | <code>null</code>`;
  }
}

function authLabel(ir: IR): string {
  switch (ir.auth.type) {
    case 'bearer':
      return 'Bearer token';
    case 'api_key':
      return `API key (${escapeHtml(ir.auth.in ?? 'header')})`;
    case 'basic':
      return 'HTTP Basic';
    case 'custom':
      return 'Custom';
    case 'none':
      return 'None';
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
}

function uniqueSlug(value: string, used: Set<string>): string {
  const base =
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'item';
  let slug = base;
  for (let suffix = 2; used.has(slug); suffix++) slug = `${base}-${suffix}`;
  used.add(slug);
  return slug;
}
