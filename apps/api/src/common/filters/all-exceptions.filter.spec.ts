import { type ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DomainError } from '../errors/domain-error';
import { AllExceptionsFilter } from './all-exceptions.filter';

function createHost() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({}),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  it('returns a domain error without a stack', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = createHost();

    filter.catch(new DomainError('not_found', 'Workspace was not found', 404), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      statusCode: 404,
      code: 'not_found',
      message: 'Workspace was not found',
    });
    expect(JSON.stringify(json.mock.calls)).not.toContain('stack');
  });

  it('hides unexpected errors', () => {
    const filter = new AllExceptionsFilter();
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { host, status, json } = createHost();

    filter.catch(new Error('database password leaked'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      code: 'internal_error',
      message: 'Internal server error',
    });
    expect(JSON.stringify(json.mock.calls)).not.toContain('database password leaked');
    errorSpy.mockRestore();
  });

  it('passes through HTTP exceptions', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = createHost();

    filter.catch(new HttpException('Nope', 418), host);

    expect(status).toHaveBeenCalledWith(418);
    expect(json).toHaveBeenCalledWith({
      statusCode: 418,
      message: 'Nope',
    });
  });
});
