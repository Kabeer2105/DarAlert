# DarAlert — Project Spec

Community emergency alert PWA for Dar es Salaam, Tanzania.
Anyone can submit an alert in one tap. Verified admins get a push notification instantly, even when the app is closed.

---

## Stack

| Layer | Service | Why |
|---|---|---|
| Hosting | Vercel | Free, no card, auto-deploy from GitHub |
| Database + Auth + Realtime | Supabase | Free, no card, PostgreSQL + live subscriptions |
| Push notifications | OneSignal | Free, no card, up to 10k recipients/send |

---

## Features

**Public page (index.html)**
- Select emergency type: Sick / Fire / Passed Away
- Enter name and location
- Submit → stored in Supabase → push sent to all admins
- Installable as PWA (Add to Home Screen)

**Admin page (admin.html)**
- Email + password sign in / create account (Supabase Auth)
- Real-time alert feed with timestamps + dismiss button
- Approve or deny admin access requests
- Enable push notifications (OneSignal)
- Add admins by UID

---

## File Structure

```
/
├── index.html              Public alert form
├── admin.html              Admin dashboard
├── app.js                  Public page logic (Supabase insert)
├── admin.js                Admin logic (auth, realtime, OneSignal)
├── styles.css              All styles
├── sw.js                   Service worker (PWA caching)
├── OneSignalSDKWorker.js   Required by OneSignal for push
├── manifest.json           PWA manifest
├── vercel.json             Vercel headers config
├── api/
│   └── notify.js           Vercel serverless fn → calls OneSignal
└── PLAN.md                 This file
```

---

## Database Schema

Run this entire block in **Supabase → SQL Editor → New query**:

```sql
-- Function to check admin status (avoids RLS recursion)
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.admins where id = auth.uid());
$$;

-- Alerts table (public submissions)
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  name text not null,
  address text not null,
  created_at timestamptz not null default now()
);

alter table public.alerts enable row level security;

create policy "Anyone can submit"   on public.alerts for insert with check (true);
create policy "Admins can read"     on public.alerts for select using (is_admin());
create policy "Admins can delete"   on public.alerts for delete using (is_admin());

-- Admins table
create table public.admins (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  added_by uuid,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

create policy "Self or admin can read" on public.admins for select
  using (id = auth.uid() or is_admin());
create policy "Admins can insert"   on public.admins for insert with check (is_admin());
create policy "Admins can delete"   on public.admins for delete using (is_admin());

-- Admin requests table
create table public.admin_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

alter table public.admin_requests enable row level security;

create policy "Auth users can request" on public.admin_requests for insert
  with check (auth.uid() = user_id);
create policy "Admins can read"   on public.admin_requests for select using (is_admin());
create policy "Admins can delete" on public.admin_requests for delete using (is_admin());

-- Enable realtime for alerts and requests
alter publication supabase_realtime add table public.alerts;
alter publication supabase_realtime add table public.admin_requests;
```

---

## Bootstrap: Adding the First Admin

Since no one is in the `admins` table yet, run this in **Supabase → SQL Editor** after creating your account on admin.html:

```sql
insert into public.admins (id, email, added_by)
select id, email, null
from auth.users
where email = 'your-email@example.com';
```

After that, all future admins are approved via the UI.

---

## Environment Variables

### Vercel (set in Vercel dashboard → Project → Settings → Environment Variables)
| Key | Where to get it |
|---|---|
| `ONESIGNAL_APP_ID` | OneSignal → Settings → Keys & IDs |
| `ONESIGNAL_REST_API_KEY` | OneSignal → Settings → Keys & IDs |
| `WEBHOOK_SECRET` | Make up any random string |

### In code (public keys — safe to expose)
Edit these at the top of `app.js` and `admin.js`:
| Variable | Where to get it |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `ONESIGNAL_APP_ID` | OneSignal → Settings → Keys & IDs |

---

## How Push Notifications Work

1. Admin opens admin.html → clicks **Enable Push** → OneSignal tags their device with `role: admin`
2. Anyone submits an alert → Supabase stores it → fires a **Database Webhook** to `/api/notify`
3. `/api/notify` (Vercel function) calls OneSignal API → sends push to all `role: admin` devices
4. Admin gets a push notification even when app is closed

### Setting up the Supabase Webhook
Supabase → Database → Webhooks → Create new webhook:
- Name: `notify-on-alert`
- Table: `alerts`
- Events: `INSERT`
- URL: `https://your-app.vercel.app/api/notify`
- HTTP headers: add `x-webhook-secret` = the same value as your `WEBHOOK_SECRET` env var

---

## Setup Checklist

- [ ] Create Supabase project
- [ ] Run schema SQL in Supabase SQL Editor
- [ ] Turn off email confirmation (Supabase → Auth → Providers → Email → disable "Confirm email") for easier testing
- [ ] Get Supabase URL + anon key → paste into app.js and admin.js
- [ ] Create OneSignal account → Web app → get App ID
- [ ] Get OneSignal App ID → paste into admin.js
- [ ] Push code to GitHub
- [ ] Connect repo to Vercel → set 3 env vars
- [ ] Get Vercel URL → set up Supabase webhook pointing to `/api/notify`
- [ ] Open admin.html → create account → run SQL bootstrap → done
