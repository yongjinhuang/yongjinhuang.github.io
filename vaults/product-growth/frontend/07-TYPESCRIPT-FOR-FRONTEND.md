# TypeScript for Frontend

## Overview

TypeScript has become the default for professional frontend development. In interviews, you are expected to go beyond basic type annotations. Interviewers test your ability to model complex domains with the type system, write generic utilities, narrow types safely, and type React components idiomatically. This guide covers the type system features that matter most in frontend work, from inference and generics to advanced patterns like discriminated unions, mapped types, and typing React components.

---

## Core Concepts

### Type Inference

TypeScript infers types from values wherever possible. You should let inference do the work and only annotate when the inferred type is too broad or ambiguous.

```typescript
// Inference works -- no annotation needed
const name = 'Alice'; // type: "Alice" (string literal)
const count = 42; // type: 42 (number literal)
const items = [1, 2, 3]; // type: number[]
const user = { name: 'Bob', age: 30 }; // type: { name: string; age: number }

// Let annotation needed when inference is too broad
let status: 'loading' | 'success' | 'error' = 'loading';

// Return type inference
function add(a: number, b: number) {
  return a + b; // Return type inferred as number
}

// const assertion -- infer narrowest possible type
const config = {
  endpoint: '/api/users',
  method: 'GET',
} as const;
// type: { readonly endpoint: "/api/users"; readonly method: "GET" }

// Without as const:
// type: { endpoint: string; method: string }
```

### Generics

Generics allow functions, interfaces, and classes to work with any type while maintaining type safety:

```typescript
// Generic function
function first<T>(arr: T[]): T | undefined {
  return arr[0];
}

const num = first([1, 2, 3]); // type: number | undefined
const str = first(['a', 'b']); // type: string | undefined

// Generic with constraint
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const user = { name: 'Alice', age: 30 };
const name = getProperty(user, 'name'); // type: string
const age = getProperty(user, 'age'); // type: number
// getProperty(user, 'email');           // Error: 'email' not in keyof user

// Generic interface
interface ApiResponse<T> {
  data: T;
  status: number;
  timestamp: string;
}

type UserResponse = ApiResponse<{ id: string; name: string }>;

// Default generic parameter
interface PaginatedResponse<T, M = { total: number; page: number }> {
  items: T[];
  meta: M;
}
```

### Utility Types

TypeScript ships with built-in utility types that transform existing types:

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: Date;
}

// Partial<T> -- all properties optional
type UpdateUserDto = Partial<User>;
// { id?: string; name?: string; email?: string; ... }

// Required<T> -- all properties required
type StrictUser = Required<Partial<User>>;

// Pick<T, K> -- select specific properties
type UserPreview = Pick<User, 'id' | 'name'>;
// { id: string; name: string }

// Omit<T, K> -- exclude specific properties
type CreateUserDto = Omit<User, 'id' | 'createdAt'>;
// { name: string; email: string; role: 'admin' | 'user' }

// Record<K, V> -- object type with keys K and values V
type RolePermissions = Record<User['role'], string[]>;
// { admin: string[]; user: string[] }

// Readonly<T> -- all properties readonly
type FrozenUser = Readonly<User>;

// Extract<T, U> -- extract members from union
type AdminRole = Extract<User['role'], 'admin'>; // 'admin'

// Exclude<T, U> -- remove members from union
type NonAdminRole = Exclude<User['role'], 'admin'>; // 'user'

// ReturnType<T> -- get return type of function
function fetchUser() {
  return { id: '1', name: 'Alice' };
}
type FetchResult = ReturnType<typeof fetchUser>;
// { id: string; name: string }

// Parameters<T> -- get parameter types as tuple
type FetchParams = Parameters<typeof getProperty>;
// [obj: T, key: K]

// NonNullable<T> -- remove null and undefined
type MaybeString = string | null | undefined;
type DefiniteString = NonNullable<MaybeString>; // string

// Awaited<T> -- unwrap Promise type
type Data = Awaited<Promise<Promise<string>>>; // string
```

### Discriminated Unions

A pattern where a common property (discriminant) determines which variant of a union you are working with:

```typescript
type Result<T> =
  | { status: 'success'; data: T }
  | { status: 'error'; error: string }
  | { status: 'loading' };

