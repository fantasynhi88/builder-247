import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import winston from 'winston';

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'nonce-validation.log' })
  ]
});

// Configuration for nonce validation
const NONCE_EXPIRY_SECONDS = 300; // 5 minutes
const MAX_NONCE_CACHE_SIZE = 10000;

interface NonceEntry {
  timestamp: number;
  used: boolean;
}

class NonceManager {
  private nonceCache: Map<string, NonceEntry> = new Map();

  /**
   * Generate a cryptographically secure nonce
   * @returns {string} A unique nonce
   */
  generateNonce(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Validate and track nonce
   * @param nonce Nonce to validate
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
    const existingEntry = this.nonceCache.get(nonce);
    if (existingEntry && existingEntry.used) {
      return false;
    }

    // Store or update nonce entry
    this.nonceCache.set(nonce, { 
      timestamp: currentTime, 
      used: true 
    });

    // Periodically clean up expired nonces
    this.cleanupCache(currentTime);

    return true;
  }

  /**
   * Clean up expired nonces from cache
   * @param currentTime Current timestamp
   */
  private cleanupCache(currentTime: number): void {
    if (this.nonceCache.size > MAX_NONCE_CACHE_SIZE) {
      for (const [key, entry] of this.nonceCache.entries()) {
        if (currentTime - entry.timestamp > NONCE_EXPIRY_SECONDS) {
          this.nonceCache.delete(key);
        }
      }
    }
  }
}

const nonceManager = new NonceManager();

/**
 * Middleware to validate request nonce
 * @param req Express request object
 * @param res Express response object
 * @param next Express next function
 */
export function nonceMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip nonce validation for certain routes
  const nonceExemptRoutes = ['/healthz', '/metrics', '/hello'];
  if (nonceExemptRoutes.includes(req.path)) {
    return next();
  }

  const startTime = Date.now();
  const nonce = req.headers['x-request-nonce'] as string;
  const timestamp = req.headers['x-request-timestamp'] as string;

  // Log nonce validation attempt
  const logContext = {
    path: req.path,
    method: req.method,
    ip: req.ip
  };

  try {
    // Validate nonce presence
    if (!nonce || !timestamp) {
      logger.warn('Nonce validation failed: Missing headers', {
        ...logContext,
        reason: 'Missing nonce or timestamp'
      });
      return res.status(400).json({
        error: 'Invalid Request',
        message: 'Nonce and timestamp headers are required'
      });
    }

    // Validate timestamp is a number
    const requestTimestamp = parseInt(timestamp, 10);
    if (isNaN(requestTimestamp)) {
      logger.warn('Nonce validation failed: Invalid timestamp', {
        ...logContext,
        reason: 'Invalid timestamp format'
      });
      return res.status(400).json({
        error: 'Invalid Request',
        message: 'Timestamp must be a valid number'
      });
    }

    // Validate nonce
    const isValid = nonceManager.validateNonce(nonce, requestTimestamp);
    if (!isValid) {
      logger.warn('Nonce validation failed', {
        ...logContext,
        reason: 'Invalid or reused nonce'
      });
      return res.status(400).json({
        error: 'Invalid Nonce',
        message: 'Nonce is invalid, expired, or already used'
      });
    }

    // Log successful validation
    logger.info('Nonce validated successfully', {
      ...logContext,
      validationTime: Date.now() - startTime
    });

    next();
  } catch (error) {
    logger.error('Unexpected error in nonce middleware', {
      ...logContext,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred'
    });
  }
}

// Export utilities for testing and external use
export { nonceManager };