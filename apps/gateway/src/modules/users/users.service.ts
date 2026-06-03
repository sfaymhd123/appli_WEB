import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { toPrismaRole, toDomainRole } from '../../core/auth/role.mapper';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const prismaRole = toPrismaRole(dto.role);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        role: prismaRole,
      },
    });

    return {
      id: user.id,
      email: user.email,
      role: toDomainRole(user.role),
      createdAt: user.createdAt,
    };
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      role: toDomainRole(u.role),
      createdAt: u.createdAt,
    }));
  }

  async remove(id: string) {
    await this.prisma.user.delete({ where: { id } });
    return { success: true };
  }
}
