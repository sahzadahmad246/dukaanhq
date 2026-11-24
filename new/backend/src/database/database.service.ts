import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  ServiceUnavailableException,
  HttpException,
} from '@nestjs/common';
import { Pool } from 'pg';
import { AppConfig, CONFIG } from '../config/config.module';
import { timedQuery } from '../common/request-context';
import { VerifiedIdentity } from '../auth/auth.types';
import { UserTransaction, withUserTransaction } from './user-transaction';

// Metadata only; no tenant reads and no migration writes. RPC presence checks the
// current SQL 045 contract, rather than inventing a new migration history table.
export const READINESS_SQL = `select
  to_regclass('public.profiles') is not null and
  to_regclass('public.shops') is not null and
  to_regclass('public.shop_members') is not null and
  to_regclass('public.shop_settings') is not null and
  to_regclass('public.shop_entitlements') is not null and
  to_regclass('public.subscription_intents') is not null and
  to_regclass('public.saas_platform_settings') is not null and
  to_regclass('public.second_hand_purchases') is not null and
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'is_second_hand') and
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'email' and is_nullable = 'YES') and
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'onboarding_intent') and
  exists (select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='profiles' and t.tgname='guard_profile_platform_role' and t.tgenabled in ('O','A') and not t.tgisinternal) and
  to_regprocedure('public.list_shop_invoice_history(uuid,boolean,text,timestamptz,timestamptz,uuid,integer,boolean)') is not null as compatible,
  not r.rolsuper and not r.rolbypassrls and
  not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p')
    and pg_has_role(current_user, c.relowner, 'USAGE')) and
  pg_has_role(current_user, 'authenticated', 'MEMBER') as safe_role
  from pg_roles r where r.rolname = current_user`;

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool?: Pool;

  constructor(@Inject(CONFIG) config: AppConfig) {
    if (config.DATABASE_URL) {
      this.pool = new Pool({
        connectionString: config.DATABASE_URL,
        ssl: config.DATABASE_SSL ? { rejectUnauthorized: true } : false,
        max: config.DATABASE_POOL_MAX,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: config.DATABASE_CONNECT_TIMEOUT_MS,
        statement_timeout: config.DATABASE_STATEMENT_TIMEOUT_MS,
        query_timeout: config.DATABASE_STATEMENT_TIMEOUT_MS + 1000,
        lock_timeout: config.DATABASE_LOCK_TIMEOUT_MS,
        idle_in_transaction_session_timeout: 10000,
        application_name: 'dukaanhq-api',
      });
      this.pool.on('error', () =>
        this.logger.error('Database connection interrupted'),
      );
    }
  }

  async asUser<T>(
    identity: VerifiedIdentity,
    operation: (transaction: UserTransaction) => Promise<T>,
  ): Promise<T> {
    if (!this.pool)
      throw new ServiceUnavailableException({ code: 'DATABASE_UNAVAILABLE' });
    const client = await this.pool.connect().catch(() => {
      throw new ServiceUnavailableException({ code: 'DATABASE_UNAVAILABLE' });
    });
    let failed = false;
    try {
      return await withUserTransaction(client, identity, operation);
    } catch (error) {
      failed = true;
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException({ code: 'DATABASE_UNAVAILABLE' });
    } finally {
      client.release(failed);
    }
  }

  async isReady(): Promise<boolean> {
    if (!this.pool) return false;
    try {
      const result = await timedQuery(() =>
        this.pool!.query<{ compatible: boolean; safe_role: boolean }>(
          READINESS_SQL,
        ),
      );
      return (
        result.rows[0]?.compatible === true &&
        result.rows[0]?.safe_role === true
      );
    } catch {
      return false;
    }
  }

  async onApplicationShutdown() {
    await this.pool?.end();
  }
}
