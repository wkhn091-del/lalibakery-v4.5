import CustomCakeWizard from "./CustomCakeWizard";
import { linksOf } from "@/lib/content/contact";
import { getCakePage, getSettings } from "@/sanity/content";
import { getCatalog } from "@/sanity/data";

/*
  בונה העוגה עם הקטלוג והטקסטים מה-CMS: הסוגים, הגדלים, המחירים, הבסיסים והקרמים, וכל מילה בבונה
  ("דף הזמנת עוגה"), שהבעלים עורכת ב-Studio. קומפוננטת שרת: שמים <CakeBuilder /> בכל דף, והכול נטען
  בזמן הבנייה (ISR, כמו הגלריה). כשה-CMS לא מוגדר או לא זמין, הבונה מציג את הקטלוג והטקסטים המובנים,
  כך שהוא נראה ועובד בדיוק כמו קודם.

  עם סל קניות: onAddToCart היא פונקציה, ופונקציה לא עוברת משרת לדפדפן. במקרה כזה טוענים בדף את
  הקטלוג, הטקסטים וקישור הוואטסאפ (כמו כאן), ומעבירים אותם לקומפוננטת client של הסל שמרנדרת
  <CustomCakeWizard catalog={…} text={…} whatsapp={…} onAddToCart={…} />.
*/
export default async function CakeBuilder({ className }: { className?: string }) {
  const [catalog, page, settings] = await Promise.all([getCatalog(), getCakePage(), getSettings()]);
  return <CustomCakeWizard catalog={catalog ?? undefined} text={page.wizard} whatsapp={linksOf(settings.business).whatsapp} className={className} />;
}
