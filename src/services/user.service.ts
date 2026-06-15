import { Repository } from 'typeorm';
import { User } from '../entities';
import { AppDataSource } from '../data-source';
import { CreateUserDto, UpdateUserDto } from '../dtos/user.dto';
import { hashPassword } from '../utils/password';
import { NotFoundError, BadRequestError } from '../errors/CustomError';
import logger from '../config/logger';

export class UserService {
  private userRepository: Repository<User>;

  constructor() {
    this.userRepository = AppDataSource.getRepository(User);
  }

  async createUser(dto: CreateUserDto) {
    const existingUser = await this.userRepository.findOne({
      where: [{ username: dto.username }, { email: dto.email }],
    });

    if (existingUser) {
      throw new BadRequestError('User with username or email already exists');
    }

    const hashedPassword = await hashPassword(dto.password);

    const user = this.userRepository.create({
      ...dto,
      password: hashedPassword,
    });

    await this.userRepository.save(user);

    logger.info(`User created: ${user.username} (${user.role})`);

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async getUserById(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['department'],
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async getUsers(page: number = 1, pageSize: number = 20, filters?: {
    role?: string;
    departmentId?: string;
    search?: string;
  }) {
    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.department', 'department')
      .select([
        'user.id', 'user.username', 'user.email', 'user.realName',
        'user.role', 'user.phone', 'user.isActive', 'user.createdAt',
        'department.id', 'department.name', 'department.code',
      ]);

    if (filters?.role) {
      queryBuilder.andWhere('user.role = :role', { role: filters.role });
    }

    if (filters?.departmentId) {
      queryBuilder.andWhere('user.departmentId = :departmentId', { departmentId: filters.departmentId });
    }

    if (filters?.search) {
      queryBuilder.andWhere(
        '(user.username LIKE :search OR user.realName LIKE :search OR user.email LIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    const [users, total] = await queryBuilder
      .orderBy('user.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { users, total };
  }

  async getUsersByRole(role: string) {
    const users = await this.userRepository.find({
      where: { role },
      relations: ['department'],
      select: ['id', 'username', 'realName', 'role', 'email', 'phone', 'department'],
    });

    return users;
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (dto.username && dto.username !== user.username) {
      const existing = await this.userRepository.findOne({ where: { username: dto.username } });
      if (existing) {
        throw new BadRequestError('Username already taken');
      }
    }

    if (dto.email && dto.email !== user.email) {
      const existing = await this.userRepository.findOne({ where: { email: dto.email } });
      if (existing) {
        throw new BadRequestError('Email already taken');
      }
    }

    Object.assign(user, dto);
    await this.userRepository.save(user);

    logger.info(`User updated: ${user.username}`);

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async deleteUser(id: string) {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    user.isActive = false;
    await this.userRepository.save(user);

    logger.info(`User deactivated: ${user.username}`);

    return true;
  }
}

export const userService = new UserService();
