// ─── Uploads ─────────────────────────────────────────────────────────────────
// Multipart form data handling for file uploads.

import type { Uploadable } from './types.js';

export function isUploadable(value: unknown): value is Uploadable {
  return (
    value instanceof File ||
    value instanceof Blob ||
    (typeof ReadableStream !== 'undefined' && value instanceof ReadableStream)
  );
}

export function buildFormData(body: Record<string, unknown>): FormData {
  const formData = new FormData();
  appendFormData(formData, body, '');
  return formData;
}

function appendFormData(formData: FormData, data: unknown, prefix: string): void {
  if (data === null || data === undefined) return;
  if (isUploadable(data)) {
    if (data instanceof File) formData.append(prefix, data, data.name);
    else if (data instanceof Blob) formData.append(prefix, data);
    return;
  }
  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      appendFormData(formData, data[i], prefix ? `${prefix}[${i}]` : `${i}`);
    }
    return;
  }
  if (typeof data === 'object' && data !== null) {
    for (const [key, value] of Object.entries(data)) {
      appendFormData(formData, value, prefix ? `${prefix}[${key}]` : key);
    }
    return;
  }
  formData.append(prefix, String(data));
}
