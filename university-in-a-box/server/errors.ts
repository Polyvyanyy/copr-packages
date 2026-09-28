export class ProductError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ProductError';
  }
}

export function isProductError(error: unknown): error is ProductError {
  return error instanceof ProductError;
}
