/*
 * إعدادات الاتصال بـ Supabase.
 * اتركها فارغة لتشغيل التطبيق بدون Supabase (على جهاز واحد أو عبر node server.js).
 *
 * تجدها في: Supabase Dashboard ← Project Settings ← API
 *   - supabaseUrl     : Project URL
 *   - supabaseAnonKey : مفتاح anon public (مفتاح عام، آمن وضعه هنا لأن الحماية تتم عبر قواعد RLS)
 * لا تضع أبداً مفتاح service_role هنا.
 */
window.CAFE_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  // البريد الإلكتروني لكل حساب (نفس ما أنشأته في Authentication ← Users)
  emails: {
    owner: 'owner@cafemeknas.ma',
    manager: 'manager@cafemeknas.ma',
  },
};
