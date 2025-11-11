# General Settings Feature

## Overview

The application now includes a comprehensive settings system that manages both general application settings and Azure DevOps integration settings.

## Settings Structure

### General Settings

#### Default Day Length
- **Key**: `default_day_length`
- **Type**: Number (stored as string in database)
- **Default Value**: `8` (hours)
- **Range**: 0.5 - 24 hours
- **Description**: Sets the default number of hours in a working day, used for time tracking calculations and reporting.

### Azure DevOps Settings

- **Key**: `azure_devops`
- **Type**: JSON object
- **Structure**:
  ```typescript
  {
    organization: string;
    project: string;
    pat: string; // Personal Access Token
  }
  ```

## UI Implementation

### GeneralSettingsModal Component

Location: `src/features/settings/components/GeneralSettingsModal.tsx`

The modal uses a tabbed interface to organize different setting categories:

1. **General Tab**
   - Default Day Length input (numeric, with step of 0.5 hours)

2. **Azure DevOps Tab**
   - Organization name
   - Project name
   - Personal Access Token (PAT)
   - Test Connection button

### Features

- **Validation**: Ensures default day length is between 0.5 and 24 hours
- **Persistence**: All settings are saved to the SQLite database
- **Default Values**: Default day length is automatically created with 8 hours on first run
- **Error Handling**: Displays success/error messages for all operations
- **Test Connection**: Azure DevOps settings can be tested before saving

## Database Schema

Settings are stored in the `settings` table:

```sql
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## API Routes

### GET /api/settings

Retrieve settings:
- Without parameters: Returns all settings
- With `?key=<key>`: Returns specific setting
- Azure DevOps settings are automatically parsed from JSON

### POST /api/settings

Save or update a setting:
```json
{
  "key": "default_day_length",
  "value": "8"
}
```

### DELETE /api/settings

Delete a setting (requires `?key=<key>` parameter)

## Types

TypeScript interfaces are defined in `src/types/index.ts`:

```typescript
export interface Settings {
  id: number;
  key: string;
  value: string;
  created_at: Date;
  updated_at: Date;
}

export interface GeneralSettings {
  default_day_length: number;
}

export interface AzureDevOpsSettings {
  organization: string;
  project: string;
  pat: string;
}
```

## Migration

The database initialization automatically:
1. Creates the settings table if it doesn't exist
2. Inserts a default `default_day_length` setting of 8 hours if not present

This ensures backward compatibility with existing installations.

## Usage Example

```typescript
// In a component
const [defaultDayLength, setDefaultDayLength] = useState<number>(8);

// Load settings
const loadSettings = async () => {
  const response = await fetch("/api/settings?key=default_day_length");
  const data = await response.json();
  if (data.value) {
    setDefaultDayLength(parseFloat(data.value));
  }
};

// Save settings
const saveSettings = async () => {
  await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: "default_day_length",
      value: defaultDayLength.toString(),
    }),
  });
};
```

## Future Enhancements

Potential additions to the settings system:
- Week start day preference (Monday/Sunday)
- Time entry rounding preferences
- Display format preferences (12/24 hour)
- Default task type
- Notification preferences
