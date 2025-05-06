import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Configuration for nonce validation
const NONCE_EXPIRY_SECONDS = 300; // 5 minutes
const MAX_NONCE_CACHE_SIZE = 10000;

class NonceManager {
  private nonceCache: Map<string, number> = new Map();

  /**
   * Generate a secure nonce
   * @returns {string} A unique nonce
   */
  generateNonce(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Validate and track nonce
   * @param nonce The nonce to validate
   * @param requestTimestamp Timestamp of the request
   * @returns {boolean} Whether the nonce is valid
   */
  validateNonce(nonce: string, requestTimestamp: number): boolean {
    const currentTime = Math.floor(Date.now() / 1000);

    // Check nonce expiry
    if (currentTime - requestTimestamp > NONCE_EXPIRY_SECONDS) {
      return false;
    }

    // Check nonce uniqueness
    if (this.nonceCache.has(nonce)) {
      return false;
    }

    // Store nonce with current timestamp
    this.nonceCache.set(nonce, currentTime);

    // Clean up expired nonces periodically
    this.cleanupCache(currentTime);

    return true;
  }

  /**
   * Clean up expired nonces from cache
   * @param currentTime Current timestamp
   */
  private cleanupCache(currentTime: number): void {
    if (this.nonceCache.size > MAX_NONCE_CACHE_SIZE) {
      for (const [key, timestamp] of this.nonceCache.entries()) {
        if (currentTime - timestamp > NONCE_EXPIRY_SECONDS) {
          this.nonceCache.delete(key);
        }
      }
    }
  }
}

const nonceManager = new NonceManager();

/**
 * Middleware to validate request nonce
 * Rejects requests with invalid or missing nonces
 * Provides secure request authentication
 */
export function nonceMiddleware(req: Request, res: Response, next: NextFunction) {
  // Exempt routes from nonce validation
  const exemptRoutes = ['/healthz', '/metrics', '/hello'];
  if (exemptRoutes.includes(req.path)) {
    return next();
  }

  // Extract nonce and timestamp from headers
  const nonce = req.headers['x-request-nonce'] as string;
  const timestampHeader = req.headers['x-request-timestamp'] as string;

  // Validate header presence
  if (!nonce || !timestampHeader) {
    return res.status(400).json({
      error: 'Nonce Validation Failed',
      message: 'Nonce and timestamp headers are required'
    });
  }

  // Validate timestamp
  const requestTimestamp = parseInt(timestampHeader, 10);
  if (isNaN(requestTimestamp)) {
    return res.status(400).json({
      error: 'Nonce Validation Failed',
      message: 'Invalid timestamp format'
    });
  }

  // Perform nonce validation
  const isValid = nonceManager.validateNonce(nonce, requestTimestamp);
  if (!isValid) {
    return res.status(400).json({
      error: 'Nonce Validation Failed',
      message: 'Nonce is invalid, expired, or already used'
    });
  }

  // Proceed to next middleware
  next();
}

// Export for testing and external use
export { nonceManager };