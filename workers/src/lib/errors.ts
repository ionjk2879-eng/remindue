// Mirrors backend/src/main/java/com/remindue/common/GlobalExceptionHandler.java's status mapping.

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string) {
    super(400, message);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message: string) {
    super(401, message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message: string) {
    super(403, message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string) {
    super(404, message);
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, message);
  }
}

/** 무료 플랜 등록 개수 제한처럼 "업그레이드하면 풀리는" 제약에 쓴다 — 프론트가 상태코드로 프리미엄 안내 UI를 분기할 수 있게 400과 구분한다. */
export class PaymentRequiredError extends HttpError {
  constructor(message: string) {
    super(402, message);
  }
}
