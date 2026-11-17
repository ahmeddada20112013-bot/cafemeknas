// دالة Supabase: تسمح لصاحب المقهى فقط بتغيير كلمة مرور المدير (أو كلمة مروره).
// النشر: supabase functions deploy set-password
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // من يطلب؟
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user }, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !user) return json({ error: 'يجب تسجيل الدخول' }, 401);

  const { data: me } = await admin.from('staff').select('role').eq('user_id', user.id).maybeSingle();
  if (me?.role !== 'owner') return json({ error: 'غير مسموح' }, 403);

  const { role, password } = await req.json().catch(() => ({}));
  if (!['owner', 'manager'].includes(role) || typeof password !== 'string' || password.length < 6) {
    return json({ error: 'بيانات غير صالحة (كلمة المرور 6 أحرف على الأقل)' }, 400);
  }
  const { data: target } = await admin.from('staff').select('user_id').eq('role', role).maybeSingle();
  if (!target) return json({ error: 'الحساب غير موجود' }, 404);

  const { error } = await admin.auth.admin.updateUserById(target.user_id, { password });
  if (error) return json({ error: error.message }, 400);
  return json({ ok: true });
});
