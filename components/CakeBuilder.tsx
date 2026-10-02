import { sendCakeRequest } from "@/app/[locale]/custom-cake/actions";
import CustomCakeWizard from "./CustomCakeWizard";
import { linksOf } from "@/lib/content/contact";
import { BUILT_IN_CATALOG as BUILT_IN } from "@/lib/order/model";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCakePage, getSettings } from "@/sanity/content";
import { getCatalog, getPortfolio } from "@/sanity/data";
import { getWizardAddons } from "@/sanity/shop";

/*
  בונה העוגה עם הקטלוג והטקסטים מה-CMS: הסוגים, הגדלים, המחירים, הבסיסים והקרמים, התוספות, וכל מילה
  בבונה ("דף הזמנת עוגה"), שהבעלים עורכת ב-Studio. קומפוננטת שרת: שמים <CakeBuilder /> בכל דף, והכול
  נטען בזמן הבנייה (ISR, כמו הגלריה). כשה-CMS לא מוגדר או לא זמין, הבונה מציג את הקטלוג והטקסטים
  המובנים, כך שהוא נראה ועובד בדיוק כמו קודם.

  כשמסד ההזמנות מחובר (Supabase), הבקשה נשמרת אצל בעלת העסק ונשלחת אליה במייל (sendCakeRequest),
  והוואטסאפ נשאר כאפשרות נוספת. בלעדיו, הבקשה נשלחת בוואטסאפ כמו קודם.

  עם סל קניות: onAddToCart היא פונקציה, ופונקציה לא עוברת משרת לדפדפן. במקרה כזה טוענים בדף את
  הקטלוג, הטקסטים וקישור הוואטסאפ (כמו כאן), ומעבירים אותם לקומפוננטת client של הסל שמרנדרת
  <CustomCakeWizard catalog={…} text={…} whatsapp={…} onAddToCart={…} />.
*/
export default async function CakeBuilder({ className }: { className?: string }) {
  const [catalog, addons, portfolio, page, settings] = await Promise.all([getCatalog(), getWizardAddons(), getPortfolio(), getCakePage(), getSettings()]);
  return (
    <CustomCakeWizard
      catalog={{ ...(catalog ?? BUILT_IN), addons, ...(portfolio ? { portfolio } : {}) }}
      text={page.wizard}
      whatsapp={linksOf(settings.business).whatsapp}
      onRequest={supabaseAdmin() ? sendCakeRequest : undefined}
      className={className}
    />
  );
}
