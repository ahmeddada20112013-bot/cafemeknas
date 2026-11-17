-- =====================================================================
--  ربط الحسابين بالأدوار — شغّله بعد إنشاء المستخدمَين في
--  Authentication ← Users ← Add user (مع تفعيل Auto Confirm User)
--  غيّر البريدين أدناه ليطابقا ما أنشأته وما كتبته في config.js
-- =====================================================================
insert into public.staff (user_id, role, title)
select id, 'owner', 'صاحب المقهى' from auth.users where email = 'owner@cafemeknas.ma'
on conflict (role) do update set user_id = excluded.user_id;

insert into public.staff (user_id, role, title)
select id, 'manager', 'مدير المقهى' from auth.users where email = 'manager@cafemeknas.ma'
on conflict (role) do update set user_id = excluded.user_id;

select s.role, s.title, u.email from public.staff s join auth.users u on u.id = s.user_id;
