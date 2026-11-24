# Supabase database CA

`supabase-ca.crt` is the public Supabase Root 2021 CA (not a private key).
Downloaded from Supabase's public download bucket:
https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

SHA-256 fingerprint:
`807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA`.
Valid until 26 April 2031. Obtain replacement certificates through your project's
Database Settings → SSL Configuration if the provider rotates its trust chain.

For this local setup, `.env` contains:

```dotenv
NODE_EXTRA_CA_CERTS=certs/supabase-ca.crt
```

Run through `bun run start` or `bun dev`: Bun loads `.env` before launching Node.
For direct Node execution, export `NODE_EXTRA_CA_CERTS` before starting the process;
Node does not load additional trust roots from a late runtime environment change.
Keep `DATABASE_SSL=true`; certificate/hostname verification remains enabled.

Reference: https://supabase.com/docs/guides/platform/ssl-enforcement
