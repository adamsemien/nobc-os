/** Clerk appearance config — matches the NoBC visual system.
 *  Mirrors the /apply form style: PP Editorial New italic headers,
 *  Neue Haas Grotesk Display Pro body, cream surface (#F9F6F1),
 *  NoBC red primary (#B22E21), 10px cards, 6px buttons.
 *  Reference: https://clerk.com/docs/customization/appearance */

const BG = '#F9F6F1';
const SURFACE = '#FFFFFF';
const BORDER = '#E8E0D5';
const TEXT_PRIMARY = '#1A1512';
const TEXT_SECONDARY = '#6B5E52';
const PRIMARY = '#B22E21';
const PRIMARY_HOVER = '#9A2419';
const DANGER = '#B22E21';

const BODY_FONT =
  "'Neue Haas Grotesk Display Pro', 'Helvetica Neue', Arial, sans-serif";
const DISPLAY_FONT = "'PP Editorial New', Georgia, serif";

export const clerkAppearance = {
  variables: {
    colorPrimary: PRIMARY,
    colorBackground: BG,
    colorText: TEXT_PRIMARY,
    colorTextSecondary: TEXT_SECONDARY,
    colorInputBackground: SURFACE,
    colorInputText: TEXT_PRIMARY,
    colorDanger: DANGER,
    fontFamily: BODY_FONT,
    fontFamilyButtons: BODY_FONT,
    borderRadius: '6px',
    fontSize: '14px',
  },
  elements: {
    rootBox: {
      fontFamily: BODY_FONT,
    },
    card: {
      backgroundColor: SURFACE,
      borderRadius: '10px',
      border: `1px solid ${BORDER}`,
      boxShadow: '0 1px 3px rgba(26, 21, 18, 0.04)',
    },
    headerTitle: {
      fontFamily: DISPLAY_FONT,
      fontStyle: 'italic',
      fontWeight: 400,
      color: TEXT_PRIMARY,
      letterSpacing: '-0.01em',
    },
    headerSubtitle: {
      color: TEXT_SECONDARY,
      fontFamily: BODY_FONT,
    },
    socialButtonsBlockButton: {
      borderRadius: '6px',
      border: `1px solid ${BORDER}`,
      backgroundColor: SURFACE,
      color: TEXT_PRIMARY,
      '&:hover': {
        backgroundColor: BG,
      },
    },
    dividerLine: {
      backgroundColor: BORDER,
    },
    dividerText: {
      color: TEXT_SECONDARY,
    },
    formFieldLabel: {
      color: TEXT_SECONDARY,
      fontSize: '12px',
      fontWeight: 500,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
    },
    formFieldInput: {
      backgroundColor: SURFACE,
      border: `1px solid ${BORDER}`,
      borderRadius: '6px',
      color: TEXT_PRIMARY,
      fontSize: '14px',
      '&:focus': {
        borderColor: PRIMARY,
        boxShadow: `0 0 0 2px ${PRIMARY}1A`,
      },
    },
    formButtonPrimary: {
      backgroundColor: PRIMARY,
      borderRadius: '6px',
      color: '#FFFFFF',
      fontWeight: 500,
      fontSize: '14px',
      letterSpacing: '0.01em',
      textTransform: 'none',
      boxShadow: 'none',
      '&:hover': {
        backgroundColor: PRIMARY_HOVER,
      },
      '&:focus': {
        boxShadow: `0 0 0 3px ${PRIMARY}33`,
      },
    },
    footerActionLink: {
      color: PRIMARY,
      '&:hover': {
        color: PRIMARY_HOVER,
      },
    },
    identityPreviewEditButton: {
      color: PRIMARY,
    },
    userButtonPopoverCard: {
      borderRadius: '10px',
      border: `1px solid ${BORDER}`,
    },
    userButtonPopoverActionButton: {
      color: TEXT_PRIMARY,
      '&:hover': {
        backgroundColor: BG,
      },
    },
  },
};
