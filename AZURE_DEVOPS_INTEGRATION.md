# Azure DevOps Integration

This document describes the Azure DevOps integration feature for importing tasks and bugs.

## Features

### 1. Azure DevOps Settings
- Configure your Azure DevOps organization, project, and Personal Access Token (PAT)
- Test connection before saving
- Secure storage of credentials in the database

### 2. Import Work Items
- Import work items assigned to you
- Import specific work items by ID
- Automatic task/bug type mapping
- Duplicate detection (prevents re-importing)
- Visual badge for imported items

## Setup Instructions

### Step 1: Create a Personal Access Token (PAT)

1. Go to your Azure DevOps organization
2. Click on your profile icon (top right) → **User settings** → **Personal access tokens**
3. Click **+ New Token**
4. Configure the token:
   - **Name**: Time Tracker Integration
   - **Organization**: Select your organization
   - **Expiration**: Choose your preferred expiration date
   - **Scopes**: Select **Work Items (Read)**
5. Click **Create**
6. **Important**: Copy the token immediately - you won't be able to see it again!

### Step 2: Configure Settings in the App

1. Open the Time Tracker application
2. Click the **⚙️ Settings** button
3. Fill in the following information:
   - **Organization**: Your Azure DevOps organization name (from `https://dev.azure.com/[organization]`)
   - **Project**: Your project name
   - **Personal Access Token**: Paste the PAT you created
4. Click **Test Connection** to verify the settings
5. If successful, click **Save Settings**

### Step 3: Import Work Items

1. Click the **Import from Azure DevOps** button
2. Choose an import mode:
   - **Import all work items assigned to me**: Imports all non-closed work items assigned to you
   - **Import specific work item IDs**: Enter comma-separated IDs (e.g., `123, 456, 789`)
3. Click **Import**
4. The app will display how many items were imported and how many were skipped

## Technical Details

### Database Schema Updates

New columns added to the `tasks` table:
- `external_id`: Stores the unique identifier from Azure DevOps (e.g., "ado-12345")
- `external_source`: Identifies the source system (currently "azure_devops")

New `settings` table:
- Stores configuration key-value pairs
- Azure DevOps settings stored as JSON

### API Endpoints

#### `/api/settings`
- `GET`: Retrieve settings (query param: `key`)
- `POST`: Create or update settings
- `DELETE`: Delete settings (query param: `key`)

#### `/api/azure-devops/test`
- `POST`: Test Azure DevOps connection with provided credentials

#### `/api/azure-devops/import`
- `POST`: Import work items from Azure DevOps
- Body options:
  - `{ "assignedToMe": true }` - Import items assigned to the authenticated user
  - `{ "workItemIds": [123, 456, 789] }` - Import specific work item IDs
  - `{ "query": "SELECT [System.Id] FROM WorkItems WHERE..." }` - Custom WIQL query

### Work Item Type Mapping

Azure DevOps work item types are mapped to the app's task types:
- **Bug** → `bug`
- All others (Task, User Story, Feature, etc.) → `task`

### Duplicate Prevention

The app checks the `external_id` field before importing. If a work item with the same external ID already exists, it will be skipped.

## Security Considerations

1. **PAT Storage**: Personal Access Tokens are stored in the database. Consider encrypting the database in production.
2. **Minimum Permissions**: The PAT only needs **Work Items (Read)** scope.
3. **Token Expiration**: Remember to update the PAT when it expires.

## Troubleshooting

### "Connection failed" error
- Verify organization and project names are correct
- Ensure the PAT has not expired
- Check that the PAT has **Work Items (Read)** permission
- Verify network connectivity to Azure DevOps

### "No work items found"
- When using "assigned to me": Ensure you have open work items assigned in Azure DevOps
- When using specific IDs: Verify the work item IDs exist and are accessible

### Items not importing
- Check if the items were already imported (look for the "ADO" badge)
- Verify the work items exist in the specified project
- Ensure the PAT has access to those work items

## Future Enhancements

Potential improvements for the integration:
- Bi-directional sync (update Azure DevOps from the app)
- Auto-sync on a schedule
- Import work item descriptions and additional fields
- Support for other Azure DevOps item types
- OAuth authentication instead of PAT
