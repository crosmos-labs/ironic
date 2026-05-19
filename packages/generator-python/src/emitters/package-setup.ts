import type { IR, TypeDef } from '@ironic/core';
import { fileHeader } from '../snippets/formatters.js';
import { snakeCase } from '../snippets/formatters.js';

export function emitPyprojectToml(ir: IR, moduleName: string): string {
  const licenseLine = ir.meta.license ? `license = "${ir.meta.license}"` : 'license = "Apache-2.0"';

  return `[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "${ir.meta.packageName}"
version = "${ir.meta.version}"
description = "${ir.meta.description}"
readme = "README.md"
requires-python = ">=3.9"
${licenseLine}
dependencies = [
    "httpx>=0.25.0",
    "typing_extensions>=4.7.0",
]

[project.urls]
Homepage = "${ir.meta.organization?.docs ?? ir.meta.baseURL}"

[tool.hatch.build.targets.wheel]
packages = ["${moduleName}"]
`;
}

export function emitLicense(ir: IR): string | null {
  if (!ir.meta.license) return null;
  const year = new Date().getFullYear();
  const owner = ir.meta.organization?.name ?? ir.meta.packageName;

  switch (ir.meta.license) {
    case 'MIT':
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
    case 'Apache-2.0':
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
    case 'ISC':
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
    case 'BSD-3-Clause':
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
    default:
      return `${ir.meta.license}\n\nSee https://spdx.org/licenses/${ir.meta.license}.html for the full text.\n`;
  }
}

export function emitReadme(ir: IR, moduleName: string): string {
  const envVar = ir.auth.type !== 'none' ? ir.auth.envVar : 'API_KEY';
  const docs = ir.meta.organization?.docs ? `Docs: <${ir.meta.organization.docs}>\n\n` : '';

  const authSection = ir.auth.type !== 'none'
    ? `\n## Authentication\n\nSet your API key:\n\n\`\`\`bash\nexport ${envVar}="your-api-key"\n\`\`\`\n\nOr pass it directly:\n\n\`\`\`python\nclient = ${ir.meta.prettyName}(api_key="your-api-key")\n\`\`\`\n`
    : '';

  const headline = ir.meta.exampleRequests?.find((e) => e.name === 'headline')
    ?? ir.meta.exampleRequests?.find((e) => e.name === 'default');
  const usage = headline ? renderUsage(ir, headline, moduleName) : renderDefaultUsage(ir, moduleName);

  const otherExamples = (ir.meta.exampleRequests ?? []).filter(
    (e) => e !== headline && e.name !== 'default',
  );
  const examplesSection = otherExamples.length > 0
    ? `\n## Examples\n\n${otherExamples.map((e) => `### ${e.name}\n\n${renderRequestSnippet(ir, e)}`).join('\n\n')}\n`
    : '';

  return `# ${ir.meta.prettyName} Python SDK

${ir.meta.description}

${docs}## Installation

\`\`\`bash
pip install ${ir.meta.packageName}
\`\`\`

## Usage

${usage}
${authSection}
### Async usage

\`\`\`python
import asyncio
from ${moduleName} import Async${ir.meta.prettyName}

async def main():
    client = Async${ir.meta.prettyName}()

asyncio.run(main())
\`\`\`
${examplesSection}
---

*Generated by [Ironic](https://github.com/ironic-sdk/ironic).*
`;
}

function renderDefaultUsage(ir: IR, moduleName: string): string {
  return `\`\`\`python
from ${moduleName} import ${ir.meta.prettyName}

client = ${ir.meta.prettyName}()
\`\`\``;
}

function renderUsage(ir: IR, example: NonNullable<IR['meta']['exampleRequests']>[number], moduleName: string): string {
  return `\`\`\`python
from ${moduleName} import ${ir.meta.prettyName}

client = ${ir.meta.prettyName}()

${renderEndpointCall(ir, example)}
\`\`\``;
}

