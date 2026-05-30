import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/** Global so any module (auth, audit, M1..M6) can inject PrismaService. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
