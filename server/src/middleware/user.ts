import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userIp?: string;
}

const COOKIE_NAME = 'pmegp_user';

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] as string || req.socket.remoteAddress || 'unknown';
}

export function userIdentification(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  let userId = req.cookies?.[COOKIE_NAME];
  
  if (!userId) {
    userId = crypto.randomUUID();
    res.cookie(COOKIE_NAME, userId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });
  }
  
  req.userId = userId;
  req.userIp = getClientIp(req);
  
  next();
}
