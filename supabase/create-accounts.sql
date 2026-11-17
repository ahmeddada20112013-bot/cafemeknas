-- =====================================================================
--  إنشاء حسابَي صاحب المقهى والمدير وربطهما بالأدوار — دفعة واحدة
--  شغّله في: Supabase Dashboard ← SQL Editor ← New query ← Run
--  (بعد تشغيل schema.sql). يمكن تشغيله أكثر من مرة:
--  إن كان الحساب موجوداً تُعاد كلمة مروره فقط إلى القيمة أدناه.
--
--  ⚠️ غيّر كلمتي المرور بعد أول دخول (الإعدادات ← كلمات المرور).
-- =====================================================================
do $$
declare
  acc record;
  uid uuid;
  pw  text := '000000';   -- كلمة المرور الأولى للحسابين
begin
  for acc in
    select * from (values
      ('owner@cafemeknas.ma',   'owner',   'صاحب المقهى'),
      ('manager@cafemeknas.ma', 'manager', 'مدير المقهى')
    ) as t(email, role, title)
  loop
    select id into uid from auth.users where email = acc.email;

    if uid is null then
      uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', acc.email,
        extensions.crypt(pw, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}', '{}', now(), now(),
        '', '', '', ''
      );
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (
        gen_random_uuid(), uid, uid::text,
        jsonb_build_object('sub', uid::text, 'email', acc.email, 'email_verified', true),
        'email', now(), now(), now()
      );
    else
      update auth.users
         set encrypted_password = extensions.crypt(pw, extensions.gen_salt('bf')),
             email_confirmed_at = coalesce(email_confirmed_at, now()),
             updated_at = now()
       where id = uid;
    end if;

    insert into public.staff (user_id, role, title)
    values (uid, acc.role, acc.title)
    on conflict (role) do update set user_id = excluded.user_id;
  end loop;
end $$;

-- النتيجة المتوقعة: سطران (owner و manager) مع تاريخ التأكيد
select s.role, s.title, u.email, u.email_confirmed_at is not null as confirmed
from public.staff s join auth.users u on u.id = s.user_id
order by s.role desc;
