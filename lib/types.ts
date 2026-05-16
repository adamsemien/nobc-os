// Question types covering what any normal events platform needs.
export type QuestionType =
  | "short_text"
  | "long_text"
  | "email"
  | "phone"
  | "number"
  | "date"
  | "dropdown"
  | "single_select"
  | "multi_select"
  | "checkbox";

export interface Question {
  id: string;
  label: string;
  type: QuestionType;
  required: boolean;
  options: string[]; // used by dropdown / single_select / multi_select
}

// A gate is ANY action a guest must complete. An application is just one kind.
// Steps run in order, top to bottom. A "pay" step can sit anywhere — including
// AFTER an application + approval — so guests buy a ticket once they qualify.
export type GateType = "register" | "apply" | "approve" | "pay" | "verify" | "custom";

export interface FlowStep {
  id: string;
  type: GateType;
  label: string;
  note: string; // host-facing description of what this gate requires
  price: number; // only meaningful for "pay"
}

export interface EventDraft {
  id: string;
  name: string;
  tagline: string;
  description: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  location: string;
  capacity: number | null;
  coverEmoji: string;
  hostAccessEnabled: boolean;
  guestAccessEnabled: boolean;
  flow: FlowStep[];
  questions: Question[];
  status: "draft" | "published";
}
