declare global {
  namespace Express {
    interface Request {
      nonce?: string;
    }
  }
}

export {};