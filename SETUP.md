# DukaanHQ Setup Guide

This project uses:
- Next.js
- Bun
- Supabase Auth
- Google OAuth
- Cloudinary
- Resend

## 1. Local Setup

### Requirements
- Bun installed
- Supabase account
- Google Cloud account
- Cloudinary account
- Resend account

### Install and run
```bash
bun install
bun dev
```

App URL for local development:
- `http://localhost:3000`

## 2. Environment File

Copy `.env.example` to `.env.local`.

```bash
cp .env.example .env.local
```

Fill in all keys before testing auth.

## 3. Supabase Project Setup

### Create project
1. Go to `https://supabase.com/dashboard`
2. Click `New project`
3. Choose organization
4. Enter project name: `DukaanHQ`
5. Set database password
6. Choose nearest region
7. Create the project

### Get project keys
1. Open the project
2. Go to `Project Settings`
3. Open `Data API` or `API` section depending on dashboard layout
4. Copy:
   - `Project URL`
   - `anon public key`

Put them in:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Configure auth URLs
1. In Supabase dashboard go to `Authentication`
2. Open `URL Configuration`
3. Set site URL:
   - `http://localhost:3000`
4. Add redirect URL:
   - `http://localhost:3000/auth/callback`

Later add production URLs too.

## 3A. Run The Initial Profiles SQL

After creating the Supabase project, run the SQL in:
- `db/001_profiles.sql`

How:
1. Open Supabase dashboard
2. Go to `SQL Editor`
3. Create a new query
4. Paste the contents of `db/001_profiles.sql`
5. Run it

This creates:
- `profiles` table
- default role = `customer`
- RLS policies for each signed-in user to manage their own profile

## 4. Google OAuth Setup For Supabase

### Create Google OAuth credentials
1. Go to `https://console.cloud.google.com/`
2. Create a new project or use an existing one
3. Open `APIs & Services`
4. Go to `OAuth consent screen`
5. Configure the app:
   - app name: `DukaanHQ`
   - support email
   - developer contact email
6. Add test users if app is still in testing mode

### Create OAuth client
1. Open `Credentials`
2. Click `Create Credentials`
3. Choose `OAuth client ID`
4. Application type: `Web application`
5. Add authorized redirect URI from Supabase

### Get the Supabase Google callback URL
1. In Supabase dashboard go to `Authentication`
2. Go to `Providers`
3. Open `Google`
4. Supabase will show the callback URL to use

It usually looks like:
`https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`

### Finish provider setup
1. Copy Google `Client ID`
2. Copy Google `Client Secret`
3. Paste them into Supabase `Google` provider settings
4. Enable the provider

No Google key goes into `.env.local` for this app right now. Google is configured inside Supabase.

## 5. Cloudinary Setup

### Create account
1. Go to `https://cloudinary.com/`
2. Create a free account
3. Open the dashboard

### Get credentials
Copy:
- `Cloud name`
- `API Key`
- `API Secret`

Put them in:
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Use Cloudinary for:
- shop logos
- product images
- storefront media later

## 6. Resend Setup

### Create account
1. Go to `https://resend.com/`
2. Create account
3. Open API keys section
4. Create a new API key

Put it in:
- `RESEND_API_KEY`

Resend will be used for:
- staff invitations
- basic system emails

For local/dev testing, you can start with the default Resend testing setup and add your own domain later.

## 7. Current Authentication Flow

Current auth flow in this project:
1. user visits landing page
2. clicks `Get Started`
3. goes to `/auth/login`
4. clicks `Continue with Google`
5. Supabase redirects to Google
6. Google returns to `/auth/callback`
7. session is created
8. user lands on `/app`

Next step after this:
- build onboarding
- create `shops`
- create `profiles`
- link user to tenant and role

## 8. Required Env Variables

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
RESEND_API_KEY=
```

## 9. Common Errors

### `redirect_uri_mismatch`
Cause:
- Google redirect URI does not match Supabase callback URL

Fix:
- copy the exact callback URL from Supabase Google provider settings into Google Cloud OAuth client

### `NEXT_PUBLIC_APP_URL is not configured`
Cause:
- missing `.env.local` value

Fix:
- set `NEXT_PUBLIC_APP_URL=http://localhost:3000`

### Login succeeds but session is missing
Cause:
- wrong site URL or redirect URL in Supabase

Fix:
- confirm:
  - site URL = `http://localhost:3000`
  - redirect URL = `http://localhost:3000/auth/callback`

## 3B. Run The Shop Onboarding SQL

Before the onboarding form can save data, run the SQL in:
- `db/002_shop_onboarding.sql`

How:
1. Open Supabase dashboard
2. Go to `SQL Editor`
3. Create a new query
4. Paste the contents of `db/002_shop_onboarding.sql`
5. Run it

This creates:
- `shops`
- `shop_settings`
- `shop_members`
- RLS policies for the onboarding flow

## 10. Next Build Step

After auth is confirmed working:
1. onboarding flow
2. shop creation
3. profile creation
4. role assignment
5. staff invitation system
