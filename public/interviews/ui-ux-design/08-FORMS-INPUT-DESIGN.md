# Forms & Input Design

## Overview

Forms are where conversion happens. Every signup, every purchase, every contact request
flows through a form. Poor form design directly translates to lost users, abandoned carts,
and missed revenue. Optimizing form UX can improve conversion rates by 20-50%.

This guide covers form layout, label placement, input types, validation, error handling,
accessibility, multi-step flows, and the subtle details that separate frustrating forms
from effortless ones.

---

## Core Concepts

### Form Layout Patterns

**Single-column layout** is the default and almost always the right choice. Users scan
top to bottom in a straight line, creating a clear path to completion.

```
+----------------------------------+
|  Full Name                       |
|  [________________________]      |
|                                  |
|  Email Address                   |
|  [________________________]      |
|                                  |
|  Message                         |
|  [________________________]      |
|                                  |
|  [    Send Message    ]          |
+----------------------------------+
```

**Multi-column layout** is appropriate only when fields are logically related and of
similar length: first name / last name, city / state / zip, start date / end date.

**Key principle:** The form should feel like a conversation, not a spreadsheet.

### Label Placement

**Top-aligned labels** (above input) are the most efficient. They minimize eye movement
and scale well on mobile. This is the recommended default.

**Left-aligned labels** use more horizontal space. They work for dense data-entry forms
but create a zig-zag scanning pattern that slows completion.

**Floating labels** start as placeholder text, then animate to a smaller label above
on focus. They save space but have accessibility concerns when the floated label is
too small or disappears before being read.

```
  Top-aligned:          Left-aligned:             Floating (focused):
  Email Address         Email Address [_______]   Email Address
  [_____________]                                 [user@example.com ]
```

### Input Types and When to Use Each

| Input Type        | Use For                          | Mobile Keyboard       |
|-------------------|----------------------------------|-----------------------|
| `text`            | Names, general short text        | Standard              |
| `email`           | Email addresses                  | @ and . prominent     |
| `tel`             | Phone numbers                    | Numeric pad           |
| `url`             | Website URLs                     | .com and / prominent  |
| `number`          | Quantities (not IDs or zips)     | Numeric pad           |
| `password`        | Passwords                        | Standard              |
| `search`          | Search queries                   | Search button         |
| `date`            | Dates                            | Native date picker    |
| Radio buttons     | 2-5 mutually exclusive options   | N/A                   |
| Checkboxes        | Multiple selections              | N/A                   |
| Select / dropdown | 5-15 options                     | Native picker         |
| Toggle switch     | Binary on/off settings           | N/A                   |

**Common mistakes:** Using `number` for phone/credit cards/zip codes (use `tel` or
`inputmode="numeric"` instead, since `number` adds spinners and strips leading zeros).
Using a dropdown for yes/no (use radio buttons or a toggle).

### Validation UX

**Inline validation (on blur)** checks each field when the user leaves it. Best general
approach: catches errors early without interrupting typing.

**Real-time validation (on keystroke)** is appropriate for username availability or
password strength, but annoying for most fields.

**Submit-time validation** is the worst for long forms. Fine for 1-2 field forms.

**Recommended: hybrid validation.**

1. Validate on blur (when the user leaves a field)
2. After an error is shown, re-validate on keystroke (error clears when valid)
3. Validate everything on submit as a safety net

```tsx
function useFieldValidation(validate: (value: string) => string | null) {
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const handleBlur = (value: string) => {
    setTouched(true);
    setError(validate(value));
  };

  const handleChange = (value: string) => {
    if (touched) setError(validate(value));
  };

  return { error, handleBlur, handleChange };
}
```

### Error Message Design

**Placement:** Directly below the relevant field, not at the top of the form.

**Tone:** Helpful, not blaming. "Please enter a valid email address" not "Invalid email."

**Specificity:** Tell the user exactly what is wrong. Not "Invalid password" but
"Password must be at least 8 characters and include one number."

**Visual treatment:** Red border, error icon, muted red text, `aria-describedby` to
link error to input, `aria-invalid="true"` on the input.

### Success States

Use success indicators sparingly. Reserve them for fields that were previously in error,
async validations (username availability), and password strength reaching "strong."

### Required vs Optional Field Indicators

- **Most fields required:** Mark optional fields with "(optional)"
- **Most fields optional:** Mark required with asterisk (*) plus legend

