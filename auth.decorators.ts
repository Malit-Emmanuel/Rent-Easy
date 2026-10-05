import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC = 'isPublic';
/** Routes are authenticated by default (secure by default); opt out explicitly. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
