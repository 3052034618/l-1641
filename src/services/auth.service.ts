import { Repository } from 'typeorm';
import { User } from '../entities';
import { AppDataSource } from '../data-source';
import { LoginDto, RegisterDto, ChangePasswordDto } from '../dtos/auth.dto';
import { UnauthorizedError, NotFoundError, BadRequestError, ConflictError } from '../errors/CustomError';
import { comparePassword, hashPassword } from '../utils/password';
import { generateToken, JwtPayload } from '../utils/jwt';
import logger from '../config/logger';

export class AuthService {
  private userRepository: Repository<User>;

  constructor() {
    this.userRepository = AppDataSource.getRepository(User);
  }

  async login(dto: LoginDto) {
    const user = await this.userRepository.findOne({
      where: { username: dto.username },
      relations: ['department'],
    });

    if (!user) {
      throw new UnauthorizedError('Invalid username or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account is disabled');
    }

    const isPasswordValid = await comparePassword(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid username or password');
    }

    const payload: JwtPayload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      departmentId: user.departmentId,
    };

    const token = generateToken(payload);

    logger.info(`User ${user.username} logged in successfully`);

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        realName: user.realName,
        role: user.role,
        phone: user.phone,
        email: user.email,
        department: user.department,
      },
    };
  }

  async register(dto: RegisterDto) {
    const existingUser = await this.userRepository.findOne({
      where: { username: dto.username },
    });

    if (existingUser) {
      throw new ConflictError('Username already exists');
    }

    const hashedPassword = await hashPassword(dto.password);

    const user = this.userRepository.create({
      ...dto,
      password: hashedPassword,
    });

    await this.userRepository.save(user);

    logger.info(`User ${user.username} registered successfully`);

    return {
      id: user.id,
      username: user.username,
      realName: user.realName,
      role: user.role,
    };
  }

  async getCurrentUser(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['department'],
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return {
      id: user.id,
      username: user.username,
      realName: user.realName,
      role: user.role,
      phone: user.phone,
      email: user.email,
      department: user.department,
      isActive: user.isActive,
      createdAt: user.createdAt,
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const isOldPasswordValid = await comparePassword(dto.oldPassword, user.password);
    if (!isOldPasswordValid) {
      throw new BadRequestError('Old password is incorrect');
    }

    user.password = await hashPassword(dto.newPassword);
    await this.userRepository.save(user);

    logger.info(`User ${user.username} changed password successfully`);

    return { message: 'Password changed successfully' };
  }

  async getCurrentUserPermissions(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const permissions = this.getPermissionsByRole(user.role);

    return {
      role: user.role,
      permissions,
    };
  }

  private getPermissionsByRole(role: string): string[] {
    const rolePermissions: Record<string, string[]> = {
      admin: ['*'],
      cssd_manager: [
        'package:view', 'package:create', 'package:update', 'package:delete',
        'recovery:view', 'recovery:create',
        'cleaning:view', 'cleaning:create', 'cleaning:update',
        'sterilization:view', 'sterilization:create', 'sterilization:update',
        'distribution:view', 'distribution:create',
        'report:view', 'report:export',
        'workorder:view', 'workorder:assign',
        'user:view', 'user:create', 'user:update',
        'equipment:view', 'equipment:manage',
      ],
      disinfection_worker: [
        'package:view',
        'recovery:view', 'recovery:create',
        'cleaning:view', 'cleaning:create', 'cleaning:update',
        'sterilization:view', 'sterilization:create',
      ],
      nurse: [
        'package:view',
        'distribution:view', 'distribution:create',
        'recovery:view', 'recovery:create',
      ],
      engineer: [
        'workorder:view', 'workorder:update',
        'equipment:view',
      ],
    };

    return rolePermissions[role] || [];
  }
}

export const authService = new AuthService();