function handleResult(result: Result<User>) {
  switch (result.status) {
    case 'success':
      // TypeScript knows result.data exists here
      console.log(result.data.name);
      break;
    case 'error':
      // TypeScript knows result.error exists here
      console.log(result.error);
      break;
    case 'loading':
      // No data or error properties
      console.log('Loading...');
      break;
  }
}

// Event system with discriminated unions
type AppEvent =
  | { type: 'USER_LOGIN'; payload: { userId: string } }
  | { type: 'USER_LOGOUT' }
  | { type: 'ITEM_ADDED'; payload: { itemId: string; quantity: number } }
  | { type: 'ITEM_REMOVED'; payload: { itemId: string } };

function handleEvent(event: AppEvent) {
  switch (event.type) {
    case 'USER_LOGIN':
      // event.payload is { userId: string }
      startSession(event.payload.userId);
      break;
    case 'USER_LOGOUT':
      // No payload
      endSession();
      break;
    case 'ITEM_ADDED':
      // event.payload is { itemId: string; quantity: number }
      addToCart(event.payload.itemId, event.payload.quantity);
      break;
  }
}
```

### Type Narrowing

TypeScript narrows types based on control flow:

```typescript
// typeof guard
function format(value: string | number) {
  if (typeof value === 'string') {
    return value.toUpperCase(); // string methods available
  }
  return value.toFixed(2); // number methods available
}

// instanceof guard
function getLength(value: string | string[]) {
  if (value instanceof Array) {
    return value.length; // array
  }
  return value.length; // string
}

// in operator
interface Fish {
  swim: () => void;
}
interface Bird {
  fly: () => void;
}

function move(animal: Fish | Bird) {
  if ('swim' in animal) {
    animal.swim(); // Fish
  } else {
    animal.fly(); // Bird
  }
}

// Custom type guard
function isUser(value: unknown): value is User {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value &&
    typeof (value as User).id === 'string'
  );
}

function processInput(input: unknown) {
  if (isUser(input)) {
    console.log(input.name); // TypeScript knows input is User
  }
}

// Exhaustive check with never
function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${value}`);
}

type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'square'; side: number };

function area(shape: Shape): number {
  switch (shape.kind) {
    case 'circle':
      return Math.PI * shape.radius ** 2;
    case 'square':
      return shape.side ** 2;
    default:
      return assertNever(shape); // Compile error if a case is missing
  }
}
```

### Template Literal Types

Build types from string patterns:

```typescript
// Basic template literal
type EventName = `on${Capitalize<'click' | 'focus' | 'blur'>}`;
// "onClick" | "onFocus" | "onBlur"

// CSS property helper
type CSSUnit = 'px' | 'rem' | 'em' | '%' | 'vh' | 'vw';
type CSSValue = `${number}${CSSUnit}`;
// "10px", "2rem", "100%", etc.

const width: CSSValue = '100px'; // OK
// const bad: CSSValue = 'abc';   // Error

// Route parameters
type Route = '/users/:id' | '/posts/:postId/comments/:commentId';

type ExtractParams<T extends string> =
  T extends `${infer _Start}:${infer Param}/${infer Rest}`
    ? { [K in Param | keyof ExtractParams<Rest>]: string }
    : T extends `${infer _Start}:${infer Param}`
      ? { [K in Param]: string }
      : {};

type UserRouteParams = ExtractParams<'/users/:id'>;
// { id: string }

type CommentRouteParams = ExtractParams<'/posts/:postId/comments/:commentId'>;
// { postId: string; commentId: string }

// Object key patterns
type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

type UserGetters = Getters<{ name: string; age: number }>;
// { getName: () => string; getAge: () => number }
```

### Mapped Types

Transform every property in a type:

```typescript
// Make all properties optional
type MyPartial<T> = {
  [K in keyof T]?: T[K];
};

// Make all properties readonly
type MyReadonly<T> = {
  readonly [K in keyof T]: T[K];
};

// Make all properties nullable
type Nullable<T> = {
  [K in keyof T]: T[K] | null;
};

// Remove readonly modifier
type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

// Key remapping with as
type Prefixed<T> = {
  [K in keyof T as `data_${string & K}`]: T[K];
};

type PrefixedUser = Prefixed<{ name: string; age: number }>;
// { data_name: string; data_age: number }

// Filter properties by type
type StringKeys<T> = {
  [K in keyof T as T[K] extends string ? K : never]: T[K];
};

type UserStrings = StringKeys<User>;
// { id: string; name: string; email: string }
```

