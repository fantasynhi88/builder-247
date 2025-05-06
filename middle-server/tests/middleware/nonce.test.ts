import { nonceMiddleware, nonceManager } from '../../src/middleware/nonce';
import { Request, Response, NextFunction } from 'express';
import winston from 'winston';

// Mock winston logger
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    json: jest.fn()
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn()
  }
}));

describe('Nonce Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {
      path: '/test',
      method: 'POST',
      ip: '127.0.0.1',
      headers: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    nextFunction = jest.fn();
  });

  test('should pass for exempt routes', () => {
    const exemptRoutes = ['/healthz', '/metrics', '/hello'];
    
    exemptRoutes.forEach(route => {
      mockRequest.path = route;
      nonceMiddleware(
        mockRequest as Request, 
        mockResponse as Response, 
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalled();
    });
  });

  test('should reject request without nonce', () => {
    nonceMiddleware(
      mockRequest as Request, 
      mockResponse as Response, 
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Invalid Request'
    }));
  });

  test('should generate unique nonces', () => {
    const nonce1 = nonceManager.generateNonce();
    const nonce2 = nonceManager.generateNonce();

    expect(nonce1).not.toEqual(nonce2);
    expect(nonce1.length).toBeGreaterThan(0);
  });

  test('should validate request with correct nonce', () => {
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

  test('should reject expired nonce', () => {
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
      error: 'Invalid Nonce'
    }));
  });

  test('should reject reused nonce', () => {
    const nonce = nonceManager.generateNonce();
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
      error: 'Invalid Nonce'
    }));
  });
});