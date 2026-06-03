import { Module } from '@nestjs/common';

import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

/**
 * Demo seeder module (dev-only behaviour enforced in DemoService). Depends only
 * on the global ConfigModule; it talks to the rest of the app over HTTP, not via
 * direct service injection, so it exercises the real pipeline (ARCH.md §11).
 */
@Module({
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