**Best practice:** Eliminate optional fields entirely. Every field removed increases
completion rates.

### Progressive Disclosure

Show fields only when they become relevant based on previous input. This reduces
cognitive load.

```
  Contact method: (•) Phone
      ↓
      Phone Number: [________________]
      Preferred time: [Morning ▼]
```

Implement with smooth height animations so appearing fields feel natural.

### Multi-step Forms

For forms with 5+ fields, break them into steps with a progress indicator.

```
  ====●===========○===========○====
       Account     Details      Review
```

**Principles:** Show progress clearly, allow going back without data loss, validate
each step before "next," show a review step before submission, save progress for
long forms.

### Form Accessibility

**Labels:** Every input needs a visible `<label>` with `for` matching the input's `id`.
Never use placeholder as the only label.

```html
<!-- WRONG -->
<input type="email" placeholder="Email" />

<!-- CORRECT -->
<label for="email">Email Address</label>
<input type="email" id="email" name="email" />
```

**Key ARIA attributes:**

| Attribute            | Purpose                                    |
|----------------------|--------------------------------------------|
| `aria-required`      | Indicates a required field                 |
| `aria-invalid`       | Indicates a field with an error            |
| `aria-describedby`   | Links input to help text or error message  |
| `aria-live="polite"` | Announces dynamic validation changes       |

**Focus management:** On error, focus the first invalid field. After step changes,
focus the first field of the new step. Tab order must match visual order.

### Password and Sensitive Input Design

- Show/hide toggle (eye icon) for password verification
- Password strength meter with clear criteria checklist
- Never prevent paste (breaks password managers)
- Use `autocomplete="new-password"` for registration, `"current-password"` for login
- For credit cards: use `inputmode="numeric"`, auto-format, mask when complete

### Autofill and Autocomplete

Support browser autofill with standard `autocomplete` attributes:

```html
<input type="text" name="name" autocomplete="name" />
<input type="email" name="email" autocomplete="email" />
<input type="tel" name="phone" autocomplete="tel" />
<input type="text" name="zip" autocomplete="postal-code" />
```

Never disable autocomplete on standard fields. Style autofilled inputs to match your
design (browsers apply yellow backgrounds by default).

---

## Practical Examples

### Contact Form with Hybrid Validation

```tsx
function ContactForm() {
  const [formState, setFormState] = useState<FormState>({
    name: "", email: "", message: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());

  const updateField = (field: keyof FormState, value: string) => {
    const nextState = { ...formState, [field]: value };
    setFormState(nextState);
    if (touched.has(field)) setErrors(validateForm(nextState));
  };

  const handleBlur = (field: keyof FormState) => {
    const nextTouched = new Set(touched);
    nextTouched.add(field);
    setTouched(nextTouched);
    setErrors(validateForm(formState));
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FormField
        label="Name"
        error={touched.has("name") ? errors.name : undefined}
        required
      >
        <input
          type="text"
          value={formState.name}
          onChange={(e) => updateField("name", e.target.value)}
          onBlur={() => handleBlur("name")}
          autoComplete="name"
          aria-invalid={touched.has("name") && !!errors.name}
          className={cn(
            "w-full rounded-lg border px-4 py-2 outline-none",
            "focus:border-blue-500 focus:ring-2 focus:ring-blue-200",
            touched.has("name") && errors.name
              ? "border-red-400" : "border-gray-300"
          )}
        />
      </FormField>
      {/* Similar fields for email and message */}
      <button type="submit"
        className="mt-4 w-full rounded-lg bg-blue-600 py-3 text-white
                   font-medium hover:bg-blue-700 transition-colors"
      >
        Send Message
      </button>
    </form>
  );
}
```

### Reusable Form Field Component

```tsx
function FormField({ label, error, required, children, helpText }: FormFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>

      {React.cloneElement(children as React.ReactElement, {
        id,
        "aria-describedby": error ? errorId : undefined,
        "aria-invalid": !!error,
      })}

      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
```

### Multi-step Progress Indicator

```tsx
function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <div className="mb-8 flex items-center justify-between">
      {steps.map((step, index) => (
        <div key={step} className="flex items-center">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium",
              index < currentStep ? "bg-blue-600 text-white"
                : index === currentStep ? "border-2 border-blue-600 text-blue-600"
                : "border-2 border-gray-300 text-gray-400"
            )}
            aria-current={index === currentStep ? "step" : undefined}
          >
            {index < currentStep ? "✓" : index + 1}
          </div>
          {index < steps.length - 1 && (
            <div className={cn("mx-2 h-0.5 w-16",
              index < currentStep ? "bg-blue-600" : "bg-gray-300")} />
          )}
        </div>
      ))}
    </div>
  );
}
```

