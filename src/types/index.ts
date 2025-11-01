export type TaskType = 'task' | 'bug';

export interface Task {
  id: number;
  title: string;
  type: TaskType;
  external_id?: string | null;
  external_source?: string | null;
  created_at: Date;
}

export interface TimeEntry {
  id: number;
  task_id: number;
  date: string; // YYYY-MM-DD format
  hours: number;
  created_at: Date;
}

export interface TaskWithTimeEntries extends Task {
  timeEntries: Record<string, number>; // date -> hours
}

export interface Settings {
  id: number;
  key: string;
  value: string;
  created_at: Date;
  updated_at: Date;
}

export interface AzureDevOpsSettings {
  organization: string;
  project: string;
  pat: string;
}

export interface AzureDevOpsWorkItem {
  id: number;
  title: string;
  type: string;
  state: string;
}

export interface DayOff {
  id: number;
  date: string; // YYYY-MM-DD format
  description?: string | null;
  created_at: Date;
}
