import type { ReactNode } from 'react';
import { type PageStyle, heroHeightVh } from '@/lib/page-style';

/**
 * Projects a PageStyle onto CSS custom properties + data attributes that the
 * templates read. Keeping the values here (not baked into each template) lets the
 * operator editor drive them live: it just renders this wrapper with new state and
 * the page repaints — no refetch. Defaults live in the templates' var() fallbacks,
 * so an absent value renders the original look.
 */
export function EventPageStyleWrapper({
  style,
  children,
}: {
  style: PageStyle;
  children: ReactNode;
}) {
  return (
    <div
      className="event-page-root"
      data-hero-text={style.heroTextMode}
      data-card-shadow={style.cardShadow}
      data-footer-scale={style.footerScale}
      style={
        {
          '--hero-scrim-top': String(style.heroScrimTop),
          '--hero-scrim-bottom': String(style.heroScrimBottom),
          '--hero-height-vh': `${heroHeightVh(style.heroHeight)}vh`,
          '--page-title-scale': String(style.titleScale),
          '--paper-grain-on': style.textureOn ? '1' : '0',
          '--paper-grain-opacity': String(style.textureOpacity),
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