### Conditional Types

Types that depend on a condition:

```typescript
// Basic conditional
type IsString<T> = T extends string ? true : false;

type A = IsString<string>; // true
type B = IsString<number>; // false

// Inferring within conditionals
type Flatten<T> = T extends Array<infer Item> ? Item : T;

type Num = Flatten<number[]>; // number
type Str = Flatten<string>; // string

// Unwrap promise
type UnwrapPromise<T> = T extends Promise<infer U> ? UnwrapPromise<U> : T;

type Result = UnwrapPromise<Promise<Promise<string>>>; // string

// Distributive conditional types (applied to each member of union)
type ToArray<T> = T extends unknown ? T[] : never;

type Arr = ToArray<string | number>;
// string[] | number[]  (NOT (string | number)[])

// Non-distributive (wrap in tuple)
type ToArrayNonDist<T> = [T] extends [unknown] ? T[] : never;

type Arr2 = ToArrayNonDist<string | number>;
// (string | number)[]

// Practical: Extract function overload return types
type ExtractReturn<T> = T extends (...args: infer _A) => infer R ? R : never;
```

### Declaration Files

`.d.ts` files provide type information for JavaScript code:

```typescript
// global.d.ts -- ambient declarations
declare global {
  interface Window {
    analytics: {
      track: (event: string, data?: Record<string, unknown>) => void;
    };
  }
}

// module declaration for untyped packages
declare module 'untyped-library' {
  export function doSomething(input: string): number;
  export default function main(): void;
}

// CSS modules
declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}

// Image imports
declare module '*.svg' {
  const content: React.FC<React.SVGAttributes<SVGElement>>;
  export default content;
}

declare module '*.png' {
  const src: string;
  export default src;
}

// Environment variables
declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    NEXT_PUBLIC_API_URL: string;
    DATABASE_URL: string;
  }
}
```

### Typing React Components

```typescript
// Props with children
interface CardProps {
  title: string;
  variant?: 'default' | 'outlined';
  children: React.ReactNode;
}

function Card({ title, variant = 'default', children }: CardProps) {
  return (
    <div className={`card card-${variant}`}>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

// Event handlers
interface FormProps {
  onSubmit: (data: { name: string; email: string }) => void;
}

function Form({ onSubmit }: FormProps) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    onSubmit({
      name: formData.get('name') as string,
      email: formData.get('email') as string,
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log(e.target.value);
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    console.log(e.clientX, e.clientY);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="name" onChange={handleChange} />
      <input name="email" onChange={handleChange} />
      <button onClick={handleClick} type="submit">Submit</button>
    </form>
  );
}

// Refs
interface InputProps {
  label: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label }, ref) => (
    <label>
      {label}
      <input ref={ref} />
    </label>
  )
);

// React 19: ref as regular prop (no forwardRef needed)
function Input19({ label, ref }: InputProps & { ref?: React.Ref<HTMLInputElement> }) {
  return (
    <label>
      {label}
      <input ref={ref} />
    </label>
  );
}

// Generic component
interface ListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T) => string;
}

function List<T>({ items, renderItem, keyExtractor }: ListProps<T>) {
  return (
    <ul>
      {items.map((item, index) => (
        <li key={keyExtractor(item)}>{renderItem(item, index)}</li>
      ))}
    </ul>
  );
}

// Usage -- TypeScript infers T from items
<List
  items={users}
  renderItem={(user) => <span>{user.name}</span>}
  keyExtractor={(user) => user.id}
/>

// Polymorphic component (as prop)
type PolymorphicProps<C extends React.ElementType> = {
  as?: C;
  children: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<C>, 'as' | 'children'>;

function Box<C extends React.ElementType = 'div'>({
  as,
  children,
  ...props
}: PolymorphicProps<C>) {
  const Component = as || 'div';
  return <Component {...props}>{children}</Component>;
}

// Usage
<Box as="a" href="/about">Link styled as box</Box>
<Box as="button" onClick={handleClick}>Button styled as box</Box>

// Typing context
interface AuthContextType {
  user: User | null;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = React.createContext<AuthContextType | null>(null);

function useAuth(): AuthContextType {
  const context = React.useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

// Typing hooks
function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = React.useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item !== null ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = React.useCallback((value: T | ((prev: T) => T)) => {
    setStoredValue(prev => {
      const valueToStore = value instanceof Function ? value(prev) : value;
      try {
        localStorage.setItem(key, JSON.stringify(valueToStore));
      } catch (error) {
        console.error(`Error writing to localStorage key "${key}":`, error);
      }
      return valueToStore;
    });
  }, [key]);

  return [storedValue, setValue];
}
```

