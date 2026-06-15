import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../utils/jwt';
import { UnauthorizedError, ForbiddenError } from '../errors/CustomError';
import { UserRole } from '../enums';

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Authorization header is required');
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (error) {
    throw new UnauthorizedError('Invalid or expired token');
  }
};

export const authorize = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      throw new ForbiddenError('Insufficient permissions');
    }

    next();
  };
};

export const authorizeRoles = {
  admin: authorize(UserRole.ADMIN),
  manager: authorize(UserRole.ADMIN, UserRole.CSSD_MANAGER),
  disinfection: authorize(UserRole.ADMIN, UserRole.CSSD_MANAGER, UserRole.DISINFECTION_WORKER),
  nurse: authorize(UserRole.ADMIN, UserRole.CSSD_MANAGER, UserRole.NURSE),
  engineer: authorize(UserRole.ADMIN, UserRole.CSSD_MANAGER, UserRole.ENGINEER),
  allStaff: authorize(
    UserRole.ADMIN,
    UserRole.CSSD_MANAGER,
    UserRole.DISINFECTION_WORKER,
    UserRole.NURSE,
    UserRole.ENGINEER
  ),
};
