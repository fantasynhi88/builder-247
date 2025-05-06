import { generateNonce, nonceMiddleware } from '../../src/middleware/nonce';
import { Request, Response, NextFunction } from 'express';

describe('Nonce Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {
      path: '/test',
      headers: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    nextFunction = jest.fn();
  });

  test('generateNonce creates a unique hex string', () => {
    const nonce1 = generateNonce();
    const nonce2 = generateNonce();

    expect(nonce1).not.toEqual(nonce2);
    expect(nonce1.length).toBeGreaterThan(0);
    expect(/^[0-9a-f]+$/.test(nonce1)).toBeTruthy();
  });

  test('should reject request without nonce', () => {
    nonceMiddleware(
      mockRequest as Request, 
      mockResponse as Response, 
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Missing nonce or timestamp'
    }));
  });

  test('should allow request with valid nonce', () => {
    const nonce = generateNonce();
    const timestamp = Math.floor(Date.now() / 1000);

    mockRequest.headers = {
      'x-request-nonce': nonce,
      'x-request-timestamp': timestamp.toString()
    };

    nonceMiddleware(
      mockRequest as Request, 
      mockResponse as Response, 
      nextFunction
    );

    expect(nextFunction).toHaveBeenCalled();
  });

  test('should reject request with expired nonce', () => {
    const nonce = generateNonce();
    const timestamp = Math.floor(Date.now() / 1000) - 400; // older than 5 minutes

    mockRequest.headers = {
      'x-request-nonce': nonce,
      'x-request-timestamp': timestamp.toString()
    };

    nonceMiddleware(
      mockRequest as Request, 
      mockResponse as Response, 
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Nonce expired'
    }));
  });

  test('should reject duplicate nonce', () => {
    const nonce = generateNonce();
    const timestamp = Math.floor(Date.now() / 1000);

    mockRequest.headers = {
      'x-request-nonce': nonce,
      'x-request-timestamp': timestamp.toString()
    };

    // First request
    nonceMiddleware(
      mockRequest as Request, 
      mockResponse as Response, 
      nextFunction
    );

    expect(nextFunction).toHaveBeenCalled();

    // Reset mocks
    nextFunction = jest.fn();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    // Second request with same nonce
    nonceMiddleware(
      mockRequest as Request, 
      mockResponse as Response, 
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Nonce already used'
    }));
  });

  test('should allow requests to exempt routes', () => {
    mockRequest.path = '/healthz';

    nonceMiddleware(
      mockRequest as Request, 
      mockResponse as Response, 
      nextFunction
    );

    expect(nextFunction).toHaveBeenCalled();
  });
});