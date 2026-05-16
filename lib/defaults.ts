import { EventDraft, FlowStep, GateType, Question, QuestionType } from "./types";

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

// --- Gates -------------------------------------------------------------

interface GateMeta {
  type: GateType;
  label: string;
  note: string;
  blurb: string; // shown in the "add step" menu
}

export const GATE_LIBRARY: GateMeta[] = [
  {
    type: "register",
    label: "Register",
    note: "Guest provides their details to start.",
    blurb: "Collect a guest's basic info",
  },
  {
    type: "apply",
    label: "Application",
    note: "Guest answers your registration questions to apply.",
    blurb: "Guest fills out an application form",
  },
  {
    type: "approve",
    label: "Host approval",
    note: "You review and approve the guest before they continue.",
    blurb: "You manually approve the guest",
  },
  {
    type: "pay",
    label: "Buy ticket",
    note: "Guest pays for their ticket.",
    blurb: "Guest pays — can come after any gate",
  },
  {
    type: "verify",
    label: "Verification",
    note: "Guest confirms their email or phone.",
    blurb: "Confirm email or phone number",
  },
  {
    type: "custom",
    label: "Custom action",
    note: "Any action you define — sign a waiver, join a group, refer a friend.",
    blurb: "Define any action you want",
  },
];

export function gateMeta(type: GateType): GateMeta {
  return GATE_LIBRARY.find((g) => g.type === type) ?? GATE_LIBRARY[0];
}

export function makeGate(type: GateType): FlowStep {
  const meta = gateMeta(type);
  return {
    id: uid("step"),
    type,
    label: meta.label,
    note: meta.note,
    price: 0,
  };
}

// Starting points — but the host can build any order they like.
export const FLOW_TEMPLATES: { id: string; name: string; steps: GateType[] }[] = [
  { id: "apply", name: "Guests apply, you approve", steps: ["register", "apply", "approve"] },
  { id: "apply_pay", name: "Apply, get approved, then pay", steps: ["register", "apply", "approve", "pay"] },
  { id: "pay", name: "Guests pay", steps: ["register", "pay"] },
  { id: "rsvp", name: "Guests just show up", steps: ["register"] },
];

export function buildFlow(steps: GateType[]): FlowStep[] {
  return steps.map(makeGate);
}

// --- Questions ---------------------------------------------------------

export const QUESTION_TYPES: { type: QuestionType; label: string }[] = [
  { type: "short_text", label: "Short text" },
  { type: "long_text", label: "Paragraph" },
  { type: "email", label: "Email" },
  { type: "phone", label: "Phone number" },
  { type: "number", label: "Number" },
  { type: "date", label: "Date" },
  { type: "dropdown", label: "Dropdown" },
  { type: "single_select", label: "Multiple choice (pick one)" },
  { type: "multi_select", label: "Checkboxes (pick many)" },
  { type: "checkbox", label: "Yes / no" },
];

// A real bank of questions you'd find on any events platform.
export const QUESTION_BANK: Omit<Question, "id">[] = [
  { label: "Full name", type: "short_text", required: true, options: [] },
  { label: "Email address", type: "email", required: true, options: [] },
  { label: "Phone number", type: "phone", required: false, options: [] },
  { label: "Company or organization", type: "short_text", required: false, options: [] },
  { label: "Job title / role", type: "short_text", required: false, options: [] },
  { label: "How did you hear about this event?", type: "dropdown", required: false, options: ["Instagram", "A friend", "Email", "Search", "Other"] },
  { label: "Dietary restrictions or allergies", type: "long_text", required: false, options: [] },
  { label: "Accessibility needs", type: "long_text", required: false, options: [] },
  { label: "Are you bringing a plus-one?", type: "checkbox", required: false, options: [] },
  { label: "Instagram handle", type: "short_text", required: false, options: [] },
  { label: "T-shirt size", type: "dropdown", required: false, options: ["XS", "S", "M", "L", "XL", "XXL"] },
  { label: "Emergency contact", type: "short_text", required: false, options: [] },
  { label: "What are you hoping to get out of this event?", type: "long_text", required: false, options: [] },
];

export function questionFromBank(item: Omit<Question, "id">): Question {
  return { ...item, id: uid("q"), options: [...item.options] };
}

export function blankQuestion(): Question {
  return { id: uid("q"), label: "", type: "short_text", required: false, options: [] };
}

// --- Draft -------------------------------------------------------------

export function newDraft(): EventDraft {
  return {
    id: uid("evt"),
    name: "",
    tagline: "",
    description: "",
    date: "",
    startTime: "",
    endTime: "",
    location: "",
    capacity: null,
    coverEmoji: "✦",
    hostAccessEnabled: true,
    guestAccessEnabled: true,
    flow: buildFlow(["register"]),
    questions: [questionFromBank(QUESTION_BANK[0]), questionFromBank(QUESTION_BANK[1])],
    status: "draft",
  };
}
