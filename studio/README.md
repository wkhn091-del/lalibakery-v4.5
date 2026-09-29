# LaliBakery Studio

ה-Studio של Sanity שבו הבעלים עורכת כל טקסט באתר, עוגות, מחירים, סוגי עוגות ותמונות: בטפסים ("תוכן"), או בלחיצה על הטקסט באתר עצמו ("עריכה על האתר"). אפליקציה נפרדת מהאתר, עם `package.json` משלה.

```bash
npm install
npm run dev            # http://localhost:3333 ("עריכה על האתר" צריכה גם את האתר: npm run dev בתיקייה הראשית)
npm run seed:preview   # מה העברת התוכן תיצור
npm run seed           # העברת התוכן הקיים של האתר (פעם אחת)
npm run deploy         # https://<SANITY_STUDIO_HOSTNAME>.sanity.studio
npm run doctor         # בדיקת תקינות: Node, תלויות, ‎.env, הפורט, הפרויקט ו-CORS. לא משנה כלום
npm run reset          # ניקוי מטמונים והתקנה מחדש לפי ה-lockfile (התוכן עצמו ב-sanity.io, לא נפגע)
```

ה-Studio מתנהג מוזר או זורק שגיאות? קודם `npm run doctor`: הוא מציג מה שבור ואת הפקודה המדויקת שמתקנת. פירוט: "כשה-Studio לא עובד" ב-[`../CMS.md`](../CMS.md).

ההקמה המלאה, משתני הסביבה והאבטחה: [`../CMS.md`](../CMS.md).

| קובץ | מה |
|---|---|
| `sanity.config.ts` | ה-Studio: "תוכן" ו"עריכה על האתר" (Presentation: איזה מסמך נפתח ליד כל דף), מה מותר לעשות במסמכים הקבועים, שדות טקסט מימין לשמאל |
| `sanity.cli.ts` | הפרויקט, ה-dataset והכתובת (מ-`.env`) |
| `structure.ts` | התפריט בצד: הגדרות כלליות, דף הבית, דף הזמנת עוגה, עוגות בגלריה, סוגי עוגות, טעמי בסיס, קרמים |
| `schemaTypes/` | השדות: `cake`, `category`, `cakeSize`, `flavour`, `cream` |
| `schemaTypes/site/` | הטקסטים של האתר: `spec.ts` (כל שדה: שם, הסבר, בדיקות; אותם שמות כמו באתר, והאתר בודק את זה ב-`npm test`), ו-`index.ts` שהופך אותו לטפסים |
| `categories.ts` | ארבעת סוגי העוגות הקבועים והמזהים שלהם |
| `tones.ts`, `components/ToneInput.tsx` | הצבעים של טעמים וקרמים, ובחירת צבע בכפתורים |
| `seed/seed.ts` | העברת התוכן הקיים, כולל כל הטקסטים (בטוח להריץ שוב: לא דורס כלום) |
