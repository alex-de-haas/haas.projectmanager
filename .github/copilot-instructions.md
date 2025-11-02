# Project Management App

This is a Next.js application designed to help users manage projects, tasks, and time more effectively. Support Azure DevOps integration for import and manage work items.

### Folders Structure

- app/ — Used for App Router.
- features/ — Keeps related logic together (components, hooks, services).
- lib/ — Utilities, configs, constants, and API clients.
- types/ — Shared types/interfaces for TypeScript safety.
- public/ — For static assets served at /.

### Component Structure

- Use functional components with TypeScript
- Define prop interfaces before component implementation
- Use descriptive interface names (e.g., `UserProfileProps`, `NavigationBarProps`)
- Export components as default exports from their files
- Use `NextPage` for page components
- Use `NextPageWithLayout` for pages that require a layout

```typescript
interface ButtonProps {
  variant: "primary" | "secondary" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}

export default function Button({ variant, size = "md", disabled, onClick, children }: ButtonProps) {
  // Implementation
}
```

### Server Components vs Client Components

- Default to Server Components unless client-side interactivity is needed
- Use `'use client'` directive only when necessary (state, effects, event handlers)
- Keep client components small and focused
- Pass data down from Server Components to Client Components via props

### Data Fetching

- Use async Server Components for data fetching
- Implement proper error handling with try-catch blocks
- Use TypeScript generics for API response types
- Implement loading and error states
