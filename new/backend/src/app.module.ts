import { Module } from '@nestjs/common';
import { AccountsModule } from './accounts/accounts.module';
import { AuthModule } from './auth/auth.module';
import { AppConfig, ConfigurationModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { RateLimitModule } from './security/rate-limit.module';
import { ShopsModule } from './shops/shops.module';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig) {
    return {
      module: AppModule,
      imports: [
        ConfigurationModule.forRoot(config),
        DatabaseModule,
        RateLimitModule,
        AuthModule,
        AccountsModule,
        ShopsModule,
      ],
      controllers: [HealthController],
    };
  }
}
