# Using Sonner Toast Notifications

Sonner is now integrated into your application. Here's how to use it:

## Basic Usage

Import the toast function in any client component:

```tsx
"use client"

import { toast } from "sonner"

export default function MyComponent() {
  return (
    <button onClick={() => toast("Hello World")}>
      Show Toast
    </button>
  )
}
```

## Toast Variants

### Success
```tsx
toast.success("Task completed successfully")
```

### Error
```tsx
toast.error("Failed to save task")
```

### Warning
```tsx
toast.warning("This action cannot be undone")
```

### Info
```tsx
toast.info("New updates available")
```

### Loading
```tsx
toast.loading("Importing work items...")
```

## Advanced Usage

### With Description
```tsx
toast.success("Task created", {
  description: "Your task has been added to the list",
})
```

### With Action Button
```tsx
toast("Event scheduled", {
  action: {
    label: "Undo",
    onClick: () => console.log("Undo"),
  },
})
```

### Promise-based
```tsx
toast.promise(fetchData(), {
  loading: "Loading...",
  success: "Data loaded successfully",
  error: "Failed to load data",
})
```

### Custom Duration
```tsx
toast.success("Saved", { duration: 5000 })
```

### Dismissible
```tsx
toast("This can be closed", {
  dismissible: true,
  closeButton: true,
})
```

## Example Integration in Your App

For API calls in your features:

```tsx
// In your Azure DevOps import modal
const handleImport = async () => {
  const promise = fetch('/api/azure-devops/import', {
    method: 'POST',
    body: JSON.stringify(selectedItems)
  })

  toast.promise(promise, {
    loading: 'Importing work items...',
    success: 'Work items imported successfully',
    error: 'Failed to import work items',
  })
}

// In your task management
const handleTaskCreate = async (task: Task) => {
  try {
    await createTask(task)
    toast.success("Task created", {
      description: `"${task.title}" has been added`,
    })
  } catch (error) {
    toast.error("Failed to create task", {
      description: error.message,
    })
  }
}
```

## Positioning

You can change the position globally in the layout:

```tsx
<Toaster position="top-right" />
```

Available positions: `top-left`, `top-center`, `top-right`, `bottom-left`, `bottom-center`, `bottom-right`

## Rich Content

```tsx
toast(
  <div className="flex items-center gap-2">
    <CheckIcon className="h-4 w-4" />
    <span>Custom content</span>
  </div>
)
```
