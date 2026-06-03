import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { Role } from '@hphii/fhir-domain';
import { Roles } from '../../core/rbac/decorators/roles.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { Audit } from '../../core/audit/decorators/audit.decorator';

@Controller('users')
@Roles(Role.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Audit('C')
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Delete(':id')
  @Audit('D')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
