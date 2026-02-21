# Society Tracker — Setup Guide

## Step 1: Supabase Database Setup

1. Go to https://supabase.com and open your project (or create a new one)
2. In the left sidebar, click **SQL Editor**
3. Click **New Query**
4. Open the file `SUPABASE_SETUP.sql` and paste its entire contents into the editor
5. Click **Run** — you'll see "Success" messages
6. Done! Your tables are created.

---

## Step 2: Get Your Supabase Keys

1. In your Supabase project, go to **Settings → API**
2. Copy two values:
   - **Project URL** (looks like: `https://abcdefgh.supabase.co`)
   - **anon / public key** (a long string starting with `eyJ...`)

---

## Step 3: Configure Your App

1. Open the file `.env.local` in your project folder
2. Replace the placeholder values:

```
VITE_SUPABASE_URL=https://YOUR_ACTUAL_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ACTUAL_ANON_KEY_HERE
```

---

## Step 4: Run Locally

Open terminal, navigate to the project folder, then:

```bash
npm install
npm run dev
```

Open http://localhost:5173 — your app is running!

---

## Step 5: Deploy to Vercel

### Option A: Via GitHub (recommended)
1. Push your project to a GitHub repo
2. Go to https://vercel.com → New Project → Import your repo
3. In **Environment Variables**, add:
   - `VITE_SUPABASE_URL` = your Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
4. Click **Deploy** — done!

### Option B: Via Vercel CLI
```bash
npm install -g vercel
vercel
# Follow the prompts, then add env vars in Vercel dashboard
```

---

## Step 6: Add Your Logo

1. Put your logo image (PNG recommended) in the `/public` folder as `logo.png`
2. In `src/App.jsx`, find this comment in the `LoginScreen` component:
   ```jsx
   {/* Replace the div above with: <img src="/logo.png" ... /> */}
   ```
3. Replace the `<div style={s.logoCircle}>◈</div>` line with:
   ```jsx
   <img src="/logo.png" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover" }} />
   ```

---

## Login Credentials

| Role   | Username         | Password  |
|--------|------------------|-----------|
| Admin  | admin            | admin123  |
| Faiz   | faiz             | member123 |
| Moeed  | moeed            | member123 |
| Umair  | umair            | member123 |
| Hassan Ali | hassanali    | member123 |
| Hassan Tariq | hassantariq | member123 |
| Farah  | farah            | member123 |
| Hamza  | hamza            | member123 |

> **Security note:** Change these passwords in `src/App.jsx` before going live.
> Look for `ADMIN_CREDS` and `MEMBER_CREDS` near the top of the file.

---

## Features Summary

- ✅ Admin login + member logins
- ✅ Record donations (donor name, amount PKR, payment method, collected by)
- ✅ Record expenses with receipt photo upload (stored in Supabase Storage)
- ✅ Delete donations & expenses (admin only)
- ✅ Export donations & expenses to CSV
- ✅ Fundraising goal with progress bar
- ✅ Member leaderboard with medals
- ✅ Dashboard with stats, recent activity, member overview
- ✅ Members see only their own donations
- ✅ All data stored in Supabase (persists across devices)