---

## Common Interview Questions

### Q1: Explain the difference between `type` and `interface` in TypeScript.

**Answer:** Both define object shapes, but they have key differences:

**`interface`:**

- Supports declaration merging (multiple declarations with the same name merge)
- Supports `extends` for inheritance
- Can only describe object shapes (not primitives, unions, tuples)
- Better error messages in some cases

**`type`:**

- Cannot be merged (redeclaring is an error)
- Uses `&` for intersection (similar to extends)
- Can represent any type: primitives, unions, tuples, mapped types, conditional types
- More expressive and flexible

```typescript
// Declaration merging (interface only)
interface Window {
  myGlobal: string;
}
// Merges with the existing Window interface

// Union type (type only)
type Status = 'active' | 'inactive';

// Intersection
type Admin = User & { permissions: string[] };

// Computed properties (type only)
type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};
```

**Recommendation:** Use `interface` for public API contracts and object shapes that may be extended. Use `type` for unions, computed types, and complex type expressions.

### Q2: How do generics work and why are they important?

**Answer:** Generics parameterize types, allowing you to write code that works with any type while preserving type information. Without generics, you would use `any` (losing type safety) or write duplicate implementations for each type.

```typescript
// Without generics -- loses type info
function firstAny(arr: any[]): any {
  return arr[0];
}

// With generics -- preserves type info
function first<T>(arr: T[]): T | undefined {
  return arr[0];
}

const num = first([1, 2, 3]); // number | undefined (not any)
```

Generics are crucial for:

- Collection types (`Array<T>`, `Map<K, V>`, `Set<T>`)
- API response wrappers (`ApiResponse<T>`)
- Utility types (`Partial<T>`, `Pick<T, K>`)
- React component props (`useState<T>`, generic components)

### Q3: What are discriminated unions and when would you use them?

**Answer:** Discriminated unions are union types where each member has a common literal property (the discriminant) that TypeScript uses for narrowing. They model states that have different shapes depending on a variant.

Use them for:

- **API response states** (`loading | success | error`)
- **Event systems** (different event types with different payloads)
- **State machines** (each state has different available data)
- **Redux actions** (action type determines payload shape)

The exhaustive `switch` pattern with a `never` default case ensures you handle every variant. If you add a new variant, TypeScript flags unhandled cases at compile time.

### Q4: Explain conditional types and give a practical example.

**Answer:** Conditional types select one of two types based on a condition: `T extends U ? X : Y`. They are most powerful when combined with `infer` to extract types.

```typescript
// Extract the element type from an array, or keep the type as-is
type Unwrap<T> = T extends Array<infer E> ? E : T;

type A = Unwrap<string[]>; // string
type B = Unwrap<number>; // number

// Extract the resolved type from a Promise
type Resolved<T> = T extends Promise<infer R> ? Resolved<R> : T;

// Practical: Extract prop types from a component
type PropsOf<C> = C extends React.ComponentType<infer P> ? P : never;

type ButtonProps = PropsOf<typeof Button>;
```

A key subtlety is **distributive behavior**: when `T` is a naked type parameter and the input is a union, the conditional is applied to each member independently. Wrapping in a tuple `[T]` prevents distribution.

### Q5: How do you type a polymorphic React component (the `as` prop pattern)?

**Answer:** A polymorphic component renders as different HTML elements or components based on an `as` prop. The challenge is that the valid props change depending on what `as` is.

