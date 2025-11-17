export type TaskType = 'task' | 'bug';

export interface Task {
  id: number;
  title: string;
  type: TaskType;
  status?: string | null;
  external_id?: string | null;
  external_source?: string | null;
  created_at: Date;
  completed_at?: Date | null;
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
  blockers?: Blocker[];
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

export interface GeneralSettings {
  default_day_length: number;
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
  is_half_day: number;
  created_at: Date;
}

export type BlockerSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface Blocker {
  id: number;
  task_id: number;
  comment: string;
  severity: BlockerSeverity;
  is_resolved: number; // SQLite uses 0/1 for boolean
  created_at: Date;
  resolved_at?: Date | null;
}

export interface TaskWithBlockers extends Task {
  blockers: Blocker[];
}
