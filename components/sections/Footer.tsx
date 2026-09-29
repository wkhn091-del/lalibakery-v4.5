import type { ContactLinks } from "@/lib/content/contact";
import { keyOf } from "@/lib/content/keys";
import type { SiteSettings, SocialKey } from "@/lib/content/types";
import OpenStatus from "../OpenStatus";
import ScrollLink from "../ScrollLink";
import WhatsAppIcon from "../WhatsAppIcon";
import { PhoneIcon, MailIcon, PinIcon, InstagramIcon, FacebookIcon, TikTokIcon, ArrowUpIcon } from "../Icons";

const SOCIAL_ICONS = { instagram: InstagramIcon, facebook: FacebookIcon, tiktok: TikTokIcon } as const;
/** the order the icons are shown in */
const SOCIAL: SocialKey[] = ["instagram", "facebook", "tiktok"];

type Props = {
  /** "הגדרות כלליות" (sanity/content.ts) */
  settings: SiteSettings;
  /** the call, WhatsApp, mail and Waze links (lib/content/contact.ts) */
  links: ContactLinks;
};

export default function Footer({ settings, links }: Props) {
  const f = settings.footer;
  const business = settings.business;
  const year = new Date().getFullYear();

  return (
    <footer id="contact" className="site-footer" aria-labelledby="footer-title">
      {/* שולי זילוף בשוקולד: אותו מוטיב של קו הזילוף, בשקט */}
      <div className="footer-edge" aria-hidden="true" />
      <div className="footer-body">
        <div className="wrap footer-grid">
          <div className="footer-brand">
            <img src="/brand/logo.svg" alt={business.logoAlt} width={132} height={132} className="footer-logo" />
            <p id="footer-title" className="footer-name">{business.name}</p>
            <p className="footer-soft mt-3 max-w-[32ch]">{f.about}</p>
          </div>

          <div>
            <h2 className="footer-h">{f.hoursTitle}</h2>
            <dl className="footer-hours">
              {business.hours.map((h, i) => (
                <div key={keyOf(h, i)} className="footer-hours-row">
                  <dt>{h.label}</dt>
                  <dd>{h.open && h.close ? <bdi dir="ltr">{h.open}–{h.close}</bdi> : f.closed}</dd>
                </div>
              ))}
            </dl>
            <OpenStatus hours={business.hours} text={settings.openStatus} />
          </div>

          <div>
            <h2 className="footer-h">{f.contactTitle}</h2>
            <ul className="footer-contact">
              <li><a href={links.tel}><PhoneIcon /><bdi dir="ltr">{business.phone}</bdi></a></li>
              <li><a href={links.whatsapp} target="_blank" rel="noopener"><WhatsAppIcon />{f.whatsapp}</a></li>
              <li><a href={links.mail}><MailIcon /><bdi dir="ltr">{business.email}</bdi></a></li>
              {links.waze ? (
                <li>
                  <a href={links.waze} target="_blank" rel="noopener">
                    <PinIcon />
                    <span>{business.address}<span className="footer-soft block text-[14px]">{f.waze}</span></span>
                  </a>
                </li>
              ) : null}
            </ul>
          </div>

          <div>
            <h2 className="footer-h">{f.socialTitle}</h2>
            <ul className="footer-social">
              {SOCIAL.map((id) => {
                const s = business.social[id];
                const Icon = SOCIAL_ICONS[id];
                return (
                  <li key={id}>
                    <a href={s.url || "#"} target={s.url ? "_blank" : undefined} rel="noopener" aria-label={s.label} title={s.url ? s.label : `${s.label} (${f.socialSoon})`}>
                      <Icon />
                    </a>
                  </li>
                );
              })}
            </ul>
            <p className="footer-soft mt-4 text-[15px]">{f.socialNote}</p>
          </div>
        </div>

        <div className="wrap">
          <div className="footer-bottom">
            <p>© {year} {business.name}. {f.tagline}. {f.rights}</p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <a href="/accessibility">{f.accessibility}</a>
              <ScrollLink href="#top" className="inline-flex items-center gap-1.5">
                <ArrowUpIcon />
                {f.backToTop}
              </ScrollLink>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