```typescript
type PolymorphicProps<C extends React.ElementType, Props = {}> = Props & {
  as?: C;
} & Omit<React.ComponentPropsWithoutRef<C>, keyof Props | 'as'>;

type PolymorphicRef<C extends React.ElementType> =
  React.ComponentPropsWithRef<C>['ref'];

function Box<C extends React.ElementType = 'div'>({
  as,
  ...props
}: PolymorphicProps<C>) {
  const Component = as || 'div';
  return <Component {...props} />;
}
```

When `as="a"`, TypeScript requires valid anchor props (`href`). When `as="button"`, it requires valid button props (`type`, `disabled`). Invalid props for the chosen element produce compile errors.

### Q6: What is the difference between `unknown` and `any`?

**Answer:** Both accept any value, but they differ in what you can do with the value:

- **`any`** disables type checking entirely. You can access any property, call any method, and assign to any type. It is an escape hatch that defeats the purpose of TypeScript.

- **`unknown`** is the type-safe counterpart. You can assign anything to `unknown`, but you cannot do anything with it until you narrow the type (using `typeof`, `instanceof`, type guards, or assertions).

```typescript
function processAny(value: any) {
  value.foo.bar.baz(); // No error -- but might crash at runtime
}

function processUnknown(value: unknown) {
  // value.foo;  // Error: Object is of type 'unknown'

  if (typeof value === 'string') {
    value.toUpperCase(); // OK -- narrowed to string
  }

  if (isUser(value)) {
    value.name; // OK -- narrowed to User
  }
}
```

**Rule:** Use `unknown` for values of uncertain type (API responses, user input). Never use `any` unless you are migrating JavaScript code and need a temporary escape.

### Q7: How do mapped types work and when would you create custom ones?

**Answer:** Mapped types iterate over the keys of a type and transform each property. The syntax `[K in keyof T]` iterates over every key in `T`.

```typescript
// Make all properties optional and nullable
type Draft<T> = {
  [K in keyof T]?: T[K] | null;
};

// Make specific properties required, rest optional
type RequireFields<T, K extends keyof T> = Omit<Partial<T>, K> & Pick<T, K>;

type CreateUserDto = RequireFields<User, 'name' | 'email'>;
// name and email required, everything else optional
```

Create custom mapped types when built-in utility types don't cover your transformation. Common use cases: form state types (all fields nullable), API DTOs (select which fields are required), event handler maps, and key-remapped types for naming conventions.

### Q8: How would you type a React context that might be undefined?

**Answer:** The safest pattern is to type the context as `T | null`, defaulting to `null`, and provide a custom hook that throws if used outside the provider:

```typescript
interface ThemeContextType {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const ThemeContext = React.createContext<ThemeContextType | null>(null);

function useTheme(): ThemeContextType {
  const context = React.useContext(ThemeContext);
  if (context === null) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
```

This approach ensures that consumers get a properly typed value without needing to check for `null` at every call site. The runtime error clearly identifies misuse. Avoid using `createContext<ThemeContextType>(undefined as unknown as ThemeContextType)` -- it hides bugs.

---

## Code Examples

### Type-Safe Event Emitter

```typescript
type EventMap = {
  userLogin: { userId: string; timestamp: number };
  userLogout: { userId: string };
  pageView: { path: string; referrer?: string };
};

class TypedEmitter<Events extends Record<string, unknown>> {
  private listeners: {
    [K in keyof Events]?: Array<(data: Events[K]) => void>;
  } = {};

  on<K extends keyof Events>(
    event: K,
    listener: (data: Events[K]) => void
  ): () => void {
    const eventListeners = this.listeners[event] ?? [];
    this.listeners[event] = [...eventListeners, listener];

    return () => {
      this.listeners[event] = (this.listeners[event] ?? []).filter(
        (l) => l !== listener
      );
    };
  }

  emit<K extends keyof Events>(event: K, data: Events[K]): void {
    const eventListeners = this.listeners[event] ?? [];
    eventListeners.forEach((listener) => listener(data));
  }
}

const emitter = new TypedEmitter<EventMap>();

emitter.on('userLogin', (data) => {
  // data is { userId: string; timestamp: number }
  console.log(data.userId);
});

emitter.emit('userLogin', { userId: '123', timestamp: Date.now() });
// emitter.emit('userLogin', { wrong: true });  // Type error
```

