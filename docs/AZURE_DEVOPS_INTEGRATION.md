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

### 3. Refresh/Update Imported Tasks
- Click the **🔄 Refresh** button to update all previously imported tasks
- Automatically syncs title, type, and status changes from Azure DevOps
- Shows how many tasks were updated
- Only updates tasks that have changed

### 4. Change Task Status
- Use the status dropdown for each task to change its status
- Available statuses: New, Active, Resolved, Closed
- For tasks linked to Azure DevOps (with 🔄 Synced badge):
  - Status changes are automatically synced with Azure DevOps
  - Updates both local database and remote work item
  - Shows confirmation when sync is successful
- For local tasks (without Azure DevOps link):
  - Status changes are saved only locally
  - No remote synchronization occurs

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
- `status`: Stores the work item status from Azure DevOps (e.g., "New", "Active", "Resolved", "Closed")

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

#### `/api/azure-devops/refresh`
- `POST`: Update all previously imported work items with latest data from Azure DevOps
- Automatically finds all tasks with `external_source = "azure_devops"`
- Updates title, type, and status for tasks that have changed
- Returns count of updated and skipped tasks

#### `/api/azure-devops/update-status`
- `POST`: Update task status and sync with Azure DevOps
- Body: `{ "taskId": number, "status": string }`
- Updates local database status
- If task is linked to Azure DevOps, also updates the remote work item
- Returns sync status and any error messages
- Falls back to local-only update if Azure DevOps sync fails

#### `/api/tasks` (PATCH)
- `PATCH`: Update task status locally (no Azure DevOps sync)
- Body: `{ "id": number, "status": string }`
- Updates only the local database
- Used for tasks not linked to Azure DevOps

### Work Item Type Mapping

Azure DevOps work item types are mapped to the app's task types:
- **Bug** → `bug`
- All others (Task, User Story, Feature, etc.) → `task`

### Status Import

The work item status is automatically imported from Azure DevOps and stored in the `status` field. Common status values include:
- **New**: Work item has been created but not yet started
- **Active**: Work is in progress
- **Resolved**: Work is complete and awaiting verification
- **Closed**: Work item is finished and verified
- Custom statuses defined in your Azure DevOps process template

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

## Status Change Requirements

### Azure DevOps Permissions

To change work item status, your Personal Access Token (PAT) needs:
- **Work Items (Read & Write)** permission

If your PAT only has Read permission, status changes will:
- Update successfully in the local database
- Show an error message for Azure DevOps sync
- Not affect the remote work item

To update your PAT permissions:
1. Go to Azure DevOps → User settings → Personal access tokens
2. Edit your existing token or create a new one
3. Enable **Work Items (Read & Write)** scope
4. Update the PAT in the app settings

### Custom Work Item States

The app provides four common statuses (New, Active, Resolved, Closed), but Azure DevOps work items may use custom process templates with different state names. If you try to set a status that doesn't exist in Azure DevOps:
- The local database will update successfully
- Azure DevOps sync will fail with an error
- An error message will be displayed

**Solution**: Modify the status dropdown in the code to match your Azure DevOps process template states.

## Future Enhancements

Potential improvements for the integration:
- Dynamic status loading from Azure DevOps process template
- Auto-sync on a schedule
- Import work item descriptions and additional fields
- Support for other Azure DevOps item types
- OAuth authentication instead of PAT
