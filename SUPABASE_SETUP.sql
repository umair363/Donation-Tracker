-- ============================================
-- SOCIETY DONATION TRACKER - SUPABASE SETUP
-- Run this entire file in Supabase SQL Editor
-- ============================================

-- 1. DONATIONS TABLE
CREATE TABLE donations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  donor_name TEXT,
  amount NUMERIC NOT NULL,
  method TEXT NOT NULL,
  reference TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. EXPENSES TABLE
CREATE TABLE expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  category TEXT NOT NULL,
  receipt_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. SETTINGS TABLE (for goal)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Insert default goal
INSERT INTO settings (key, value) VALUES ('goal', '500000');

-- 4. STORAGE BUCKET for receipts
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true);

-- 5. DISABLE ROW LEVEL SECURITY (simple setup, no auth middleware)
ALTER TABLE donations DISABLE ROW LEVEL SECURITY;
ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;

-- Storage policy: allow all operations
CREATE POLICY "Public Access" ON storage.objects FOR ALL USING (bucket_id = 'receipts');

-- ============================================
-- DONE! Your database is ready.
-- ============================================
