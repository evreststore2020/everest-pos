// =====================================================================
//  إعدادات الربط بـ Supabase
//  - على الجهاز (من غير نت): سيب الخانتين فاضيين، البرنامج بيشتغل على السيرفر المحلي.
//  - أونلاين (GitHub Pages): حط هنا رابط المشروع والمفتاح العام من Supabase:
//    Supabase ← Project Settings ← API  (Project URL  و  anon public key)
// =====================================================================
window.POS_CONFIG = {
  supabaseUrl: '',   // مثال: 'https://abcdxyz.supabase.co'
  supabaseKey: '',   // المفتاح العام anon / publishable (مش الـ service_role)
};

// (متعدّلش السطر ده) — مكان البرنامج على الموقع
window.POS_BASE = new URL('.', document.currentScript.src).pathname;
