import { nonceMiddleware, nonceManager } from '../../src/middleware/nonce';
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

  // Test exempt routes
  const exemptRoutes = ['/healthz', '/metrics', '/hello'];
  exemptRoutes.forEach(route => {
    it(`should pass middleware for exempt route ${route}`, () => {
      mockRequest.path = route;
      nonceMiddleware(
        mockRequest as Request, 
        mockResponse as Response, 
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalled();
    });
  });

  // Test missing headers
  it('should reject request without nonce header', () => {
    nonceMiddleware(
      mockRequest as Request, 
      mockResponse as Response, 
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Nonce Validation Failed',
      message: 'Nonce and timestamp headers are required'
    }));
  });

  // Test invalid timestamp
  it('should reject request with invalid timestamp', () => {
    const nonce = nonceManager.generateNonce();
    mockRequest.headers = {
      'x-request-nonce': nonce,
      'x-request-timestamp': 'invalid'
    };

    nonceMiddleware(
      mockRequest as Request, 
      mockResponse as Response, 
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Nonce Validation Failed',
      message: 'Invalid timestamp format'
    }));
  });

  // Test valid nonce flow
  it('should allow request with valid nonce', () => {
    const nonce = nonceManager.generateNonce();
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

  // Test nonce reuse
  it('should reject reused nonce', () => {
    const nonce = nonceManager.generateNonce();
    const timestamp = Math.floor(Date.now() / 1000);

    // First request (should pass)
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

    // Reset mocks
    nextFunction = jest.fn();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    // Second request with same nonce (should fail)
    nonceMiddleware(
      mockRequest as Request, 
      mockResponse as Response, 
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Nonce Validation Failed',
      message: 'Nonce is invalid, expired, or already used'
    }));
  });

  // Test expired nonce
  it('should reject expired nonce', () => {
    const nonce = nonceManager.generateNonce();
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
      error: 'Nonce Validation Failed',
      message: 'Nonce is invalid, expired, or already used'
    }));
  });
});