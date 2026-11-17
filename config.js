/*
 * إعدادات الاتصال بـ Supabase.
 * اتركها فارغة لتشغيل التطبيق بدون Supabase (على جهاز واحد أو عبر node server.js).
 *
 * تجدها في: Supabase Dashboard ← Project Settings ← API
 *   - supabaseUrl     : Project URL
 *   - supabaseAnonKey : مفتاح Publishable (أو anon public) (مفتاح عام، آمن وضعه هنا لأن الحماية تتم عبر قواعد RLS)
 * لا تضع أبداً مفتاح service_role هنا.
 */
window.CAFE_CONFIG = {
  supabaseUrl: 'https://tpmmvddffahalmtsiidu.supabase.co',
  supabaseAnonKey: 'sb_publishable_KfFqlVrar0z6h4Y1X0pw0g_BF7Zlx5s',
  // البريد الإلكتروني لكل حساب (نفس ما أنشأته في Authentication ← Users)
  emails: {
    owner: 'owner@cafemeknas.ma',
    manager: 'manager@cafemeknas.ma',
  },
};
