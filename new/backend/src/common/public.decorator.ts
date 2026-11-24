import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'dukaanhq:public';
export const Public = () => SetMetadata(IS_PUBLIC, true);
