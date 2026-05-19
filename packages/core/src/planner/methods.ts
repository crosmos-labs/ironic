// ─── Method Planner ──────────────────────────────────────────────────────────
// Resolve individual API operations into MethodNode objects.

import type { OperationObject, ParameterObject, SchemaObject } from 'openapi3-ts/oas31';
import type { MethodNode, ParamNode, TypeRef } from '../ir/types.js';
import { camelCase } from '../utils/naming.js';
import { schemaToTypeRef } from '../utils/schema.js';

/**
 * Build a MethodNode from an OpenAPI operation.
 */
export function planMethod(
  name: string,
  httpMethod: string,
  path: string,
  operation: OperationObject,
  overrides?: {
    pagination?: string;
    streamOption?: boolean;
    responseUnwrap?: string | boolean;
    deprecated?: boolean;
    descriptionOverride?: string;
  },
): MethodNode {
  // Extract parameters
  const params = (operation.parameters ?? []) as ParameterObject[];
  const pathParams: ParamNode[] = [];
  const queryParams: ParamNode[] = [];

  for (const param of params) {
    const node: ParamNode = {
      name: param.name,
      tsName: camelCase(param.name),
      type: schemaToTypeRef(param.schema as SchemaObject | undefined, param.name),
      required: param.required ?? false,
      description: param.description,
    };

    if (param.in === 'path') {
      node.required = true; // path params are always required
      pathParams.push(node);
    } else if (param.in === 'query') {
      queryParams.push(node);
    }
  }

  // Extract request body
  let requestBody: TypeRef | null = null;
  if (operation.requestBody) {
    const rb = operation.requestBody as unknown as Record<string, unknown>;
    const content = rb.content as Record<string, { schema?: SchemaObject }> | undefined;
    const jsonContent = content?.['application/json'];
    const formContent = content?.['multipart/form-data'];

    const bodySchema = jsonContent?.schema ?? formContent?.schema;
    if (bodySchema) {
      requestBody = schemaToTypeRef(bodySchema, `${name}Body`);
    }
  }

  // Extract response type
  const responseType = resolveResponseType(operation, name);

  // Detect streaming from response content-type
  const streaming = detectStreaming(operation);

  return {
    name,
    httpMethod: httpMethod.toLowerCase() as MethodNode['httpMethod'],
    path,
    description: overrides?.descriptionOverride ?? operation.description ?? operation.summary,
    deprecated: overrides?.deprecated ?? operation.deprecated ?? false,
    pathParams,
    queryParams,
    requestBody,
    responseType,
    pagination: overrides?.pagination,
    streaming,
    streamOption: overrides?.streamOption ?? false,
    responseUnwrap: typeof overrides?.responseUnwrap === 'string'
      ? overrides.responseUnwrap
      : undefined,
    operationId: operation.operationId,
  };
}

/**
 * Resolve the success response type from an operation.
 * Prefers 200, then 201, then 2xx, then first response.
 */
function resolveResponseType(operation: OperationObject, methodName: string): TypeRef {
  const responses = operation.responses ?? {};
  const statusCodes = Object.keys(responses);

  // Priority: 200, 201, 2xx, first
  const successCode =
    statusCodes.find((c) => c === '200') ??
    statusCodes.find((c) => c === '201') ??
    statusCodes.find((c) => c === '2XX' || c === '2xx') ??
    statusCodes.find((c) => c.startsWith('2')) ??
    statusCodes[0];

  if (!successCode) {
    return { kind: 'primitive', type: 'void' };
  }

  const response = responses[successCode] as Record<string, unknown> | undefined;
  if (!response) return { kind: 'primitive', type: 'void' };

  const content = response.content as Record<string, { schema?: SchemaObject }> | undefined;
  if (!content) return { kind: 'primitive', type: 'void' };

  const jsonContent = content['application/json'];
  if (!jsonContent?.schema) return { kind: 'primitive', type: 'void' };

  return schemaToTypeRef(jsonContent.schema, `${methodName}Response`);
}

/**
 * Detect if an operation returns a streaming response (SSE).
 */
function detectStreaming(operation: OperationObject): boolean {
  const responses = operation.responses ?? {};
  for (const response of Object.values(responses)) {
    const resp = response as Record<string, unknown>;
    const content = resp.content as Record<string, unknown> | undefined;
    if (content && ('text/event-stream' in content)) {
      return true;
    }
  }
  return false;
}
