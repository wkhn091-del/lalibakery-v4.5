"use client";
/*
  בונה העוגה האישית, בחמישה שלבים:
  1. סוג העוגה  2. גודל ובסיס  3. קרם ועיצוב  4. הסרות ובקשות  5. סיכום
  הטקסטים של הבונה מגיעים מהדף (text: "דף הזמנת עוגה" ב-Studio; המובנים ב-content.ts), וכל חלק קורא
  אותם מה-context. הקטלוג המובנה והכללים (מחיר, מנות, התנגשויות, ההודעה): lib/order/model.ts.
  עם onAddToCart: הכפתור בסיכום מוסיף לסל. בלעדיו: בקשת הצעת מחיר בוואטסאפ.
  הקטלוג מגיע מה-CMS דרך catalog (components/CakeBuilder.tsx); בלעדיו, הקטלוג המובנה.
*/
import { createContext, type ReactNode, type Ref, useContext, useEffect, useId, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import type { WizardText } from "@/lib/content/types";
import { EASE_OUT, gsap, MQ } from "@/lib/gsap";
import { priceText } from "@/lib/price";
import { clean } from "@/lib/stega";
import { fill } from "@/lib/text";
import {
  BUILT_IN_CATALOG,
  type CakeOrder,
  type Cat,
  type Category,
  type CategoryId,
  categoryOf,
  colorName,
  COLORS,
  creamClash,
  type Cream,
  type Draft,
  EMPTY,
  EXCLUSIONS,
  type ExclusionId,
  FIGURE,
  figureOf,
  indexed,
  type Issue,
  issuesOf,
  LAST,
  MAX_COLORS,
  orderOf,
  orderText,
  rowsOf,
  servingsOf,
  servingsText,
  type SizeVisual,
  type Step,
  SURPRISE,
  type WizardCatalog,
} from "@/lib/order/model";
import { clearWizard, loadWizard, localToday, saveWizard } from "@/lib/order/storage";
import WhatsAppIcon from "./WhatsAppIcon";


const CatalogContext = createContext<Cat>(indexed(BUILT_IN_CATALOG));
const useCatalog = () => useContext(CatalogContext);

/*
  The builder's texts ("דף הזמנת עוגה" in the Studio, or the built-in ones in content.ts), handed
  down by the page. Every part reads them from here; the order's words (the summary rows, the
  WhatsApp message, the colour and removal names) are text.order.
*/
const TextContext = createContext<WizardText | null>(null);
function useText(): WizardText {
  const text = useContext(TextContext);
  if (!text) throw new Error("the builder's parts render inside CustomCakeWizard");
  return text;
}

/* ─────────────────────────── המצב ─────────────────────────── */

type Field = keyof WizardText["errors"];


type State = {
  step: Step;
  /** כיוון המעבר האחרון: 1 קדימה, ‎-1 אחורה */
  dir: 1 | -1;
  /** השלב הרחוק ביותר שהגיעו אליו */
  reached: Step;
  draft: Draft;
  showErrors: boolean;
  /** סימנו בעצמנו ללא אגוזים (עוגת גן), והסימון עדיין פעיל */
  presetNuts: boolean;
  /** ההצעה ניתנת פעם אחת: מי שביטל אותה לא יקבל אותה שוב */
  nutsOffered: boolean;
  status: "idle" | "sending" | "added" | "error";
};

const INITIAL: State = { step: 0, dir: 1, reached: 0, draft: EMPTY, showErrors: false, presetNuts: false, nutsOffered: false, status: "idle" };

type Action =
  | { type: "category"; category: Category }
  | { type: "patch"; patch: Partial<Draft> }
  | { type: "color"; id: string }
  | { type: "exclusion"; id: ExclusionId }
  | { type: "go"; step: Step }
  | { type: "errors" }
  | { type: "status"; status: State["status"] }
  | { type: "restore"; step: Step; reached: Step; draft: Draft }
  | { type: "reset" };

function reducer(state: State, action: Action): State {
  const d = state.draft;
  switch (action.type) {
    case "category": {
      const c = action.category;
      // מה שכבר נבחר נשמר, אם הוא קיים גם בסוג החדש
      const keep = (id: string | null, list: { id: string }[]) => (id && list.some((o) => o.id === id) ? id : null);
      const nuts = c.id === "kindergarten" && !state.nutsOffered && !d.exclusions.includes("no-nuts");
      return {
        ...state,
        draft: {
          ...d,
          category: c.id,
          figure: c.figure ? d.figure : "",
          size: keep(d.size, c.sizes),
          base: keep(d.base, c.bases),
          cream: d.cream && c.creams.includes(d.cream) ? d.cream : null,
          exclusions: nuts ? [...d.exclusions, "no-nuts"] : d.exclusions,
        },
        presetNuts: state.presetNuts || nuts,
        nutsOffered: state.nutsOffered || nuts,
      };
    }
    case "patch":
      return { ...state, draft: { ...d, ...action.patch } };
    case "color": {
      const chosen = d.colors.filter((c) => c !== SURPRISE);
      let colors: string[];
      if (action.id === SURPRISE) colors = d.colors.includes(SURPRISE) ? [] : [SURPRISE];
      else if (chosen.includes(action.id)) colors = chosen.filter((c) => c !== action.id);
      else if (chosen.length < MAX_COLORS) colors = [...chosen, action.id];
      else return state;
      return { ...state, draft: { ...d, colors } };
    }
    case "exclusion": {
      const on = d.exclusions.includes(action.id);
      const exclusions = on ? d.exclusions.filter((x) => x !== action.id) : [...d.exclusions, action.id];
      return { ...state, draft: { ...d, exclusions }, presetNuts: action.id === "no-nuts" ? false : state.presetNuts };
    }
    case "go":
      return {
        ...state,
        step: action.step,
        dir: action.step >= state.step ? 1 : -1,
        reached: Math.max(state.reached, action.step) as Step,
        showErrors: false,
        status: state.status === "error" ? "idle" : state.status,
      };
    case "errors":
      return { ...state, showErrors: true };
    case "status":
      return { ...state, status: action.status };
    case "restore":
      // a draft saved in this browser (lib/order/storage.ts). The kindergarten no-nuts offer isn't
      // made twice: it was either taken or turned down before.
      return {
        ...INITIAL,
        step: action.step,
        reached: action.reached,
        draft: action.draft,
        nutsOffered: action.draft.category === "kindergarten" || action.draft.exclusions.includes("no-nuts"),
      };
    case "reset":
      return INITIAL;
  }
}

/* ─────────────────────────── חישובים ─────────────────────────── */


/** מה חסר כדי לעבור את השלב */
function missing(cat: Cat, d: Draft, step: Step): Field[] {
  const c = categoryOf(cat, d.category);
  if (step === 0) return c ? [] : ["category"];
  if (step === 1) {
    const out: Field[] = [];
    if (c?.figure && !FIGURE.test(figureOf(d.figure))) out.push("figure");
    if (!d.size) out.push("size");
    if (!d.base) out.push("base");
    return out;
  }
  if (step === 2) return d.cream ? [] : ["cream"];
  return [];
}

/** השלב הראשון שעוד חסר בו משהו. אפשר לקפוץ לכל שלב עד אליו */
function openUpTo(cat: Cat, d: Draft): Step {
  for (const s of [0, 1, 2] as Step[]) if (missing(cat, d, s).length) return s;
  return LAST;
}




// the model's types, still importable from here
export type { CakeOrder, Category, CategoryId, Cream, ExclusionId, Flavour, Size, SizeVisual, WizardCatalog } from "@/lib/order/model";

/* ─────────────────────────── הקומפוננטה ─────────────────────────── */

export type CustomCakeWizardProps = {
  /** הקטלוג מה-CMS (sanity/data.ts: getCatalog). בלעדיו, הקטלוג המובנה */
  catalog?: WizardCatalog;
  /** כל הטקסטים של הבונה ("דף הזמנת עוגה": sanity/content.ts, getCakePage) */
  text: WizardText;
  /** קישור הוואטסאפ של העסק (https://wa.me/…), שאליו נשלחת בקשת הצעת המחיר (lib/content/contact.ts) */
  whatsapp: string;
  /** מוסיף את העוגה לסל. בלעדיו, הסיכום נשלח כבקשת הצעת מחיר בוואטסאפ */
  onAddToCart?: (order: CakeOrder) => void | Promise<void>;
  className?: string;
};

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

const BTN_INK =
  "inline-flex h-14 items-center justify-center gap-2.5 rounded-[10px] bg-ink px-7 text-[17px] font-medium text-ink-inv transition-colors duration-200 hover:bg-ink/85";
const FIELD =
  "w-full rounded-[10px] border border-ink/20 bg-white/70 px-3.5 text-[16px] text-ink transition-colors placeholder:text-ink-soft/60 hover:border-ink/40 focus:border-ink focus:outline-none";

export default function CustomCakeWizard({ catalog, text, whatsapp, onAddToCart, className }: CustomCakeWizardProps) {
  const TEXT = text;
  const words = text.order;
  const cat = useMemo(() => indexed(catalog ?? BUILT_IN_CATALOG), [catalog]);
  const uid = useId();
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const { step, draft } = state;
  const root = useRef<HTMLElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const advance = useRef(0);
  const today = useToday();

  const category = categoryOf(cat, draft.category);
  const open = openUpTo(cat, draft);
  const issues = useMemo(() => issuesOf(cat, draft, words), [cat, draft, words]);
  const blocked = issues.some((i) => i.kind === "conflict");
  const errors = state.showErrors ? missing(cat, draft, step) : [];
  const canJump = (s: Step) => s !== step && s <= Math.min(state.reached, open);

  const go = (s: Step) => {
    window.clearTimeout(advance.current);
    dispatch({ type: "go", step: s });
  };
  const next = () => {
    if (missing(cat, draft, step).length) {
      dispatch({ type: "errors" });
      // אל השדה הראשון שחסר
      requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>("[data-invalid] input")?.focus());
      return;
    }
    if (step < LAST) go((step + 1) as Step);
  };
  const back = () => step > 0 && go((step - 1) as Step);
  const jump = (s: Step) => canJump(s) && go(s);
  const pickCategory = (id: CategoryId, tapped: boolean) => {
    const picked = categoryOf(cat, id);
    if (!picked) return;
    dispatch({ type: "category", category: picked });
    // לחיצה על כרטיס עוברת לבד לשלב הבא (במקלדת לא, כדי שאפשר יהיה לדפדף בין הכרטיסים)
    if (tapped && step === 0) {
      window.clearTimeout(advance.current);
      advance.current = window.setTimeout(() => dispatch({ type: "go", step: 1 }), 280);
    }
  };
  useEffect(() => () => window.clearTimeout(advance.current), []);

  // Saved in this browser (lib/order/storage.ts). Restored once, right after hydration and before
  // the first paint: the server renders an empty wizard, so reading storage during render wouldn't
  // match it. Saved 300 ms after each change; cleared once the order is sent, and by starting over.
  const restored = useRef(false);
  const restoring = useRef(false);
  useIsoLayoutEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const saved = loadWizard(cat, localToday());
    if (!saved) return;
    const at = Math.min(saved.step, openUpTo(cat, saved.draft)) as Step;
    restoring.current = at !== state.step; // the step changes: no entrance animation or focus for it
    dispatch({ type: "restore", step: at, reached: saved.reached, draft: saved.draft });
  }, [cat, state.step]);
  useEffect(() => {
    if (state.status === "added") return clearWizard();
    const t = window.setTimeout(() => saveWizard({ step: state.step, reached: state.reached, draft: state.draft }), 300);
    return () => window.clearTimeout(t);
  }, [state.step, state.reached, state.draft, state.status]);

  // מעבר עדין בין שלבים: נכנס מכיוון ההתקדמות, ומיקוד בכותרת השלב לקוראי מסך
  const shown = useRef(false);
  useIsoLayoutEffect(() => {
    if (!shown.current) {
      shown.current = true;
      return;
    }
    if (restoring.current) {
      restoring.current = false;
      return;
    }
    const el = panel.current;
    const still = window.matchMedia(MQ.reduce).matches;
    if (el)
      gsap.fromTo(
        el,
        { autoAlpha: 0, x: still ? 0 : state.dir * -24 },
        { autoAlpha: 1, x: 0, duration: still ? 0.2 : 0.55, ease: EASE_OUT, clearProps: "opacity,visibility,transform" },
      );
    const top = root.current;
    if (top && top.getBoundingClientRect().top < 0) scrollToTop(top, still);
    heading.current?.focus({ preventScroll: true });
  }, [step, state.dir]);

  const order = step === LAST ? orderOf(cat, draft, words) : null;
  // in the Studio's preview the texts carry invisible characters (lib/stega.ts): none in the message or the cart
  const href = `${whatsapp}?text=${encodeURIComponent(clean(orderText(cat, draft, words)))}`;
  const submit = async () => {
    if (blocked || !order || !onAddToCart) return;
    dispatch({ type: "status", status: "sending" });
    try {
      await onAddToCart(clean(order));
      dispatch({ type: "status", status: "added" });
    } catch {
      dispatch({ type: "status", status: "error" });
    }
  };
  const cta = (full: boolean, dark = false) => (
    <SubmitButton cart={!!onAddToCart} href={href} blocked={blocked || !order} sending={state.status === "sending"} onSubmit={submit} onSent={clearWizard} full={full} dark={dark} />
  );

  if (state.status === "added")
    return (
      <TextContext.Provider value={text}>
      <Frame ref={root} uid={uid} className={className}>
        <Added onAnother={() => dispatch({ type: "reset" })} />
      </Frame>
      </TextContext.Provider>
    );

  return (
    <TextContext.Provider value={text}>
    <CatalogContext.Provider value={cat}>
    <Frame ref={root} uid={uid} className={className}>
      <Progress step={step} canJump={canJump} onJump={jump} />

      <div className="mt-8 grid gap-10 lg:mt-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-16">
        <div className="min-w-0">
          <div ref={panel} role="group" aria-labelledby={`${uid}-step`}>
            <p className="t-caption text-ink-soft">{fill(TEXT.stepOf, { n: step + 1, total: TEXT.steps.length })}</p>
            <h3 id={`${uid}-step`} ref={heading} tabIndex={-1} className="mt-1 font-display text-[28px] leading-[1.15] font-medium tracking-[-0.01em] outline-none! md:text-[36px]">
              {TEXT.steps[step].heading}
            </h3>
            <p className="mt-2 max-w-[56ch] text-ink-soft">{TEXT.steps[step].sub}</p>

            <div className="mt-8">
              {step === 0 && <StepCategory uid={uid} value={draft.category} onPick={pickCategory} invalid={errors.includes("category")} />}
              {step === 1 && category && <StepBase uid={uid} category={category} draft={draft} dispatch={dispatch} errors={errors} />}
              {step === 2 && category && <StepCreams uid={uid} category={category} draft={draft} dispatch={dispatch} errors={errors} />}
              {step === 3 && (
                <StepExclusions uid={uid} draft={draft} dispatch={dispatch} presetNuts={state.presetNuts} issues={issues} onFix={jump} />
              )}
              {step === 4 && <StepSummary uid={uid} draft={draft} dispatch={dispatch} today={today} issues={issues} onEdit={jump} />}
            </div>
          </div>

          {/* ניווט בדסקטופ */}
          <div className="mt-12 hidden items-center justify-between gap-4 border-t border-ink/10 pt-6 lg:flex">
            {step > 0 ? (
              <button type="button" onClick={back} className="inline-flex h-12 items-center gap-2 px-1 text-ink-soft transition-colors hover:text-ink">
                <Arrow back />
                {TEXT.back}
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-5">
              {step < 3 && canJump(LAST) && (
                <button type="button" onClick={() => jump(LAST)} className="h-12 px-1 underline-offset-4 hover:underline">
                  {TEXT.toSummary}
                </button>
              )}
              {step < LAST && <NextButton step={step} onClick={next} />}
            </div>
          </div>
          {state.status === "error" && <p role="alert" className="mt-4 text-[15px] text-[#8E3524] lg:hidden">{TEXT.failed}</p>}
        </div>

        {/* בצד, בדסקטופ: העוגה שנבנית, ובסיכום כפתור השליחה */}
        <aside className="hidden lg:block" aria-label={TEXT.yourCake}>
          <div className="sticky top-8">
            {step < LAST ? (
              <LiveSummary draft={draft} />
            ) : (
              <div className="rounded-[24px] bg-surface-deep p-7 text-ink-inv">
                <p className="t-caption text-ink-inv/70">{TEXT.ready}</p>
                <p className="mt-1 font-display text-[26px] leading-tight font-medium">{category?.title}</p>
                {order && <p className="mt-2 text-[15px] text-ink-inv/80">{`${order.size.label}, ${servingsText(order.size.servings, words)}`}</p>}
                {order?.price != null && <p className="mt-1 text-[15px] font-medium text-ink-inv">{priceText(order.price, words.priceFrom)}</p>}
                <div className="mt-6">{cta(true, true)}</div>
                {blocked && <p className="mt-4 text-[15px] text-[#F3C9BD]">{TEXT.blocked}</p>}
                {state.status === "error" && <p role="alert" className="mt-4 text-[15px] text-[#F3C9BD]">{TEXT.failed}</p>}
                <p className="mt-4 t-caption text-ink-inv/70">{onAddToCart ? TEXT.approval : TEXT.quoteNote}</p>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ניווט במובייל: דבוק לתחתית המסך כל עוד הבונה על המסך */}
      <div className="sticky bottom-0 z-20 -mx-[var(--gutter)] mt-10 border-t border-ink/10 bg-surface px-[var(--gutter)] pt-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:hidden">
        <div className="flex items-center gap-3">
          {step > 0 && (
            <button type="button" onClick={back} aria-label={TEXT.back} className="flex size-14 shrink-0 items-center justify-center rounded-[10px] border border-ink/20 text-ink">
              <Arrow back />
            </button>
          )}
          {step < LAST ? <NextButton step={step} onClick={next} full /> : cta(true)}
        </div>
        {step === LAST && blocked && <p className="mt-2 text-center text-[14px] text-[#8E3524]">{TEXT.blocked}</p>}
      </div>
    </Frame>
    </CatalogContext.Provider>
    </TextContext.Provider>
  );
}

/* ─────────────────────────── מבנה ─────────────────────────── */

function Frame({ ref, uid, className, children }: { ref: Ref<HTMLElement>; uid: string; className?: string; children: ReactNode }) {
  const TEXT = useText();
  return (
    <section ref={ref} dir="rtl" aria-labelledby={`${uid}-title`} className={cx("scroll-mt-6 bg-surface text-ink", className)}>
      <div className="mx-auto w-full max-w-[1240px] px-[var(--gutter)] pt-14 lg:py-20">
        <header className="max-w-[640px]">
          <p className="t-caption text-ink-soft">{TEXT.eyebrow}</p>
          <h2 id={`${uid}-title`} className="t-h2 mt-2">
            {TEXT.title}
          </h2>
          <p className="mt-3 text-ink-soft">{TEXT.intro}</p>
        </header>
        {children}
      </div>
    </section>
  );
}

function Progress({ step, canJump, onJump }: { step: Step; canJump: (s: Step) => boolean; onJump: (s: Step) => void }) {
  const TEXT = useText();
  const STEPS = TEXT.steps;
  return (
    <nav aria-label={TEXT.progressLabel} className="mt-10">
      {/* מובייל: שם השלב ופס התקדמות */}
      <div className="md:hidden">
        <div className="flex items-baseline justify-between text-[15px]">
          <span className="font-medium">{STEPS[step].title}</span>
          <span className="text-ink-soft">
            {step + 1}/{STEPS.length}
          </span>
        </div>
        <div className="mt-3 h-[3px] rounded-full bg-ink/10">
          <div className="h-full rounded-full bg-ink transition-[width] duration-500 ease-[var(--ease-out)]" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>
      {/* טאבלט ודסקטופ: כל השלבים, ואפשר לחזור לשלב שכבר עברו */}
      <ol className="hidden items-center gap-3 md:flex">
        {STEPS.map((s, i) => {
          const at = i as Step;
          const current = at === step;
          const done = !current && canJump(at) && at < LAST;
          return (
            <li key={i} className="flex flex-1 items-center gap-3 last:flex-none">
              <button
                type="button"
                disabled={!canJump(at)}
                onClick={() => onJump(at)}
                aria-current={current ? "step" : undefined}
                className="group flex items-center gap-2.5 disabled:cursor-default"
              >
                <span
                  className={cx(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border text-[14px] transition-colors duration-300",
                    done ? "border-ink bg-ink text-ink-inv" : current ? "border-ink text-ink" : "border-ink/20 text-ink-soft",
                  )}
                >
                  {done ? <Check /> : i + 1}
                </span>
                <span className={cx("text-[15px] whitespace-nowrap transition-colors", current ? "font-medium text-ink" : "hidden text-ink-soft lg:inline", canJump(at) && "group-hover:text-ink")}>
                  {s.title}
                </span>
              </button>
              {i < STEPS.length - 1 && <span aria-hidden className={cx("h-px min-w-4 flex-1 transition-colors duration-500", i < step ? "bg-ink/50" : "bg-ink/15")} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function NextButton({ step, onClick, full }: { step: Step; onClick: () => void; full?: boolean }) {
  const TEXT = useText();
  const upcoming = TEXT.steps[step + 1]?.title;
  return (
    <button type="button" onClick={onClick} className={cx(BTN_INK, full && "flex-1")}>
      <span>
        {step === 3 ? TEXT.toSummary : TEXT.next}
        {step < 3 && upcoming && <span className="hidden font-normal text-ink-inv/65 sm:inline">{`: ${upcoming}`}</span>}
      </span>
      <Arrow />
    </button>
  );
}

function SubmitButton({
  cart,
  href,
  blocked,
  sending,
  onSubmit,
  onSent,
  full,
  dark,
}: {
  cart: boolean;
  href: string;
  blocked: boolean;
  sending: boolean;
  onSubmit: () => void;
  onSent: () => void;
  full: boolean;
  dark: boolean;
}) {
  const TEXT = useText();
  const cls = cx("btn-primary justify-center", full && "w-full flex-1", (blocked || sending) && "cursor-not-allowed opacity-50", dark && "focus-visible:outline-ink-inv!");
  if (cart)
    return (
      <button type="button" className={cls} onClick={onSubmit} disabled={blocked || sending}>
        {sending ? TEXT.adding : TEXT.addToCart}
      </button>
    );
  if (blocked)
    return (
      <button type="button" className={cls} disabled>
        <WhatsAppIcon />
        {TEXT.quote}
      </button>
    );
  return (
    <a className={cls} href={href} target="_blank" rel="noopener" onClick={onSent}>
      <WhatsAppIcon />
      {TEXT.quote}
    </a>
  );
}

/* ─────────────────────────── שלב 1: סוג העוגה ─────────────────────────── */

// באנטו: עוגת המספרים גבוהה בצד אחד, עוגת הגן רחבה מתחת לשתי העוגות המצולמות
const TILE: Record<CategoryId, string> = {
  number: "col-span-2 aspect-[16/10] md:aspect-auto md:h-[300px] lg:col-span-1 lg:row-span-2 lg:h-auto",
  designer: "aspect-[4/5] md:aspect-auto md:h-[300px] lg:h-auto",
  birthday: "aspect-[4/5] md:aspect-auto md:h-[300px] lg:h-auto",
  kindergarten: "col-span-2 aspect-[16/9] md:aspect-auto md:h-[260px] lg:h-auto",
};

function StepCategory({ uid, value, onPick, invalid }: { uid: string; value: CategoryId | null; onPick: (id: CategoryId, tapped: boolean) => void; invalid: boolean }) {
  const TEXT = useText();
  const { categories } = useCatalog();
  return (
    <fieldset data-invalid={invalid || undefined}>
      <legend className="sr-only">{TEXT.steps[0].title}</legend>
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-3 lg:grid-rows-[270px_270px]">
        {categories.map((c) => {
          const checked = value === c.id;
          const light = !!c.image || c.id === "kindergarten";
          return (
            <label
              key={c.id}
              data-selected={checked || undefined}
              onClick={(e) => e.detail > 0 && onPick(c.id, true)}
              className={cx(
                "group relative isolate cursor-pointer overflow-hidden rounded-[24px] outline-2 outline-offset-[3px] outline-transparent transition-[outline-color] duration-300 [container-type:size]",
                "data-[selected]:outline-ink has-[:focus-visible]:outline-ink/50",
                light ? "bg-surface-deep" : "bg-blush-soft",
                TILE[c.id],
              )}
            >
              <input type="radio" name={`${uid}-category`} value={c.id} checked={checked} onChange={() => onPick(c.id, false)} className="sr-only" />
              <TileArt c={c} />
              <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-5 md:p-6">
                <span className={cx("font-display text-[19px] leading-tight font-medium sm:text-[21px] md:text-[25px]", light ? "text-ink-inv" : "text-ink")}>{c.title}</span>
                <span className={cx("text-[13.5px] leading-snug md:text-[15px]", light ? "text-ink-inv/80" : "text-ink-soft")}>{c.blurb}</span>
              </span>
              <span
                aria-hidden
                className={cx(
                  "absolute start-4 top-4 flex size-8 items-center justify-center rounded-full transition-[opacity,transform] duration-300",
                  checked ? "scale-100 opacity-100" : "scale-75 opacity-0",
                  light ? "bg-ink-inv text-ink" : "bg-ink text-ink-inv",
                )}
              >
                <Check />
              </span>
            </label>
          );
        })}
      </div>
      {invalid && <ErrorText>{TEXT.errors.category}</ErrorText>}
    </fieldset>
  );
}

function TileArt({ c }: { c: Category }) {
  const zoom = "transition-transform duration-[900ms] ease-[var(--ease-out)] group-hover:scale-[1.035]";
  if (c.image)
    return (
      <>
        <img
          src={c.image.src}
          srcSet={c.image.srcSet}
          sizes={c.image.srcSet ? "(min-width: 1024px) 40vw, (min-width: 768px) 60vw, 70vw" : undefined}
          alt={c.image.alt}
          loading="lazy"
          decoding="async"
          className={cx("absolute inset-0 -z-10 size-full object-cover", zoom)}
          style={c.image.position ? { objectPosition: c.image.position } : undefined}
        />
        <span aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-3/4" style={{ background: "linear-gradient(to top, rgba(var(--choc-rgb), 0.86), rgba(var(--choc-rgb), 0))" }} />
      </>
    );
  if (c.figure)
    // ספרות בקו מתאר, בגודל שנמדד לפי הכרטיס עצמו; בכרטיס הגבוה של הדסקטופ, אחת מעל השנייה
    return (
      <span aria-hidden dir="ltr" className={cx("absolute inset-0 -z-10 flex items-center justify-center pb-24 lg:flex-col lg:pb-28", zoom)}>
        {["3", "0"].map((digit) => (
          <span
            key={digit}
            className="font-display text-[min(58cqi,56cqb)] leading-[0.8] font-medium text-transparent select-none lg:text-[min(118cqi,38cqb)]"
            style={{ WebkitTextStroke: "1.5px var(--color-ink)" }}
          >
            {digit}
          </span>
        ))}
      </span>
    );
  return (
    <span aria-hidden className={cx("absolute inset-0 -z-10 flex items-center justify-center pb-24", zoom)}>
      <Tray className="h-[min(50cqb,44cqi)] w-auto" />
    </span>
  );
}

/** עוגת גן מלמעלה: מגש, עוגה חתוכה לריבועים, ושושנת קרם על כל ריבוע */
function Tray({ className }: { className?: string }) {
  const cols = 6;
  const rows = 3;
  const w = 284 / cols;
  const h = 144 / rows;
  const cuts = [
    ...Array.from({ length: cols - 1 }, (_, i) => `M${18 + w * (i + 1)} 18v144`),
    ...Array.from({ length: rows - 1 }, (_, j) => `M18 ${18 + h * (j + 1)}h284`),
  ].join(" ");
  return (
    <svg viewBox="0 0 320 180" className={className} fill="none" stroke="var(--color-ink-inv)" strokeWidth="1.3" aria-hidden="true">
      <rect x="4" y="4" width="312" height="172" rx="20" strokeOpacity="0.3" />
      <rect x="18" y="18" width="284" height="144" rx="8" strokeOpacity="0.6" />
      <path d={cuts} strokeOpacity="0.28" />
      {Array.from({ length: cols * rows }, (_, i) => {
        const cx = 18 + w * ((i % cols) + 0.5);
        const cy = 18 + h * (Math.floor(i / cols) + 0.5);
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r="10.5" strokeOpacity="0.5" />
            <path d={`M${cx - 5} ${cy} a5 5 0 0 1 10 0 a3.2 3.2 0 0 1 -6.4 0`} strokeOpacity="0.5" />
            <circle cx={cx} cy={cy} r="2.6" fill={i % 4 === 1 ? "var(--color-blush)" : "var(--color-ink-inv)"} fillOpacity={i % 4 === 1 ? 0.85 : 0.35} stroke="none" />
          </g>
        );
      })}
    </svg>
  );
}

/* ─────────────────────────── שלב 2: גודל ובסיס ─────────────────────────── */

type StepProps = { uid: string; category: Category; draft: Draft; dispatch: (a: Action) => void; errors: Field[] };

function StepBase({ uid, category: c, draft, dispatch, errors }: StepProps) {
  const TEXT = useText();
  const words = TEXT.order;
  const set = (patch: Partial<Draft>) => dispatch({ type: "patch", patch });
  const figure = figureOf(draft.figure);
  return (
    <div className="space-y-12">
      {c.figure && (
        <div data-invalid={errors.includes("figure") || undefined}>
          <label htmlFor={`${uid}-figure`} className="text-[17px] font-medium">
            {TEXT.figure}
          </label>
          <p className="t-caption mt-1 text-ink-soft">{TEXT.figureHint}</p>
          <div className="mt-4 flex items-center gap-6">
            <input
              id={`${uid}-figure`}
              value={draft.figure}
              maxLength={3}
              autoComplete="off"
              aria-invalid={errors.includes("figure") || undefined}
              onChange={(e) => set({ figure: e.target.value })}
              className={cx(FIELD, "h-14 w-[140px] text-center font-display text-[24px] tracking-[0.12em]")}
            />
            <span
              aria-hidden
              dir="ltr"
              className={cx("font-display text-[64px] leading-none font-medium tracking-[-0.03em] text-transparent md:text-[80px]", !figure && "opacity-30")}
              style={{ WebkitTextStroke: "1.25px var(--color-ink)" }}
            >
              {figure || "30"}
            </span>
          </div>
          {errors.includes("figure") && <ErrorText>{TEXT.errors.figure}</ErrorText>}
        </div>
      )}

      <Group legend={TEXT.size} error={errors.includes("size") ? TEXT.errors.size : undefined}>
        <div className={cx("grid grid-cols-2 gap-3", SIZE_COLUMNS[c.sizes.length])}>
          {c.sizes.map((s) => (
            <ChoiceCard key={s.id} name={`${uid}-size`} value={s.id} checked={draft.size === s.id} onSelect={() => set({ size: s.id })}>
              <span className="flex flex-col gap-3">
                <SizeArt visual={s.visual} />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{s.label}</span>
                  {s.detail && <span className="t-caption text-ink-soft">{s.detail}</span>}
                  <span className="t-caption text-ink-soft">
                    {servingsText(s.servings, words)}
                    {s.perFigure && ` ${TEXT.perFigure}`}
                  </span>
                  {s.price != null && (
                    <span className="t-caption mt-1 font-medium text-ink">
                      {priceText(s.price, words.priceFrom)}
                      {s.perFigure && ` ${TEXT.perFigure}`}
                    </span>
                  )}
                </span>
              </span>
            </ChoiceCard>
          ))}
        </div>
        {c.figure && draft.size && figure.length > 1 && (
          <p className="t-caption mt-3 text-ink-soft">
            {fill(TEXT.totalFor, { figure, servings: servingsText(servingsOf(c.sizes.find((s) => s.id === draft.size)!, draft.figure), words) })}
          </p>
        )}
      </Group>

      <Group legend={TEXT.base} error={errors.includes("base") ? TEXT.errors.base : undefined}>
        <div className="grid gap-3 sm:grid-cols-2">
          {c.bases.map((b) => (
            <ChoiceCard key={b.id} name={`${uid}-base`} value={b.id} checked={draft.base === b.id} onSelect={() => set({ base: b.id })}>
              <span className="flex items-center gap-4">
                <Dot tone={b.tone} />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{b.label}</span>
                  <span className="t-caption text-ink-soft">{b.note}</span>
                </span>
              </span>
            </ChoiceCard>
          ))}
        </div>
      </Group>
    </div>
  );
}

const SIZE_COLUMNS: Record<number, string> = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4" };

/** קו דק של העוגה בגודל הזה: עגולה מהצד, קומות, מגש מלמעלה, ספרה, קאפקייקס */
function SizeArt({ visual }: { visual: SizeVisual }) {
  const common = { width: 64, height: 40, viewBox: "0 0 64 40", fill: "none", stroke: "currentColor", strokeWidth: 1.3, "aria-hidden": true } as const;
  const art = (() => {
    switch (visual.kind) {
      case "round": {
        const w = 18 + visual.cm * 1.5;
        const x = (64 - w) / 2;
        return (
          <svg {...common}>
            <path d={`M${x} 16 v14 a${w / 2} 5 0 0 0 ${w} 0 v-14`} />
            <ellipse cx="32" cy="16" rx={w / 2} ry="5" />
          </svg>
        );
      }
      case "tiers":
        return (
          <svg {...common}>
            <path d="M22 9 v9 a10 3 0 0 0 20 0 v-9" />
            <ellipse cx="32" cy="9" rx="10" ry="3" />
            <path d="M13 20 v12 a19 4 0 0 0 38 0 v-12" />
            <path d="M13 20 a19 4 0 0 0 38 0" />
          </svg>
        );
      case "tray": {
        const w = visual.w * 1.3;
        const h = visual.h * 1.1;
        const x = (64 - w) / 2;
        const y = (40 - h) / 2;
        return (
          <svg {...common}>
            <rect x={x} y={y} width={w} height={h} rx="3" />
            <path d={`M${x + w / 3} ${y} v${h} M${x + (2 * w) / 3} ${y} v${h} M${x} ${y + h / 2} h${w}`} strokeOpacity="0.5" />
          </svg>
        );
      }
      case "figure":
        return (
          <svg {...common}>
            <g transform={`translate(32 20) scale(${visual.scale}) translate(-32 -20)`}>
              <path d="M27 11 l7 -5 v28 M24 34 h16" />
            </g>
          </svg>
        );
      case "cupcakes":
        return (
          <svg {...common}>
            {[14, 32, 50].map((cx0) => (
              <g key={cx0}>
                <path d={`M${cx0 - 7} 22 l2 12 h10 l2 -12`} />
                <path d={`M${cx0 - 8} 22 a8 8 0 0 1 16 0 z`} />
              </g>
            ))}
          </svg>
        );
    }
  })();
  return <span className="text-ink/70">{art}</span>;
}

/* ─────────────────────────── שלב 3: קרם ועיצוב ─────────────────────────── */

function StepCreams({ uid, category: c, draft, dispatch, errors }: StepProps) {
  const TEXT = useText();
  const words = TEXT.order;
  const { cream: creams } = useCatalog();
  const set = (patch: Partial<Draft>) => dispatch({ type: "patch", patch });
  const chosen = draft.colors.filter((id) => id !== SURPRISE);
  return (
    <div className="space-y-12">
      <Group legend={TEXT.cream} error={errors.includes("cream") ? TEXT.errors.cream : undefined}>
        <div className="grid gap-3 sm:grid-cols-2">
          {c.creams.map((id) => {
            const cream = creams[id];
            if (!cream) return null;
            const clash = creamClash(cream, draft.exclusions, words);
            const selected = draft.cream === id;
            return (
              <ChoiceCard key={id} name={`${uid}-cream`} value={id} checked={selected} disabled={!!clash && !selected} onSelect={() => set({ cream: id })}>
                <span className="flex items-start gap-4">
                  <Dot tone={cream.tone} />
                  <span className="flex flex-col gap-1.5">
                    <span className="font-medium">{cream.label}</span>
                    <span className="flex flex-wrap gap-1.5">
                      {creamTags(cream, TEXT.creamTags).map((t, i) => (
                        <span key={i} className="rounded-full bg-ink/[0.06] px-2 py-0.5 text-[12.5px] text-ink-soft">
                          {t}
                        </span>
                      ))}
                    </span>
                    {clash && <span className="t-caption text-[#8E3524]">{fill(TEXT.notFor, { request: clash.request })}</span>}
                  </span>
                </span>
              </ChoiceCard>
            );
          })}
        </div>
      </Group>

      <fieldset>
        <legend className="text-[17px] font-medium">{TEXT.colors}</legend>
        <p className="t-caption mt-1 text-ink-soft">
          {fill(TEXT.colorsHint, { max: MAX_COLORS })} <span className="text-ink-soft/70">({TEXT.optional})</span>
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          {COLORS.map((col) => {
            const on = chosen.includes(col.id);
            const full = !on && chosen.length >= MAX_COLORS;
            return (
              <Pill key={col.id} checked={on} disabled={full} onChange={() => dispatch({ type: "color", id: col.id })}>
                <span className="relative flex size-7 items-center justify-center rounded-full border border-ink/15" style={{ background: col.hex }}>
                  {on && (
                    <span className={col.id === "black" ? "text-ink-inv" : "text-ink"}>
                      <Check />
                    </span>
                  )}
                </span>
                {colorName(col.id, words)}
              </Pill>
            );
          })}
          <Pill checked={draft.colors.includes(SURPRISE)} onChange={() => dispatch({ type: "color", id: SURPRISE })}>
            <span className="flex size-7 items-center justify-center rounded-full border border-dashed border-ink/40 text-ink">{draft.colors.includes(SURPRISE) && <Check />}</span>
            {words.surprise}
          </Pill>
        </div>
      </fieldset>

      <div className="grid gap-8 md:grid-cols-2">
        <label className="block">
          <span className="text-[17px] font-medium">{words.labels.idea}</span> <span className="t-caption text-ink-soft">({TEXT.optional})</span>
          <input value={draft.theme} maxLength={60} onChange={(e) => set({ theme: e.target.value })} placeholder={TEXT.ideaPlaceholder} className={cx(FIELD, "mt-3 h-12")} />
        </label>
        <label className="block">
          <span className="text-[17px] font-medium">{words.labels.message}</span> <span className="t-caption text-ink-soft">({TEXT.optional})</span>
          <input value={draft.message} maxLength={40} onChange={(e) => set({ message: e.target.value })} placeholder={TEXT.messagePlaceholder} className={cx(FIELD, "mt-3 h-12")} />
          <span className="t-caption mt-1.5 block text-ink-soft/80">{`${draft.message.length}/40`}</span>
        </label>
      </div>

      {/* הכיתוב על פלאק, כמו שיופיע על העוגה */}
      <div className="flex items-center justify-center rounded-[24px] bg-blush-soft px-6 py-10">
        <div className="max-w-full rounded-[999px] border border-ink/10 bg-surface px-10 py-5 text-center font-display text-[22px] leading-snug font-medium break-words md:text-[26px]">
          {draft.message.trim() || <span className="text-ink-soft/50">{TEXT.messagePreview}</span>}
        </div>
      </div>
    </div>
  );
}

function creamTags(cream: Cream, t: WizardText["creamTags"]) {
  const tags: string[] = [];
  if (cream.contains.includes("dairy")) tags.push(t.dairy);
  if (cream.parve) tags.push(t.parve);
  if (cream.contains.includes("nuts")) tags.push(t.nuts);
  if (cream.contains.includes("gluten")) tags.push(t.gluten);
  return tags;
}

/* ─────────────────────────── שלב 4: הסרות ובקשות ─────────────────────────── */

function StepExclusions({
  uid,
  draft,
  dispatch,
  presetNuts,
  issues,
  onFix,
}: {
  uid: string;
  draft: Draft;
  dispatch: (a: Action) => void;
  presetNuts: boolean;
  issues: Issue[];
  onFix: (s: Step) => void;
}) {
  const TEXT = useText();
  const words = TEXT.order;
  return (
    <div className="space-y-10">
      <fieldset>
        <legend className="sr-only">{TEXT.exclusionsLegend}</legend>
        <div className="grid gap-3 md:grid-cols-2">
          {EXCLUSIONS.map((x) => (
            <Toggle key={x.id} label={words.exclusions[x.key].label} note={words.exclusions[x.key].note} checked={draft.exclusions.includes(x.id)} onChange={() => dispatch({ type: "exclusion", id: x.id })} />
          ))}
        </div>
        {presetNuts && draft.exclusions.includes("no-nuts") && <p className="t-caption mt-3 text-ink-soft">{TEXT.nutsPreset}</p>}
      </fieldset>

      <Toggle
        label={TEXT.allergy}
        note={TEXT.allergyNote}
        checked={draft.allergy}
        onChange={() => dispatch({ type: "patch", patch: { allergy: !draft.allergy } })}
        emphasis
      />

      <Issues items={issues} onFix={onFix} />

      <div>
        <label className="block" htmlFor={`${uid}-notes`}>
          <span className="text-[17px] font-medium">{TEXT.notes}</span> <span className="t-caption text-ink-soft">({TEXT.optional})</span>
        </label>
        <textarea
          id={`${uid}-notes`}
          value={draft.notes}
          maxLength={400}
          rows={4}
          onChange={(e) => dispatch({ type: "patch", patch: { notes: e.target.value } })}
          placeholder={TEXT.notesPlaceholder}
          className={cx(FIELD, "mt-3 block min-h-[120px] resize-y py-3 leading-relaxed")}
        />
      </div>
    </div>
  );
}

/* ─────────────────────────── שלב 5: סיכום ─────────────────────────── */

function StepSummary({
  uid,
  draft,
  dispatch,
  today,
  issues,
  onEdit,
}: {
  uid: string;
  draft: Draft;
  dispatch: (a: Action) => void;
  today: string;
  issues: Issue[];
  onEdit: (s: Step) => void;
}) {
  const TEXT = useText();
  const words = TEXT.order;
  const cat = useCatalog();
  const c = categoryOf(cat, draft.category);
  if (!c) return null;
  const rows = rowsOf(cat, draft, words).filter((r) => r.key !== "category" && r.key !== "date");
  return (
    <div className="space-y-8">
      <Issues items={issues.filter((i) => i.kind === "conflict")} onFix={onEdit} />

      <article className="overflow-hidden rounded-[24px] border border-ink/12 bg-white/60">
        <header className="flex items-center gap-4 border-b border-ink/10 p-5 md:p-6">
          <span className={cx("relative size-16 shrink-0 overflow-hidden rounded-[14px]", c.image ? "bg-surface-deep" : c.figure ? "bg-blush-soft" : "bg-surface-deep")}>
            {c.image ? (
              <img src={c.image.src} srcSet={c.image.srcSet} sizes="64px" alt="" className="size-full object-cover" style={c.image.position ? { objectPosition: c.image.position } : undefined} />
            ) : c.figure ? (
              <span aria-hidden dir="ltr" className="flex size-full items-center justify-center font-display text-[30px] font-medium text-transparent" style={{ WebkitTextStroke: "1px var(--color-ink)" }}>
                {figureOf(draft.figure) || "30"}
              </span>
            ) : (
              <span aria-hidden className="flex size-full items-center justify-center p-2.5">
                <Tray />
              </span>
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="t-caption text-ink-soft">{words.labels.category}</span>
            <span className="font-display text-[22px] leading-tight font-medium md:text-[26px]">{c.title}</span>
          </span>
          <EditButton label={words.labels.category} onClick={() => onEdit(0)} />
        </header>
        <dl className="divide-y divide-ink/10">
          {rows.map((r) => (
            <div key={r.key} className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-baseline gap-x-4 px-5 py-4 md:grid-cols-[150px_minmax(0,1fr)_auto] md:px-6">
              <dt className="text-[15px] text-ink-soft">{r.label}</dt>
              <dd className={cx("text-[16px] break-words", r.key === "allergy" && "font-medium text-[#8E3524]")}>
                {r.key === "colors" ? <ColorList ids={draft.colors} /> : r.key === "message" ? <span className="font-display text-[18px]">{r.text}</span> : r.text}
              </dd>
              <EditButton label={r.label} onClick={() => onEdit(r.step)} />
            </div>
          ))}
        </dl>
      </article>

      <label className="block max-w-[320px]" htmlFor={`${uid}-date`}>
        <span className="text-[17px] font-medium">{TEXT.date}</span> <span className="t-caption text-ink-soft">({TEXT.optional})</span>
        <input
          id={`${uid}-date`}
          type="date"
          value={draft.date}
          min={today || undefined}
          onChange={(e) => dispatch({ type: "patch", patch: { date: e.target.value } })}
          className={cx(FIELD, "mt-3 h-12")}
        />
      </label>

      <Issues items={issues.filter((i) => i.kind === "notice")} onFix={onEdit} />
      <p className="t-caption text-ink-soft">{TEXT.approval}</p>
    </div>
  );
}

function ColorList({ ids }: { ids: string[] }) {
  const words = useText().order;
  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {ids.map((id) => {
        const col = COLORS.find((x) => x.id === id);
        return (
          <span key={id} className="inline-flex items-center gap-2">
            <span className={cx("size-4 rounded-full border", col ? "border-ink/15" : "border-dashed border-ink/40")} style={col ? { background: col.hex } : undefined} />
            {col ? words.colors[col.id] : words.surprise}
          </span>
        );
      })}
    </span>
  );
}

/* ─────────────────────────── בצד: העוגה שנבנית ─────────────────────────── */

function LiveSummary({ draft }: { draft: Draft }) {
  const TEXT = useText();
  const words = TEXT.order;
  const l = words.labels;
  const cat = useCatalog();
  const c = categoryOf(cat, draft.category);
  const rows = rowsOf(cat, draft, words);
  const value = (key: string) => rows.find((r) => r.key === key)?.text;
  const lines: [string, string | undefined][] = [
    [l.size, value("size")],
    ...(value("price") ? ([[l.price, value("price")]] as [string, string][]) : []),
    [l.base, value("base")],
    [l.cream, value("cream")],
  ];
  const extras = rows.filter((r) => ["figure", "colors", "message"].includes(r.key));
  const excluded = EXCLUSIONS.filter((x) => draft.exclusions.includes(x.id));
  return (
    <div className="rounded-[24px] border border-ink/12 p-6">
      <p className="t-caption text-ink-soft">{TEXT.yourCake}</p>
      <p className={cx("mt-1 font-display text-[22px] leading-tight font-medium", !c && "text-ink-soft/70")}>{c ? c.title : TEXT.noCategory}</p>
      {c && (
        <dl className="mt-5 space-y-3 border-t border-ink/10 pt-5 text-[15px]">
          {[...lines, ...extras.map((r): [string, string] => [r.label, r.text])].map(([label, text], i) => (
            <div key={i} className="flex items-baseline justify-between gap-4">
              <dt className="shrink-0 text-ink-soft">{label}</dt>
              <dd className={cx("text-end", !text && "text-ink-soft/50")}>{text ?? TEXT.notChosen}</dd>
            </div>
          ))}
          {excluded.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {excluded.map((x) => (
                <span key={x.id} className="rounded-full bg-ink/[0.06] px-2.5 py-1 text-[13px]">
                  {words.exclusions[x.key].label}
                </span>
              ))}
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

/* ─────────────────────────── אבני בניין ─────────────────────────── */

function Group({ legend, error, children }: { legend: string; error?: string; children: ReactNode }) {
  return (
    <fieldset data-invalid={error ? true : undefined}>
      <legend className="text-[17px] font-medium">{legend}</legend>
      <div className="mt-4">{children}</div>
      {error && <ErrorText>{error}</ErrorText>}
    </fieldset>
  );
}

/** כרטיס בחירה: רדיו אמיתי (מקלדת וקוראי מסך), כרטיס בעין */
function ChoiceCard({
  name,
  value,
  checked,
  disabled,
  onSelect,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <label
      data-selected={checked || undefined}
      aria-disabled={disabled || undefined}
      className={cx(
        "relative flex min-h-[64px] cursor-pointer rounded-[18px] border border-ink/15 bg-white/55 p-4 pe-12 transition-[border-color,background-color,box-shadow] duration-200 md:p-5 md:pe-12",
        "hover:border-ink/40 data-[selected]:border-ink data-[selected]:bg-white data-[selected]:shadow-[inset_0_0_0_1px_var(--color-ink)]",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink",
        disabled && "cursor-not-allowed opacity-50 hover:border-ink/15",
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} disabled={disabled} onChange={onSelect} className="sr-only" />
      {children}
      <span
        aria-hidden
        className={cx(
          "absolute end-3.5 top-3.5 flex size-6 items-center justify-center rounded-full border transition-colors duration-200",
          checked ? "border-ink bg-ink text-ink-inv" : "border-ink/25 text-transparent",
        )}
      >
        <Check size={12} />
      </span>
    </label>
  );
}

function Pill({ checked, disabled, onChange, children }: { checked: boolean; disabled?: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label
      data-selected={checked || undefined}
      aria-disabled={disabled || undefined}
      className={cx(
        "flex cursor-pointer items-center gap-2.5 rounded-full border border-ink/15 bg-white/55 py-1.5 ps-1.5 pe-4 text-[15px] transition-colors duration-200",
        "hover:border-ink/40 data-[selected]:border-ink data-[selected]:bg-white",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink",
        disabled && "cursor-not-allowed opacity-40 hover:border-ink/15",
      )}
    >
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} className="sr-only" />
      {children}
    </label>
  );
}

/** מתג: תיבת סימון אמיתית בתפקיד switch */
function Toggle({ label, note, checked, onChange, emphasis }: { label: string; note: string; checked: boolean; onChange: () => void; emphasis?: boolean }) {
  return (
    <label
      className={cx(
        "group flex cursor-pointer items-center justify-between gap-5 rounded-[18px] border p-4 transition-colors duration-200 md:p-5",
        emphasis ? "border-blush bg-blush-soft" : "border-ink/15 bg-white/55",
        "hover:border-ink/40 has-[:checked]:border-ink",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink",
      )}
    >
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">{label}</span>
        <span className="t-caption text-ink-soft">{note}</span>
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={onChange} className="sr-only" />
      <span aria-hidden className="relative h-7 w-12 shrink-0 rounded-full bg-ink/15 transition-colors duration-200 group-has-[:checked]:bg-ink">
        <span className="absolute start-1 top-1 size-5 rounded-full bg-white transition-transform duration-200 ease-[var(--ease-out)] group-has-[:checked]:-translate-x-5" />
      </span>
    </label>
  );
}

function Issues({ items, onFix }: { items: Issue[]; onFix: (s: Step) => void }) {
  if (!items.length) return null;
  return (
    <div className="space-y-3" aria-live="polite">
      {items.map((it) => (
        <div
          key={it.id}
          role={it.kind === "conflict" ? "alert" : undefined}
          className={cx("flex items-start gap-3 rounded-[16px] p-4 text-[15px] leading-relaxed", it.kind === "conflict" ? "bg-[#F6E4DE] text-[#6E2A1E]" : "bg-blush-soft text-ink")}
        >
          <Warn />
          <div className="min-w-0 flex-1">
            <p>{it.text}</p>
            {it.fix && (
              <button type="button" onClick={() => onFix(it.fix!.step)} className="mt-1.5 font-medium underline underline-offset-4">
                {it.fix.label}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  const TEXT = useText();
  return (
    <button type="button" onClick={onClick} aria-label={`${TEXT.edit}: ${label}`} className="text-[14px] text-ink-soft underline-offset-4 transition-colors hover:text-ink hover:underline">
      {TEXT.edit}
    </button>
  );
}

function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mt-3 flex items-center gap-2 text-[15px] text-[#8E3524]">
      <Warn small />
      {children}
    </p>
  );
}

function Added({ onAnother }: { onAnother: () => void }) {
  const TEXT = useText();
  return (
    <div className="mt-10 rounded-[24px] bg-blush-soft px-6 py-12 text-center md:py-16" role="status">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-ink text-ink-inv">
        <Check size={20} />
      </span>
      <p className="mt-5 font-display text-[28px] font-medium">{TEXT.added}</p>
      <p className="mt-2 text-ink-soft">{TEXT.approval}</p>
      <button type="button" onClick={onAnother} className={cx(BTN_INK, "mt-8")}>
        {TEXT.another}
      </button>
    </div>
  );
}

function Dot({ tone }: { tone: string | [string, string] }) {
  const background = Array.isArray(tone) ? `conic-gradient(${tone[0]} 0 50%, ${tone[1]} 0 100%)` : tone;
  return <span aria-hidden className="size-9 shrink-0 rounded-full border border-ink/10" style={{ background }} />;
}

function Check({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 8.4l2.9 2.9 6.1-6.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** חץ לכיוון ההתקדמות: בעברית, שמאלה */
function Arrow({ back }: { back?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" style={back ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M12 4.5L6.5 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Warn({ small }: { small?: boolean }) {
  const s = small ? 16 : 18;
  return (
    <svg width={s} height={s} viewBox="0 0 20 20" aria-hidden="true" className="mt-0.5 shrink-0">
      <path d="M10 3.2l7.3 12.6H2.7z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 8.2v3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="13.9" r="0.9" fill="currentColor" />
    </svg>
  );
}

/* ─────────────────────────── עזרים ─────────────────────────── */

/** התאריך של היום, לפי השעון המקומי (אחרי הטעינה, כדי שלא יהיה פער בין השרת לדפדפן) */
function useToday() {
  const [today, setToday] = useState("");
  useEffect(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    setToday(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }, []);
  return today;
}

/** גלילה לראש הבונה (דרך Lenis כשהוא פעיל) */
function scrollToTop(el: HTMLElement, still: boolean) {
  const lenis = (window as unknown as { __lenis?: { scrollTo: (t: Element, o?: object) => void } }).__lenis;
  if (lenis) lenis.scrollTo(el, { offset: -24, duration: 0.9 });
  else el.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
}
