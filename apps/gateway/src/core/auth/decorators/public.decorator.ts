import { SetMetadata } from '@nestjs/common';

/** Marks a route as not requiring authentication (skips the global JwtAuthGuard). */
export const IS_PUBLIC_KEY = 'auth:isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
