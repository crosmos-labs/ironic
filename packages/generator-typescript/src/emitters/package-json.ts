// ─── Package Scaffolding Emitters ────────────────────────────────────────────
// Emit package.json, tsconfig.json, index.ts for the generated SDK.

import type { IR } from '@ironic/core';

export function emitPackageJson(ir: IR): string {
  const pkg: Record<string, unknown> = {
    name: ir.meta.packageName,
    version: ir.meta.version,
    description: ir.meta.description,
    ...(ir.meta.license ? { license: ir.meta.license } : {}),
    type: 'module',
    main: './dist/index.js',
    types: './dist/index.d.ts',
    exports: {
      '.': {
        import: './dist/index.js',
        types: './dist/index.d.ts',
      },
    },
    scripts: {
      build: 'tsc',
      prepublishOnly: 'npm run build',
    },
    engines: {
      node: '>=20',
    },
    files: ['dist', 'src', 'LICENSE'],
  };

  return JSON.stringify(pkg, null, 2) + '\n';
}

/**
 * Emit the LICENSE file body for the SDK's declared SPDX identifier.
 * Returns null if no license is set, or if the identifier is unknown — caller
 * skips writing the file in that case.
 */
export function emitLicense(ir: IR): string | null {
  if (!ir.meta.license) return null;
  const year = new Date().getFullYear();
  const owner = ir.meta.organization?.name ?? ir.meta.packageName;

  switch (ir.meta.license) {
    case 'MIT':
      return mitLicense(year, owner);
    case 'Apache-2.0':
      return apache2License();
    case 'ISC':
      return iscLicense(year, owner);
    case 'BSD-3-Clause':
      return bsd3License(year, owner);
    default:
      // Unknown identifier — emit an SPDX stub so package.json still resolves
      // to a real file rather than 404'ing.
      return `${ir.meta.license}\n\nSee https://spdx.org/licenses/${ir.meta.license}.html for the full text.\n`;
  }
}

function mitLicense(year: number, owner: string): string {
  return `MIT License

Copyright (c) ${year} ${owner}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
}

function iscLicense(year: number, owner: string): string {
  return `ISC License

Copyright (c) ${year} ${owner}

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
`;
}

function bsd3License(year: number, owner: string): string {
  return `BSD 3-Clause License

Copyright (c) ${year}, ${owner}

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES ARE DISCLAIMED.
`;
}

function apache2License(): string {
  // SPDX-style short reference — Apache-2.0's full text is ~12KB; users who
  // need the full text can fetch it from https://www.apache.org/licenses/LICENSE-2.0
  return `                              Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
`;
}

export function emitTsConfig(): string {
  const config = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      skipLibCheck: true,
      declaration: true,
      declarationMap: true,
      sourceMap: true,
      outDir: './dist',
      rootDir: './src',
      esModuleInterop: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      isolatedModules: true,
    },
    include: ['src'],
  };

  return JSON.stringify(config, null, 2) + '\n';
}

export function emitReadme(ir: IR): string {
  const envVarSection = ir.auth.type !== 'none'
    ? `\n## Authentication\n\nSet your API key:\n\n\`\`\`bash\nexport ${ir.auth.envVar}="your-api-key"\n\`\`\`\n\nOr pass it directly:\n\n\`\`\`typescript\nconst client = new ${ir.meta.prettyName}Client({ apiKey: 'your-api-key' });\n\`\`\`\n`
    : '';

  const docs = ir.meta.organization?.docs ? `Docs: <${ir.meta.organization.docs}>\n\n` : '';

  // Prefer the `headline` example for the main Usage block; fall back to `default`.
  const headline = ir.meta.exampleRequests?.find((e) => e.name === 'headline')
    ?? ir.meta.exampleRequests?.find((e) => e.name === 'default');
  const usage = headline ? renderUsage(ir, headline) : renderDefaultUsage(ir);

  // Render all other named examples in an "Examples" section.
  const otherExamples = (ir.meta.exampleRequests ?? []).filter(
    (e) => e !== headline && e.name !== 'default',
  );
  const examplesSection = otherExamples.length > 0
    ? `\n## Examples\n\n${otherExamples.map((e) => `### ${e.name}\n\n${renderRequestSnippet(ir, e)}`).join('\n\n')}\n`
    : '';

  return `# ${ir.meta.packageName}

${ir.meta.description}

${docs}## Installation

\`\`\`bash
npm install ${ir.meta.packageName}
\`\`\`

## Usage

${usage}
${envVarSection}${examplesSection}
---

*Generated by [Ironic](https://github.com/ironic-sdk/ironic).*
`;
}

function renderDefaultUsage(ir: IR): string {
  return `\`\`\`typescript
import { ${ir.meta.prettyName}Client } from '${ir.meta.packageName}';

const client = new ${ir.meta.prettyName}Client();
\`\`\``;
}

function renderUsage(ir: IR, example: NonNullable<IR['meta']['exampleRequests']>[number]): string {
  return `\`\`\`typescript
import { ${ir.meta.prettyName}Client } from '${ir.meta.packageName}';

const client = new ${ir.meta.prettyName}Client();

${renderEndpointCall(ir, example)}
\`\`\``;
}

function renderRequestSnippet(ir: IR, example: NonNullable<IR['meta']['exampleRequests']>[number]): string {
  return `\`\`\`typescript
${renderEndpointCall(ir, example)}
\`\`\``;
}

/**
 * Best-effort: render `client.resource.method(params)` from an endpoint string
 * like `post /api/v1/search`. We can't resolve which IR method maps to it without
 * a path-index, so we approximate: split the path tail and use the last segment
 * as a method hint. Falls back to a comment if we can't make sense of it.
 */
function renderEndpointCall(ir: IR, example: NonNullable<IR['meta']['exampleRequests']>[number]): string {
  const m = example.endpoint.match(/^(get|post|put|patch|delete)\s+(\/\S+)/i);
  if (!m) return `// ${example.endpoint}`;
  const [, , path] = m;
  // Find an IR method whose path matches.
  for (const resource of ir.resources) {
    for (const method of resource.methods) {
      if (method.path === path && method.httpMethod === m[1]!.toLowerCase()) {
        const args = formatArgs(method, example.params);
        const lhs = example.assignTo ? `const ${example.assignTo} = await ` : 'await ';
        const trailer = example.responseProperty && example.assignTo
          ? `\nconsole.log(${example.assignTo}.${example.responseProperty});`
          : '';
        return `${lhs}client.${resource.name}.${method.name}(${args});${trailer}`;
      }
    }
  }
  return `// TODO: matched endpoint not found — ${example.endpoint}`;
}

function formatArgs(method: { requestBody?: unknown; pathParams: { tsName: string }[] }, params?: Record<string, unknown>): string {
  if (!params) return '';
  // Naive: drop a `params` object as the single argument — close enough for a snippet.
  const json = JSON.stringify(params, null, 2);
  return json;
}
