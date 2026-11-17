-- =====================================================================
--  قائمة المقهى (Cafe Shop Meknes): 53 منتجاً في 6 أصناف
--  شغّله في: Supabase Dashboard ← SQL Editor ← New query ← Run
--  ⚠️ يستبدل قائمة المنتجات كاملة بهذه القائمة (الطلبات والفواتير لا تتأثر).
--  لتعديل اسم أو ثمن: غيّره في السطر المناسب ثم أعد التشغيل،
--  أو عدّله من صفحة «المنتجات» داخل التطبيق.
-- =====================================================================
insert into public.config (key, value, updated_at)
values ('products', $menu$[
  {"id":"m01","name":"قهوة + ماء","category":"المشروبات الساخنة","price":10},
  {"id":"m02","name":"قهوة حليب","category":"المشروبات الساخنة","price":10},
  {"id":"m03","name":"أنفيزيون","category":"المشروبات الساخنة","price":10},
  {"id":"m04","name":"زعتر","category":"المشروبات الساخنة","price":10},
  {"id":"m05","name":"لويزة","category":"المشروبات الساخنة","price":10},
  {"id":"m06","name":"ليبتون","category":"المشروبات الساخنة","price":10},
  {"id":"m07","name":"زنجبيل","category":"المشروبات الساخنة","price":10},
  {"id":"m08","name":"أعشاب","category":"المشروبات الساخنة","price":10},
  {"id":"m09","name":"شاي","category":"المشروبات الساخنة","price":10},
  {"id":"m10","name":"كابوتشينو","category":"المشروبات الساخنة","price":11},
  {"id":"m11","name":"عصير حامض","category":"العصائر","price":13},
  {"id":"m12","name":"عصير تفاح","category":"العصائر","price":13},
  {"id":"m13","name":"عصير بنان","category":"العصائر","price":13},
  {"id":"m14","name":"عصير أفوكا","category":"العصائر","price":15},
  {"id":"m15","name":"عصير ليمون","category":"العصائر","price":15},
  {"id":"m16","name":"عصير مانجا","category":"العصائر","price":18},
  {"id":"m17","name":"عصير كيوي","category":"العصائر","price":18},
  {"id":"m18","name":"عصير أناناس","category":"العصائر","price":18},
  {"id":"m19","name":"عصير فريز","category":"العصائر","price":18},
  {"id":"m20","name":"باناشي","category":"العصائر","price":24},
  {"id":"m21","name":"آيس كوفي شوكولا","category":"آيس كوفي","price":16},
  {"id":"m22","name":"آيس كوفي فاني","category":"آيس كوفي","price":16},
  {"id":"m23","name":"آيس كوفي كراميل","category":"آيس كوفي","price":16},
  {"id":"m24","name":"آيس كوفي أوريو","category":"آيس كوفي","price":18},
  {"id":"m25","name":"آيس كوفي لوتوس","category":"آيس كوفي","price":18},
  {"id":"m26","name":"آيس كوفي نتيلا","category":"آيس كوفي","price":18},
  {"id":"m27","name":"آيس كوفي كيندر","category":"آيس كوفي","price":18},
  {"id":"m28","name":"آيس كوفي بيستاج","category":"آيس كوفي","price":18},
  {"id":"m29","name":"آيس موكا","category":"آيس كوفي","price":18},
  {"id":"m30","name":"موخيطو كلاسيك","category":"موخيطو","price":15},
  {"id":"m31","name":"موخيطو بلو بيري","category":"موخيطو","price":18},
  {"id":"m32","name":"موخيطو أناناس","category":"موخيطو","price":18},
  {"id":"m33","name":"موخيطو فريز","category":"موخيطو","price":18},
  {"id":"m34","name":"موخيطو كيوي","category":"موخيطو","price":18},
  {"id":"m35","name":"موخيطو مانج","category":"موخيطو","price":18},
  {"id":"m36","name":"الكركدية (بسام)","category":"موخيطو","price":15},
  {"id":"m37","name":"كريب شوكولا","category":"الكريب","price":13},
  {"id":"m38","name":"كريب بنان","category":"الكريب","price":16},
  {"id":"m39","name":"كريب كيت كات","category":"الكريب","price":18},
  {"id":"m40","name":"كريب أوريو","category":"الكريب","price":18},
  {"id":"m41","name":"كريب نتيلا","category":"الكريب","price":20},
  {"id":"m42","name":"كريب كيندر","category":"الكريب","price":20},
  {"id":"m43","name":"كريب لوتوس","category":"الكريب","price":20},
  {"id":"m44","name":"كريب ميلكا","category":"الكريب","price":20},
  {"id":"m45","name":"كريب سبيسيال","category":"الكريب","price":25},
  {"id":"m46","name":"كوفر شوكولا","category":"الكوفر","price":13},
  {"id":"m47","name":"كوفر بنان","category":"الكوفر","price":16},
  {"id":"m48","name":"كوفر كيت كات","category":"الكوفر","price":18},
  {"id":"m49","name":"كوفر أوريو","category":"الكوفر","price":18},
  {"id":"m50","name":"كوفر نتيلا","category":"الكوفر","price":20},
  {"id":"m51","name":"كوفر لوتوس","category":"الكوفر","price":20},
  {"id":"m52","name":"كوفر ميلكا","category":"الكوفر","price":20},
  {"id":"m53","name":"كوفر سبيسيال","category":"الكوفر","price":25}
]$menu$::jsonb, now())
on conflict (key) do update set value = excluded.value, updated_at = now();

-- حتى لا يحاول التطبيق تعديل القائمة تلقائياً
update public.config
   set value = value || '{"menuVersion": 2}'::jsonb, updated_at = now()
 where key = 'settings';

-- النتيجة: عدد المنتجات في كل صنف
select p->>'category' as "الصنف", count(*) as "عدد المنتجات", min((p->>'price')::numeric) as "أقل ثمن", max((p->>'price')::numeric) as "أعلى ثمن"
from public.config c, jsonb_array_elements(c.value) p
where c.key = 'products'
group by 1 order by min(p->>'id');
