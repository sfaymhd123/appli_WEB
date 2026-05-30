import { Module } from '@nestjs/common';

import { PolicyService } from './policy.service';

/**
 * RBAC over the §6 matrix. PolicyService is exported for M5/M6 and for the
 * global RolesGuard (registered in AppModule). The @Roles()/@RequireAction()
 * decorators live alongside it.
 */
@Module({
  providers: [PolicyService],
  exports: [PolicyService],
})
export class RbacModule {}