### Type-Safe Form Hook

```typescript
type FieldErrors<T> = Partial<Record<keyof T, string>>;

interface UseFormReturn<T extends Record<string, unknown>> {
  values: T;
  errors: FieldErrors<T>;
  setValue: <K extends keyof T>(field: K, value: T[K]) => void;
  setError: <K extends keyof T>(field: K, message: string) => void;
  handleSubmit: (onSubmit: (data: T) => void) => (e: React.FormEvent) => void;
}

function useForm<T extends Record<string, unknown>>(initialValues: T): UseFormReturn<T> {
  const [values, setValues] = React.useState<T>(initialValues);
  const [errors, setErrors] = React.useState<FieldErrors<T>>({});

  const setValue = React.useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setValues(prev => ({ ...prev, [field]: value }));
    setErrors(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const setError = React.useCallback(<K extends keyof T>(field: K, message: string) => {
    setErrors(prev => ({ ...prev, [field]: message }));
  }, []);

  const handleSubmit = React.useCallback(
    (onSubmit: (data: T) => void) => (e: React.FormEvent) => {
      e.preventDefault();
      onSubmit(values);
    },
    [values]
  );

  return { values, errors, setValue, setError, handleSubmit };
}

// Usage
interface LoginForm {
  email: string;
  password: string;
  remember: boolean;
}

function LoginPage() {
  const { values, errors, setValue, handleSubmit } = useForm<LoginForm>({
    email: '',
    password: '',
    remember: false,
  });

  return (
    <form onSubmit={handleSubmit((data) => login(data))}>
      <input
        value={values.email}
        onChange={(e) => setValue('email', e.target.value)}
      />
      {errors.email && <span>{errors.email}</span>}
      {/* ... */}
    </form>
  );
}
```

### Builder Pattern with Types

```typescript
interface QueryConfig<T> {
  table: string;
  select: (keyof T)[];
  where: Partial<T>;
  orderBy?: { field: keyof T; direction: 'asc' | 'desc' };
  limit?: number;
}

class QueryBuilder<T extends Record<string, unknown>> {
  private config: QueryConfig<T>;

  constructor(table: string) {
    this.config = { table, select: [], where: {} };
  }

  select<K extends keyof T>(...fields: K[]): QueryBuilder<T> {
    return Object.assign(Object.create(Object.getPrototypeOf(this)), {
      config: { ...this.config, select: fields },
    });
  }

  where(conditions: Partial<T>): QueryBuilder<T> {
    return Object.assign(Object.create(Object.getPrototypeOf(this)), {
      config: {
        ...this.config,
        where: { ...this.config.where, ...conditions },
      },
    });
  }

  orderBy(field: keyof T, direction: 'asc' | 'desc' = 'asc'): QueryBuilder<T> {
    return Object.assign(Object.create(Object.getPrototypeOf(this)), {
      config: { ...this.config, orderBy: { field, direction } },
    });
  }

  limit(n: number): QueryBuilder<T> {
    return Object.assign(Object.create(Object.getPrototypeOf(this)), {
      config: { ...this.config, limit: n },
    });
  }

  build(): QueryConfig<T> {
    return { ...this.config };
  }
}

// Usage
interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
}

const query = new QueryBuilder<Product>('products')
  .select('id', 'name', 'price')
  .where({ category: 'electronics' })
  .orderBy('price', 'desc')
  .limit(10)
  .build();
```

---

## Gotchas & Edge Cases

1. **`Object.keys` returns `string[]`, not `(keyof T)[]`.** TypeScript widens the type because objects can have extra properties at runtime. Use `(Object.keys(obj) as (keyof typeof obj)[])` when you are certain of the object's shape.

2. **Excess property checking only applies to object literals.** Assigning `{ a: 1, b: 2 }` directly to a type `{ a: number }` errors. But assigning a variable of type `{ a: number; b: number }` to `{ a: number }` works fine (structural typing).

3. **Enums are nominal, not structural.** Two identical enums are not interchangeable. Prefer union types (`type Status = 'active' | 'inactive'`) over enums for most use cases.

