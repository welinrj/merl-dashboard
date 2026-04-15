// ── Supabase client — DoCC MERL Dashboard ────────────────────────────────────
// Project: merl-dashboard-docc  |  Region: ap-southeast-2
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = 'https://mgqveofmnofmwejxrbxp.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ncXZlb2Ztbm9mbXdlanhyYnhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNzAxMDIsImV4cCI6MjA5MTg0NjEwMn0.2EnzuxujaAHSlQoXaFQZsdIW1Rmj4FHAxexYzv0gk-8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
