import { cpus, platform, arch } from 'node:os';
import { writeFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../src/app';
import { parseConfig } from '../src/config/config.module';

function summarize(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (p: number) =>
    +sorted[
      Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)
    ]!.toFixed(3);
  return {
    samples: sorted.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    maxMs: percentile(1),
  };
}

async function main() {
  // Intentionally ignore real DATABASE_URL/REDIS_URL. This harness cannot touch production.
  const app = await createApp(
    parseConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
  );
  const database = new PGlite();
  try {
    // Complete WASM initialization before measuring the unrelated HTTP server.
    await database.waitReady;
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    async function measureHttp(concurrency: number) {
      const times: number[] = [];
      let responseBytes = 0;
      const started = performance.now();
      for (let batch = 0; batch < 100; batch++)
        await Promise.all(
          Array.from({ length: concurrency }, async () => {
            const start = performance.now();
            const response = await fetch(`${base}/health/live`);
            const body = await response.text();
            if (response.status !== 200)
              throw new Error('Liveness benchmark failed');
            responseBytes = Buffer.byteLength(body);
            times.push(performance.now() - start);
          }),
        );
      const elapsedMs = performance.now() - started;
      return {
        concurrency,
        requestsPerSecond: +(times.length / (elapsedMs / 1000)).toFixed(1),
        ...summarize(times),
        responseBytes,
        queryCountPerRequest: 0,
      };
    }
    for (let n = 0; n < 20; n++)
      await (await fetch(`${base}/health/live`)).arrayBuffer();
    const http = [await measureHttp(1), await measureHttp(10)];
    await database.exec(`create table benchmark_products(id integer primary key, shop_id integer not null, name text not null, price numeric(12,2) not null, created_at timestamptz not null);
      create index on benchmark_products(shop_id, created_at desc, id desc);
      create table benchmark_invoices(id integer primary key, shop_id integer not null, grand_total numeric(12,2) not null, invoice_date timestamptz not null);
      create index on benchmark_invoices(shop_id, invoice_date desc, id desc);`);
    const datasets = [];
    for (const [label, products, invoices] of [
      ['small', 100, 300],
      ['medium', 1000, 3000],
      ['large', 10000, 30000],
    ] as const) {
      await database.exec('truncate benchmark_products, benchmark_invoices');
      await database.query(
        `insert into benchmark_products select n, 1, 'Phone '||n, 12345.67, timestamptz '2026-01-01' + n * interval '1 second' from generate_series(1,$1) n`,
        [products],
      );
      await database.query(
        `insert into benchmark_invoices select n, 1, 12345.67, timestamptz '2026-01-01' + n * interval '1 second' from generate_series(1,$1) n`,
        [invoices],
      );
      await database.exec(
        'analyze benchmark_products; analyze benchmark_invoices;',
      );
      const queries = {
        inventoryWholeListPattern:
          'select * from benchmark_products where shop_id = $1 order by created_at desc, id desc',
        inventoryFirstPageCandidate:
          'select id, name, price, created_at from benchmark_products where shop_id = $1 order by created_at desc, id desc limit 50',
        dashboardInvoiceRowsPattern:
          'select id, grand_total, invoice_date from benchmark_invoices where shop_id = $1',
        dashboardAggregateCandidate:
          'select count(*)::int as invoices, coalesce(sum(grand_total),0)::text as total from benchmark_invoices where shop_id = $1',
      };
      const measurements = [];
      for (const [operation, sql] of Object.entries(queries)) {
        await database.query(sql, [1]);
        const times = [];
        let responseBytes = 0;
        let rows = 0;
        for (let sample = 0; sample < 10; sample++) {
          const start = performance.now();
          const result = await database.query(sql, [1]);
          times.push(performance.now() - start);
          rows = result.rows.length;
          responseBytes = Buffer.byteLength(JSON.stringify(result.rows));
        }
        measurements.push({
          operation,
          ...summarize(times),
          queryCount: 1,
          rows,
          responseBytes,
        });
      }
      datasets.push({ label, products, invoices, measurements });
    }
    const report = {
      recordedAt: new Date().toISOString(),
      scope:
        'Local foundation HTTP and synthetic SQL patterns only. NOT authenticated legacy app timings or production speedup claims. Invoice writes and SMS sign-in are not performed.',
      environment: {
        node: process.version,
        platform: platform(),
        arch: arch(),
        cpu: cpus()[0]?.model,
        database: 'PGlite 0.5.17, in-memory, single process',
        network: 'localhost HTTP, no TLS',
        warmed: true,
      },
      http,
      datasets,
      pending: [
        'Authenticated current sign-in',
        'Current workspace bootstrap',
        'Current inventory search',
        'Current dashboard',
        'Current bill creation in disposable staging',
      ],
    };
    const output = process.argv[2];
    if (output) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await app.close();
    await database.close();
  }
}

void main().catch(() => {
  console.error('Benchmark failed. No production data was accessed.');
  process.exitCode = 1;
});
