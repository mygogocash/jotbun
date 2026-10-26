// Build-time stand-in for `@nestjs/common` when the edge Worker bundles the
// v1 API's domain modules (apps/api/src). Those modules use Nest only for
// decorators and constructor injection; the edge builds the same object graph
// by hand (server/app/container.ts), so every decorator here is a no-op and
// nothing reads Nest metadata. HttpException keeps the one behaviour the
// domain code relies on: ProblemException extends it and reports its status.

type AnyDecorator = (...args: unknown[]) => void;
const noop: AnyDecorator = () => undefined;
const decoratorFactory = (..._args: unknown[]): AnyDecorator => noop;

export const Injectable = decoratorFactory;
export const Inject = decoratorFactory;
export const Optional = decoratorFactory;
export const Global = decoratorFactory;
export const Module = decoratorFactory;
export const Controller = decoratorFactory;
export const Catch = decoratorFactory;
export const Get = decoratorFactory;
export const Post = decoratorFactory;
export const Put = decoratorFactory;
export const Patch = decoratorFactory;
export const Delete = decoratorFactory;
export const Body = decoratorFactory;
export const Param = decoratorFactory;
export const Query = decoratorFactory;
export const Headers = decoratorFactory;
export const Header = decoratorFactory;
export const HttpCode = decoratorFactory;
export const Res = decoratorFactory;
export const Req = decoratorFactory;
export const UseInterceptors = decoratorFactory;
export const SetMetadata = decoratorFactory;

export function createParamDecorator(..._args: unknown[]): (...args: unknown[]) => AnyDecorator {
  return decoratorFactory;
}

export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  GONE = 410,
  PAYLOAD_TOO_LARGE = 413,
  UNPROCESSABLE_ENTITY = 422,
  UPGRADE_REQUIRED = 426,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  SERVICE_UNAVAILABLE = 503,
}

export class HttpException extends Error {
  private readonly status: number;

  constructor(response: unknown, status: number) {
    super(typeof response === 'string' ? response : 'Http Exception');
    this.name = new.target.name;
    this.status = status;
  }

  getStatus(): number {
    return this.status;
  }
}

/** Only `RequestMethod[...]` lookups appear in shared code (route manifests), which the edge never runs. */
export enum RequestMethod {
  GET = 0,
  POST = 1,
  PUT = 2,
  DELETE = 3,
  PATCH = 4,
  ALL = 5,
  OPTIONS = 6,
  HEAD = 7,
}

/** Shared code returns files through StreamableFile only on routes the edge forwards. */
export class StreamableFile {
  constructor(readonly body: Uint8Array, readonly options: { type?: string; length?: number } = {}) {}
}
