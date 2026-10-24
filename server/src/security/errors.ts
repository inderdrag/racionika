import type { ApiError } from '@racionika/shared';
export class ApiFailure extends Error {
  constructor(
    public code: ApiError['error']['code'],
    public status: number,
    public messageRu: string,
    public retryAfter?: number,
  ) {
    super(code);
  }
}
