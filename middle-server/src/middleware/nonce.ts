import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Configuration for nonce validation
const NONCE_EXPIRY_SECONDS = 300; // 5 minutes
const NONCE_CACHE = new Map<string, number>();

/**
 * Generates a cryptographically secure nonce
 * @returns {string} A unique nonce
 */
export function generateNonce(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Middleware to validate request nonce
 * @param req Express request object
 * @param res Express response object
 * @param next Express next function
 */
export function nonceMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip nonce validation for certain routes or methods if needed
  const nonceExemptRoutes = ['/healthz', '/metrics'];
  if (nonceExemptRoutes.includes(req.path)) {
    return next();
  }

  const nonce = req.headers['x-request-nonce'] as string;
  const timestamp = req.headers['x-request-timestamp'] as string;

  // Validate nonce presence
  if (!nonce || !timestamp) {
    return res.status(400).json({
      error: 'Missing nonce or timestamp',
      message: 'Request must include X-Request-Nonce and X-Request-Timestamp headers'
    });
  }

  // Validate timestamp is a number
  const requestTimestamp = parseInt(timestamp, 10);
  if (isNaN(requestTimestamp)) {
    return res.status(400).json({
      error: 'Invalid timestamp',
      message: 'Timestamp must be a valid number'
    });
  }

  // Check nonce expiry
  const currentTime = Math.floor(Date.now() / 1000);
  if (currentTime - requestTimestamp > NONCE_EXPIRY_SECONDS) {
    return res.status(400).json({
      error: 'Nonce expired',
      message: 'Request nonce has expired'
    });
  }

  // Check nonce uniqueness
  if (NONCE_CACHE.has(nonce)) {
    return res.status(400).json({
      error: 'Nonce already used',
      message: 'This nonce has already been used'
    });
  }

  // Store nonce in cache with current timestamp
  NONCE_CACHE.set(nonce, currentTime);

  // Clean up expired nonces periodically
  if (NONCE_CACHE.size > 1000) {
    for (const [key, value] of NONCE_CACHE.entries()) {
      if (currentTime - value > NONCE_EXPIRY_SECONDS) {
        NONCE_CACHE.delete(key);
      }
    }
  }

  next();
}