4. **`readonly` is shallow.** `Readonly<{ nested: { value: number } }>` prevents reassigning `nested` but does not prevent mutating `nested.value`. Use `DeepReadonly` utility or `as const` for deep immutability.

5. **Generic defaults do not constrain.** `<T = string>` sets a default but does not prevent `T` from being `number`. Use `<T extends string = string>` to constrain.

6. **`void` is not `undefined` in all contexts.** A `void` return type means the return value should not be used, but functions with `void` return type can actually return any value (the caller just should not use it). This enables `Array.forEach` to accept callbacks that return values.

7. **Distributive conditional types surprise.** `ToArray<string | number>` distributes to `string[] | number[]`, not `(string | number)[]`. Wrap in a tuple to prevent: `[T] extends [unknown]`.

8. **`satisfies` does not narrow the type.** `const config = { ... } satisfies Config` checks the value against `Config` but preserves the inferred type. This is useful when you want type checking without widening.

9. **`React.FC` is controversial.** It adds implicit `children` typing (removed in React 18 types), prevents generic components, and adds overhead. Prefer typing props directly: `function Component(props: Props)`.

10. **Intersection of incompatible types is `never`.** `string & number` is `never`. When building complex intersection types, a typo can silently collapse a property to `never`, making the whole type unusable.

---

## Quick Reference

| Utility Type      | Transformation                         |
| ----------------- | -------------------------------------- |
| `Partial<T>`      | All properties optional                |
| `Required<T>`     | All properties required                |
| `Readonly<T>`     | All properties readonly                |
| `Pick<T, K>`      | Select properties K from T             |
| `Omit<T, K>`      | Remove properties K from T             |
| `Record<K, V>`    | Object with keys K and values V        |
| `Extract<T, U>`   | Members of T assignable to U           |
| `Exclude<T, U>`   | Members of T not assignable to U       |
| `NonNullable<T>`  | Remove null and undefined              |
| `ReturnType<F>`   | Return type of function F              |
| `Parameters<F>`   | Parameter types of function F as tuple |
| `Awaited<T>`      | Unwrap nested Promise types            |
| `InstanceType<C>` | Instance type of a constructor         |

| React Type                            | Usage                                           |
| ------------------------------------- | ----------------------------------------------- |
| `React.ReactNode`                     | Anything renderable (string, number, JSX, null) |
| `React.ReactElement`                  | JSX element specifically                        |
| `React.FC<Props>`                     | Function component type (avoid in modern code)  |
| `React.ComponentType<Props>`          | Class or function component                     |
| `React.ElementType`                   | Component or HTML tag string                    |
| `React.ComponentPropsWithoutRef<C>`   | Props of component C without ref                |
| `React.ComponentPropsWithRef<C>`      | Props of component C with ref                   |
| `React.FormEvent<HTMLFormElement>`    | Form submit event                               |
| `React.ChangeEvent<HTMLInputElement>` | Input change event                              |
| `React.MouseEvent<HTMLButtonElement>` | Button click event                              |
| `React.KeyboardEvent<HTMLElement>`    | Keyboard event                                  |
| `React.Ref<HTMLElement>`              | Ref type for elements                           |
| `React.MutableRefObject<T>`           | useRef return type                              |

| Type Guard                | Narrows To                 |
| ------------------------- | -------------------------- |
| `typeof x === 'string'`   | `string`                   |
| `typeof x === 'number'`   | `number`                   |
| `typeof x === 'boolean'`  | `boolean`                  |
| `typeof x === 'function'` | Function                   |
| `x instanceof Date`       | `Date`                     |
| `'key' in x`              | Object with `key` property |
| `Array.isArray(x)`        | `Array`                    |
| Custom: `(x): x is T`     | `T`                        |

| Keyword     | Purpose                                 |
| ----------- | --------------------------------------- |
| `as const`  | Infer narrowest literal type            |
| `satisfies` | Check type without widening             |
| `is`        | Custom type guard return                |
| `infer`     | Extract type within conditional         |
| `keyof`     | Union of object keys                    |
| `typeof`    | Get type from value                     |
| `extends`   | Generic constraint or conditional check |
| `never`     | Impossible type / exhaustive check      |
| `unknown`   | Type-safe any                           |
