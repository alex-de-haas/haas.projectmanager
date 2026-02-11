# Time Tracker App

A Next.js application for tracking time spent on tasks and bugs with a monthly timeline grid view.

## Features

- 📊 Monthly timeline grid view (tasks as rows, days as columns)
- ✅ Track time for Tasks and Bugs
- 🕐 Click-to-edit time entries
- 📅 Navigate between months
- 💾 SQLite database for data persistence (zero configuration!)
- 📈 Daily and task totals
- 🎨 Clean, responsive UI with visual indicators
- 🚀 No external database installation required
- 🔗 **Azure DevOps Integration** - Import tasks and bugs directly from Azure DevOps using Personal Access Token (PAT)
- 🔄 **Status Synchronization** - Change task status with automatic bi-directional sync to Azure DevOps

## Prerequisites

- Node.js 18+

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Run Development Server

```bash
npm run dev
```

That's it! The SQLite database will be automatically created with sample data on first run.

### 3. Open in Browser

Open [http://localhost:3000](http://localhost:3000) in your browser.

The database file (`data/time_tracker.db`) will be created automatically on first run.

### 4. Sign In

The app uses email/password authentication.

- On a brand-new database (no users), the `/login` page shows a first-time setup form.
- Create the first user account there, then you will be signed in automatically.

You will be redirected to `/login` before accessing application pages.

## Usage

### Adding Tasks

#### Manual Entry
1. Click the "Add Task" button
2. Enter task title and select type (Task or Bug)
3. Click "Create Task"

#### Import from Azure DevOps
1. Click the "⚙️ Settings" button and configure your Azure DevOps credentials
2. Click the "Import from Azure DevOps" button
3. Choose to import items assigned to you or specific work item IDs
4. Imported items will show an "ADO" badge

For detailed Azure DevOps integration setup, see [AZURE_DEVOPS_INTEGRATION.md](./AZURE_DEVOPS_INTEGRATION.md)

### Changing Task Status

1. Use the status dropdown next to each task
2. Select a status: New, Active, Resolved, or Closed
3. For Azure DevOps-linked tasks (with 🔄 Synced badge):
   - Status changes sync automatically with Azure DevOps
   - You'll see a confirmation message when sync is successful
4. For local tasks:
   - Status changes are saved only locally

**Note**: Azure DevOps sync requires **Work Items (Read & Write)** permission on your PAT. See [AZURE_DEVOPS_INTEGRATION.md](./AZURE_DEVOPS_INTEGRATION.md) for details.

### Tracking Time

1. Click any cell in the timeline grid
2. Enter hours spent (e.g., 2.5 for 2 hours 30 minutes)
3. Press Enter or click outside to save

### Navigation

- Use "Previous Month" and "Next Month" buttons to navigate
- View totals for each task (rightmost column)
- View daily totals (bottom row)

## Database Schema

### Tasks Table
- `id` - Auto-increment primary key
- `title` - Task title
- `type` - Either 'task' or 'bug'
- `created_at` - Timestamp

### Time Entries Table
- `id` - Auto-increment primary key
- `task_id` - Foreign key to tasks
- `date` - Date of time entry (YYYY-MM-DD)
- `hours` - Hours spent (decimal)
- `created_at` - Timestamp

### Database Features
- ✅ **Auto-initialization**: Database creates itself on first run
- ✅ **Sample data included**: Pre-loaded with example tasks and time entries
- ✅ **Single file**: All data stored in `data/time_tracker.db`
- ✅ **Portable**: Just copy the .db file to backup or move your data

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Database**: SQLite with better-sqlite3
- **Date Handling**: date-fns
- **Styling**: Custom CSS

## API Endpoints

### GET /api/tasks?month=YYYY-MM
Fetch all tasks with time entries for a specific month

### POST /api/tasks
Create a new task
```json
{
  "title": "Task title",
  "type": "task" | "bug"
}
```

### POST /api/time-entries
Create or update a time entry
```json
{
  "task_id": 1,
  "date": "2025-11-01",
  "hours": 3.5
}
```

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

## 💡 Why SQLite?

- **Zero Configuration**: No database server to install or configure
- **Portable**: Single file contains all your data
- **Fast**: Excellent performance for single-user and small team use
- **Reliable**: Used by millions of applications worldwide
- **Simple Backups**: Just copy the .db file
- **Perfect for**: Development, small teams, personal projects, embedded apps

## 📦 Database File Location

Your data is stored in: `/Users/haas/Sources/Haas.ProjectManager/data/time_tracker.db`

You can:
- View it with [DB Browser for SQLite](https://sqlitebrowser.org/)
- Back it up by copying the file
- Share it with team members
- Version control it (for small teams)

## 🔍 Troubleshooting

### Database errors
- The database file (`data/time_tracker.db`) will be created automatically
- If you see errors, try deleting `data/time_tracker.db` and restarting the server
- Check that you have write permissions in the project directory

### "Module not found" errors
- Delete `node_modules` and `package-lock.json`
- Run `npm install` again

### Port 3000 already in use
- Next.js will automatically try port 3001, 3002, etc.
- Or manually specify a port: `npm run dev -- -p 3001`
- Or kill existing process: `lsof -ti:3000 | xargs kill`

### Database backup and restore
- **In app (recommended)**: Open Settings -> General -> Database Backups
- **Create backup**: Creates timestamped `.db` files in `data/backups/`
- **Restore backup**: Select a backup file and restore data from it
- **API list/create backups**: `GET/POST /api/database/backups`
- **API restore backup**: `POST /api/database/restore`
- **Reset**: Delete `data/time_tracker.db` and restart the server for fresh sample data

## License

MIT
### User Invitations

When creating a user, you must provide an email address. The app generates a one-time invitation link. Share that link with the user so they can set their own password.

- Invitation links expire after 7 days
- Accepting the link activates the account and signs the user in
- To force a public domain in generated links, set `APP_BASE_URL` (example: `https://pm.example.com`)
