/** Clerk appearance config — NoBC editorial-cream treatment.
 *  Direction: editorial, minimal, cream canvas (#F5EFE8), red (#B22E21) as the only
 *  pop, square-ish 3px corners, no drop shadows, tight typography. Body font is the
 *  app's Neue Haas Grotesk Display Pro stack (loaded via @font-face in globals.css).
 *
 *  NOTE on literals: Clerk components render outside the app's Tailwind CSS-var theme,
 *  so the palette is passed as literal NoBC hex here (variables + arbitrary-value
 *  utilities). This is the one sanctioned place for raw hex — the app's no-hex rule is
 *  about component code, which still uses semantic tokens.
 *  Reference: https://clerk.com/docs/customization/appearance */

const BODY_FONT =
  "'Neue Haas Grotesk Display Pro', 'Helvetica Neue', Arial, sans-serif";

// Preserved (app-wide, non-sign-in) surfaces — kept as style objects so the operator
// header UserButton menu + form labels don't regress in this sign-in-focused pass.
const BG = '#F5EFE8';
const BORDER = 'rgba(0,0,0,0.10)';
const TEXT_PRIMARY = '#1C1C1C';
const TEXT_SECONDARY = 'rgba(28,28,28,0.55)';

export const clerkAppearance = {
  variables: {
    colorPrimary: '#B22E21',
    colorBackground: '#F5EFE8',
    colorInputBackground: '#FFFFFF',
    colorText: '#1C1C1C',
    colorTextSecondary: 'rgba(28,28,28,0.55)',
    colorNeutral: '#2A1F1A',
    colorInputText: '#1C1C1C',
    colorDanger: '#B22E21',
    fontFamily: BODY_FONT,
    fontFamilyButtons: BODY_FONT,
    borderRadius: '3px',
    fontSize: '14px',
  },
  elements: {
    rootBox: 'bg-[#F5EFE8]',
    card: 'bg-[#F5EFE8] shadow-none border border-black/[0.06] rounded-[3px]',
    headerTitle: 'font-light tracking-tight',
    headerSubtitle: 'opacity-50 text-sm',
    socialButtonsBlockButton: 'rounded-[3px] border-black/[0.12]',
    formButtonPrimary: 'rounded-[3px] font-medium tracking-wide',
    formFieldInput: 'rounded-[3px] border-black/[0.12]',
    footer: 'bg-[#F5EFE8]',
    footerActionText: 'text-[#1C1C1C] opacity-50',
    footerActionLink: 'text-[#B22E21]',
    // Preserved app-wide surfaces (style objects) — avoid regressing the header menu.
    formFieldLabel: {
      color: TEXT_SECONDARY,
      fontSize: '12px',
      fontWeight: 500,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
    },
    dividerLine: { backgroundColor: BORDER },
    dividerText: { color: TEXT_SECONDARY },
    userButtonPopoverCard: { borderRadius: '3px', border: `1px solid ${BORDER}` },
    userButtonPopoverActionButton: {
      color: TEXT_PRIMARY,
      '&:hover': { backgroundColor: BG },
    },
  },
};

/** Operator-desk copy for the sign-in entry screen. */
export const clerkLocalization = {
  signIn: {
    start: {
      title: 'Sign in to NoBC OS',
      subtitle: "The operator's desk.",
    },
  },
};
