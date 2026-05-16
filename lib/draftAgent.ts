import { EventDraft, GateType, Question } from "./types";
import { buildFlow, questionFromBank, QUESTION_BANK } from "./defaults";

// The draft agent reads a plain-language description and fills in the whole
// event — details, the guest flow (gates), and registration questions — so
// the host only has to review, approve, and publish.

export interface AgentResult {
  patch: Partial<EventDraft>;
  notes: string[];
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function titleCase(s: string): string {
  return s.replace(/\w[^\s-]*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

function parseDate(text: string): { date: string; label: string } | null {
  const now = new Date();

  if (/\btomorrow\b/.test(text)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return { date: isoDate(d), label: "tomorrow" };
  }
  if (/\btonight\b|\btoday\b/.test(text)) {
    return { date: isoDate(now), label: "today" };
  }

  const inDays = text.match(/\bin (\d{1,3}) days?\b/);
  if (inDays) {
    const d = new Date(now);
    d.setDate(d.getDate() + Number(inDays[1]));
    return { date: isoDate(d), label: `in ${inDays[1]} days` };
  }

  const wd = text.match(/\b(this|next|coming)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (wd) {
    const target = WEEKDAYS.indexOf(wd[2]);
    const d = new Date(now);
    let delta = (target - d.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    if (wd[1] === "next") delta += 7;
    d.setDate(d.getDate() + delta);
    return { date: isoDate(d), label: titleCase(wd[2]) };
  }

  const md = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/
  );
  if (md) {
    const month = MONTHS.indexOf(md[1]);
    const day = Number(md[2]);
    let year = now.getFullYear();
    const candidate = new Date(year, month, day);
    if (candidate.getTime() < now.getTime() - 86400000) year += 1;
    const d = new Date(year, month, day);
    return { date: isoDate(d), label: `${titleCase(md[1])} ${day}` };
  }

  return null;
}

function parseTimes(text: string): { start: string; end: string } {
  const re = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi;
  const hits: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let h = Number(m[1]) % 12;
    if (/pm/i.test(m[3])) h += 12;
    hits.push(`${pad(h)}:${m[2] ?? "00"}`);
  }
  return { start: hits[0] ?? "", end: hits[1] ?? "" };
}

function parseCapacity(text: string): number | null {
  const m =
    text.match(/\b(?:for|cap(?:acity)?|up to|max(?:imum)?|seats? for|limited to)\s+(\d{1,5})\b/) ||
    text.match(/\b(\d{1,5})\s*(?:people|guests|ppl|seats|attendees)\b/);
  return m ? Number(m[1]) : null;
}

function parsePrice(text: string): { price: number; free: boolean } | null {
  if (/\b(free|no charge|complimentary|no cost)\b/.test(text)) return { price: 0, free: true };
  const m = text.match(/\$\s?(\d+(?:\.\d{1,2})?)/) || text.match(/\b(\d+)\s*(?:dollar|usd)\b/);
  return m ? { price: Number(m[1]), free: false } : null;
}

function parseLocation(text: string, raw: string): string {
  const at = raw.match(/\bat\s+([A-Z][^,.\n]{2,50})/);
  if (at) return at[1].trim();
  for (const v of ["rooftop", "loft", "gallery", "warehouse", "garden", "penthouse", "studio", "speakeasy"]) {
    if (text.includes(v)) return `A ${v}`;
  }
  return "";
}

function deriveName(raw: string): string {
  let s = raw.split(/[.\n]/)[0].trim();
  s = s.replace(/^(an?|the)\s+/i, "");
  s = s.replace(/\s+(for|on|at|with)\s.*$/i, "");
  s = s.replace(/\s+\d{1,5}\s*(people|guests|ppl|seats).*$/i, "");
  const words = s.split(/\s+/).filter(Boolean).slice(0, 7);
  return words.length ? titleCase(words.join(" ")) : "Untitled Event";
}

export function runDraftAgent(input: string): AgentResult {
  const raw = input.trim();
  const text = raw.toLowerCase();
  const notes: string[] = [];
  const patch: Partial<EventDraft> = {};

  if (!raw) return { patch, notes: ["Add a description first — then the agent can fill the event."] };

  patch.name = deriveName(raw);
  notes.push(`Named it "${patch.name}"`);

  patch.description = raw;
  patch.tagline = raw.length > 70 ? raw.slice(0, 67).trim() + "…" : raw;

  const date = parseDate(text);
  if (date) {
    patch.date = date.date;
    notes.push(`Set the date (${date.label})`);
  }

  const times = parseTimes(text);
  if (times.start) {
    patch.startTime = times.start;
    patch.endTime = times.end;
    notes.push(`Set the start time${times.end ? " and end time" : ""}`);
  }

  const cap = parseCapacity(text);
  if (cap !== null) {
    patch.capacity = cap;
    notes.push(`Capacity: ${cap} guests`);
  }

  const loc = parseLocation(text, raw);
  if (loc) {
    patch.location = loc;
    notes.push(`Location: ${loc}`);
  }

  // --- Build the gate flow from intent --------------------------------
  const wantsApply = /\b(appl(y|ication)|vett|curat|approv|invite[- ]only|rsvp.*review|screen)/.test(text);
  const price = parsePrice(text);
  const wantsPay = price !== null && !price.free;

  const flow: GateType[] = ["register"];
  if (wantsApply) flow.push("apply", "approve");
  if (wantsPay) flow.push("pay");

  patch.flow = buildFlow(flow);
  if (wantsPay && patch.flow) {
    const payStep = patch.flow.find((s) => s.type === "pay");
    if (payStep) payStep.price = price!.price;
  }

  if (wantsApply && wantsPay) {
    notes.push(`Flow: register → apply → you approve → pay $${price!.price}`);
  } else if (wantsApply) {
    notes.push("Flow: register → apply → you approve");
  } else if (wantsPay) {
    notes.push(`Flow: register → pay $${price!.price}`);
  } else {
    notes.push("Flow: register (guests just show up)");
  }

  // --- Pick registration questions ------------------------------------
  const bankByLabel = (label: string) => QUESTION_BANK.find((q) => q.label === label)!;
  const picked: Question[] = [
    questionFromBank(bankByLabel("Full name")),
    questionFromBank(bankByLabel("Email address")),
  ];
  const add = (label: string) => picked.push(questionFromBank(bankByLabel(label)));

  if (/\b(dinner|brunch|lunch|food|tasting|meal|chef)\b/.test(text)) add("Dietary restrictions or allergies");
  if (/\b(dinner|party|mixer|cocktail|night|gala)\b/.test(text)) add("Phone number");
  if (/\b(founder|professional|network|startup|industry|business|exec)\b/.test(text)) {
    add("Company or organization");
    add("Job title / role");
  }
  if (/\b(plus[- ]one|\+1|bring a|date|guest of)\b/.test(text)) add("Are you bringing a plus-one?");
  if (/\b(curat|connect|network|community|intentional|meaningful)\b/.test(text)) {
    add("What are you hoping to get out of this event?");
  }
  add("How did you hear about this event?");

  patch.questions = picked;
  notes.push(`Added ${picked.length} registration questions`);

  return { patch, notes };
}
