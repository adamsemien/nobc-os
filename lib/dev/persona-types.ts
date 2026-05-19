/** Shapes for the AI-generated test personas used by /api/dev/persona/*. */

export type PersonaArchetypeLean =
  | 'Connector'
  | 'Host'
  | 'Curator'
  | 'Builder'
  | 'Maker'
  | 'Patron';

export interface PersonaRapidFire {
  sundayMorning: string;
  karaokeOrder: string;
  ifNotHere: string;
}

export interface Persona {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  neighborhood: string;
  homeAddress: string;
  whereFrom: string;
  birthday: string; // YYYY-MM-DD
  workWebsite: string;
  referredBy: string;
  whatYouDo: string;
  passionProjects: string;
  brandsYouLove: string;
  whyNobc: string;
  contribution: string;
  rapidFire: PersonaRapidFire;
  archetype_lean: PersonaArchetypeLean;
}

export type PersonaStep = 'apply' | 'auto_approve' | 'rsvp' | 'pay' | 'checkin';

export const PERSONA_TEST_TAG = '__persona_test';