---

## Common Interview Questions

### 1. What is the best label placement for forms and why?

Top-aligned labels have the best completion rates because they minimize eye movement
and create a single vertical scan path. They also adapt naturally to mobile screens.
Left-aligned labels create a zig-zag scanning pattern. Floating labels save space but
risk accessibility issues when the floated label is too small.

### 2. When should you validate: on blur, on keystroke, or on submit?

Hybrid is best. Validate on blur as the primary trigger. Once a field has been marked
invalid, switch to on-keystroke for that field so the error clears immediately. Always
validate on submit as a safety net. Pure on-keystroke is frustrating (shows errors
before the user finishes). Pure on-submit is frustrating for long forms.

### 3. How do you write good error messages?

Be specific, helpful, and human. "Please enter a valid email (e.g., name@example.com)"
instead of "Invalid input." Place errors below the relevant field with a red border.
Never blame the user. Show requirements before input when possible.

### 4. How do you make forms accessible?

Every input needs a visible `<label>` with `for`. Use `aria-invalid` on error fields,
`aria-describedby` to link inputs with errors, `aria-required` for required fields.
Manage focus: move to first invalid field on submit failure. Ensure all inputs are
reachable via Tab, and error messages use `role="alert"`.

### 5. When should you use a multi-step form versus a single-page form?

Multi-step for 5+ fields with logical groupings, or when showing everything would
overwhelm users. Single-page for short forms or when users need all fields visible
to make decisions. Multi-step forms must allow going back, save progress, and show
progress indicators.

### 6. What is progressive disclosure in forms?

Showing fields only when relevant based on previous input. For example, phone
preferences appear only after selecting "phone" as contact method. Use it for
conditional logic and advanced options. Animate the appearance smoothly.

### 7. How do you handle password input design?

Show/hide toggle, real-time strength meter, requirements checklist that updates as
user types. Never prevent paste. Use `autocomplete="new-password"` for registration,
`"current-password"` for login.

### 8. Why should you support browser autofill?

Autofill reduces completion time by up to 30% and reduces errors. Use standard `name`
and `autocomplete` attributes. Never disable autocomplete. Test across browsers.

---

## Applying to Your Portfolio

### Contact Form Enhancement

Apply these principles to your portfolio contact form: single-column layout, top-aligned
labels, hybrid validation, specific error messages below fields, success toast on
submission, proper `autocomplete` attributes, and `aria-invalid`/`aria-describedby`.

### Animated Form Transitions

Use Framer Motion for error messages sliding in with opacity fade and multi-step
transitions:

```tsx
<AnimatePresence>
  {error && (
    <motion.p
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="text-sm text-red-600"
      role="alert"
    >
      {error}
    </motion.p>
  )}
</AnimatePresence>
```

### Consistent Input Styling

```tsx
const inputClasses = cn(
  "w-full rounded-lg border px-4 py-3",
  "bg-white dark:bg-gray-900",
  "border-gray-300 dark:border-gray-600",
  "focus:border-blue-500 focus:ring-2 focus:ring-blue-200",
  "placeholder:text-gray-400 transition-colors outline-none"
);
```

---

## Quick Reference

| Principle                | Best Practice                                           |
|--------------------------|---------------------------------------------------------|
| Layout                   | Single column default; multi-column only for related fields |
| Labels                   | Top-aligned, always visible, never placeholder-only     |
| Validation timing        | On blur, then on keystroke after error, always on submit |
| Error placement          | Directly below the field, specific and helpful           |
| Error tone               | Instructional, not blaming                              |
| Required fields          | Mark whichever type is less common                      |
| Progressive disclosure   | Show fields only when relevant                          |
| Multi-step               | 5+ fields, save progress, show progress indicator       |
| Accessibility            | label + for, aria-invalid, aria-describedby, focus mgmt |
| Password                 | Show/hide toggle, strength meter, allow paste           |
| Autofill                 | Use autocomplete attributes, never disable              |
| Mobile                   | Correct input types for correct keyboards               |

**The golden rule of form design:** Every field you remove increases your completion
rate. Ask only for what you truly need.
