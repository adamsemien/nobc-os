/** Clerk appearance config — NoBC editorial-cream treatment.
 *  Direction: editorial, minimal, cream canvas (#F9F6F1, matches the app day --bg),
 *  red (#B22E21) as the only pop, square 0 corners, flat (borderless, no drop shadow),
 *  warm cream field borders, tight typography. Body font is the app's Neue Haas Grotesk
 *  Display Pro stack (loaded via @font-face in globals.css).
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
    colorBackground: '#F9F6F1',
    colorInputBackground: '#FCFAF6',
    colorText: '#1C1C1C',
    colorTextSecondary: 'rgba(28,28,28,0.55)',
    colorNeutral: '#2A1F1A',
    colorInputText: '#1C1C1C',
    colorDanger: '#B22E21',
    fontFamily: BODY_FONT,
    fontFamilyButtons: BODY_FONT,
    borderRadius: '0px',
    fontSize: '14px',
  },
  elements: {
    rootBox: 'bg-[#F9F6F1]',
    card: 'bg-[#F9F6F1] shadow-none border-0 rounded-none',
    headerTitle: 'font-light tracking-tight',
    headerSubtitle: 'opacity-50 text-sm',
    socialButtonsBlockButton: 'rounded-none border-[#E8E0D5]',
    formButtonPrimary: 'rounded-none font-medium tracking-wide',
    formFieldInput: 'rounded-none border-[#E8E0D5]',
    footer: 'bg-[#F9F6F1]',
    footerActionText: 'text-[#A8978A]',
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
