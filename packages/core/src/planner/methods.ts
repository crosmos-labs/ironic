// ─── Method Planner ──────────────────────────────────────────────────────────
// Resolve individual API operations into MethodNode objects.

import type { OperationObject, ParameterObject, SchemaObject } from 'openapi3-ts/oas31';
import type { MethodNode, ParamNode, TypeRef } from '../ir/types.js';
import { camelCase } from '../utils/naming.js';
import { schemaToTypeRef } from '../utils/schema.js';
import { IronicUserError } from '../errors.js';

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
  schemaRegistry?: Map<object, string>,
): MethodNode {
  // Extract parameters
  const params = (operation.parameters ?? []) as ParameterObject[];
  const pathParams: ParamNode[] = [];
  const queryParams: ParamNode[] = [];
  const headerParams: ParamNode[] = [];
  const cookieParams: ParamNode[] = [];

  for (const param of params) {
    const node: ParamNode = {
      name: param.name,
      tsName: camelCase(param.name),
      type: schemaToTypeRef(param.schema as SchemaObject | undefined, param.name, schemaRegistry),
      required: param.required ?? false,
      description: param.description,
      style: param.style,
      explode: param.explode,
    };

    validateParameter(param, node.type, `${httpMethod.toUpperCase()} ${path}`);

    if (param.in === 'path') {
      node.required = true; // path params are always required
      pathParams.push(node);
    } else if (param.in === 'query') {
      queryParams.push(node);
    } else if (param.in === 'header') {
      headerParams.push(node);
    } else if (param.in === 'cookie') {
      cookieParams.push(node);
    }
  }

  // Extract request body
  let requestBody: TypeRef | null = null;
  let requestBodyContentType: MethodNode['requestBodyContentType'];
  let requestBodyRequired = false;
  if (operation.requestBody) {
    const rb = operation.requestBody as unknown as Record<string, unknown>;
    const content = rb.content as Record<string, { schema?: SchemaObject }> | undefined;
    requestBodyRequired = rb.required === true;
    const supported = ['application/json', 'multipart/form-data', 'text/plain', 'application/octet-stream'] as const;
    requestBodyContentType = supported.find((media) => content?.[media]?.schema);
    const bodySchema = requestBodyContentType ? content?.[requestBodyContentType]?.schema : undefined;
    if (bodySchema) requestBody = requestBodyContentType === 'application/octet-stream'
      ? { kind: 'primitive', type: 'string' }
      : schemaToTypeRef(bodySchema, `${name}Body`, schemaRegistry);
    if (content && Object.keys(content).length && !requestBodyContentType) {
      throw new IronicUserError('UNSUPPORTED_MEDIA_TYPE', `${httpMethod.toUpperCase()} ${path}: unsupported request media type ${Object.keys(content).join(', ')}`);
    }
  }

  // Extract response type
  const { responseType, responseFormat, responseContentType } = resolveResponseType(operation, name, schemaRegistry);

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
    headerParams,
    cookieParams,
    requestBody,
    requestBodyRequired,
    requestBodyContentType,
    responseType,
    responseFormat,
    responseContentType,
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
function resolveResponseType(operation: OperationObject, methodName: string, schemaRegistry?: Map<object, string>): Pick<MethodNode, 'responseType' | 'responseFormat' | 'responseContentType'> {
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
    return { responseType: { kind: 'primitive', type: 'void' } };
  }

  const response = responses[successCode] as Record<string, unknown> | undefined;
  if (!response) return { responseType: { kind: 'primitive', type: 'void' } };

  const content = response.content as Record<string, { schema?: SchemaObject }> | undefined;
  if (!content) return { responseType: { kind: 'primitive', type: 'void' } };

  const jsonContent = content['application/json'] ?? Object.entries(content).find(([media]) => media.endsWith('+json'))?.[1];
  if (jsonContent?.schema) return { responseType: schemaToTypeRef(jsonContent.schema, `${methodName}Response`, schemaRegistry), responseFormat: 'json' };
  const textMedia = Object.keys(content).find((media) => media.startsWith('text/') && media !== 'text/event-stream');
  if (textMedia) return { responseType: { kind: 'primitive', type: 'string' }, responseFormat: 'text', responseContentType: textMedia };
  const binaryMedia = Object.entries(content).find(([media, entry]) => media === 'application/octet-stream' || entry.schema?.format === 'binary')?.[0];
  if (binaryMedia) return { responseType: { kind: 'primitive', type: 'string' }, responseFormat: 'binary', responseContentType: binaryMedia };
  if (content['text/event-stream']) return { responseType: { kind: 'primitive', type: 'string' } };
  if (Object.keys(content).length) throw new IronicUserError('UNSUPPORTED_MEDIA_TYPE', `${methodName}: unsupported response media type ${Object.keys(content).join(', ')}`);

  return { responseType: { kind: 'primitive', type: 'void' } };
}

function validateParameter(param: ParameterObject, type: TypeRef, operation: string): void {
  const style = param.style ?? (param.in === 'query' || param.in === 'cookie' ? 'form' : 'simple');
  const explode = param.explode ?? (style === 'form' || style === 'deepObject');
  const scalar = type.kind === 'primitive' || type.kind === 'enum' || type.kind === 'nullable';
  const array = type.kind === 'array';
  const object = type.kind === 'object' || type.kind === 'record';
  const supported = param.in === 'query'
    ? (style === 'form' && (scalar || array || object)) ||
      (style === 'deepObject' && explode && (object || type.kind === 'ref')) ||
      ((style === 'spaceDelimited' || style === 'pipeDelimited') && array && !explode)
    : param.in === 'header'
      ? style === 'simple' && (scalar || array)
      : param.in === 'cookie'
        ? style === 'form' && scalar
        : param.in === 'path'
          ? style === 'simple' && scalar
          : false;
  if (!supported) throw new IronicUserError('UNSUPPORTED_PARAMETER', `${operation}: unsupported ${param.in} parameter ${param.name} (${style}, explode=${explode}, ${type.kind})`);
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