function renderRequestSnippet(ir: IR, example: NonNullable<IR['meta']['exampleRequests']>[number]): string {
  return `\`\`\`python
${renderEndpointCall(ir, example)}
\`\`\``;
}

function renderEndpointCall(ir: IR, example: NonNullable<IR['meta']['exampleRequests']>[number]): string {
  const m = example.endpoint.match(/^(get|post|put|patch|delete)\s+(\/\S+)/i);
  if (!m) return `# ${example.endpoint}`;
  const [, , path] = m;
  for (const resource of ir.resources) {
    for (const method of resource.methods) {
      if (method.path === path && method.httpMethod === m[1]!.toLowerCase()) {
        const args = formatPythonArgs(example.params);
        const pyResource = snakeCase(resource.name);
        const pyMethod = snakeCase(method.name);
        const lhs = example.assignTo ? `${example.assignTo} = ` : '';
        const trailer = example.responseProperty && example.assignTo
          ? `\nprint(${example.assignTo}["${example.responseProperty}"])`
          : '';
        return `${lhs}client.${pyResource}.${pyMethod}(${args})${trailer}`;
      }
    }
  }
  return `# TODO: matched endpoint not found — ${example.endpoint}`;
}

function formatPythonArgs(params?: Record<string, unknown>): string {
  if (!params) return '';
  return Object.entries(params)
    .map(([key, value]) => `${snakeCase(key)}=${pythonRepr(value)}`)
    .join(', ');
}

function pythonRepr(value: unknown): string {
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (value === null) return 'None';
  if (Array.isArray(value)) return `[${value.map(pythonRepr).join(', ')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `"${k}": ${pythonRepr(v)}`);
    return `{${entries.join(', ')}}`;
  }
  return String(value);
}

export function emitPyTyped(): string {
  return '';
}

export function emitTopLevelInit(ir: IR): string {
  const lines: string[] = [
    fileHeader(),
    '',
    `from ._client import ${ir.meta.prettyName}, Async${ir.meta.prettyName}`,
    '',
    'from ._core import (',
    '    APIError,',
    '    APIConnectionError,',
    '    APITimeoutError,',
    '    BadRequestError,',
    '    AuthenticationError,',
    '    PermissionDeniedError,',
    '    NotFoundError,',
    '    ConflictError,',
    '    UnprocessableEntityError,',
    '    RateLimitError,',
    '    InternalServerError,',
    ')',
    '',
    'from .types import *  # noqa: F401,F403',
    '',
    `__all__ = [`,
    `    "${ir.meta.prettyName}",`,
    `    "Async${ir.meta.prettyName}",`,
    `    "APIError",`,
    `    "APIConnectionError",`,
    `    "APITimeoutError",`,
    `    "BadRequestError",`,
    `    "AuthenticationError",`,
    `    "PermissionDeniedError",`,
    `    "NotFoundError",`,
    `    "ConflictError",`,
    `    "UnprocessableEntityError",`,
    `    "RateLimitError",`,
    `    "InternalServerError",`,
    `]`,
    '',
  ];
  return lines.join('\n');
}

export function emitResourcesInit(ir: IR): string {
  const lines: string[] = [fileHeader(), ''];
  for (const resource of ir.resources) {
    const modName = snakeCase(resource.name);
    lines.push(
      `from .${modName} import ${resource.className}, Async${resource.className}`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Stainless convention: `from .file import Type as Type` for each type.
 * The `as Type` makes the re-export explicit for type checkers.
 */
export function emitTypesInit(types: TypeDef[]): string {
  const lines: string[] = [fileHeader(), '', 'from __future__ import annotations', ''];
  const sorted = [...types].sort((a, b) => a.name.localeCompare(b.name));
  for (const type of sorted) {
    const fileName = snakeCase(type.name);
    lines.push(`from .${fileName} import ${type.name} as ${type.name}`);
  }
  lines.push('');
  return lines.join('\n');
}
