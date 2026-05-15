/** Operator-editable registration field, used by the access settings UI. */
export type FieldType = "text" | "textarea" | "select" | "checkbox" | "phone" | "email"

export type ShowTo = "members" | "guests" | "both"

export type AccessQuestion = {
  tempId: string
  id?: string
  label: string
  type: FieldType
  required: boolean
  options: string[]
  showTo: ShowTo
}

export type ApiQuestion = {
  id?: string
  label: string
  type: FieldType
  required: boolean
  options: string[]
  showToMember: boolean
  showToGuest: boolean
  whenInFlow: "BEFORE_SUBMIT"
}

export const FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Long text" },
  { value: "select", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
]

export const SHOW_TO_OPTIONS: { value: ShowTo; label: string }[] = [
  { value: "both", label: "Members & Guests" },
  { value: "members", label: "Members only" },
  { value: "guests", label: "Guests only" },
]

export function coerceFieldType(raw: string): FieldType {
  const t = raw.toLowerCase()
  if (t === "textarea" || t === "select" || t === "checkbox" || t === "phone" || t === "email") {
    return t
  }
  return "text"
}

/** Builds the API payload shape for POST/PATCH event endpoints. */
export function toApiQuestion(q: AccessQuestion): ApiQuestion {
  return {
    ...(q.id ? { id: q.id } : {}),
    label: q.label.trim(),
    type: q.type,
    required: q.required,
    options: q.type === "select" ? q.options.filter(Boolean) : [],
    showToMember: q.showTo === "members" || q.showTo === "both",
    showToGuest: q.showTo === "guests" || q.showTo === "both",
    whenInFlow: "BEFORE_SUBMIT",
  }
}

/** Builds an AccessQuestion from a stored EventCustomQuestion row. */
export function fromApiQuestion(raw: {
  id: string
  label: string
  fieldType: string
  options: string[]
  required: boolean
  showToMember?: boolean
  showToGuest?: boolean
}): AccessQuestion {
  const showToMember = raw.showToMember ?? true
  const showToGuest = raw.showToGuest ?? true
  const showTo: ShowTo =
    showToMember && showToGuest ? "both" : showToMember ? "members" : "guests"
  return {
    tempId: raw.id,
    id: raw.id,
    label: raw.label,
    type: coerceFieldType(raw.fieldType),
    required: raw.required,
    options: raw.options ?? [],
    showTo,
  }
}

export function appliesToMember(q: AccessQuestion): boolean {
  return q.showTo === "members" || q.showTo === "both"
}

export function appliesToGuest(q: AccessQuestion): boolean {
  return q.showTo === "guests" || q.showTo === "both"
}
