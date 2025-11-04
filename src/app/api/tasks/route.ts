import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import type { Task, TimeEntry, TaskWithTimeEntries, Blocker } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const month = searchParams.get('month'); // Format: YYYY-MM

    if (!month) {
      return NextResponse.json({ error: 'Month parameter is required' }, { status: 400 });
    }

    const [year, monthNum] = month.split('-');
    const startDate = `${year}-${monthNum}-01`;
    const endDate = `${year}-${monthNum}-31`;

    // Fetch all tasks ordered by display_order, with fallback to created_at
    const tasks = db.prepare('SELECT * FROM tasks ORDER BY COALESCE(display_order, 999999), created_at ASC').all() as Task[];

    // Fetch time entries for the specified month
    const timeEntries = db.prepare(
      'SELECT * FROM time_entries WHERE date >= ? AND date <= ?'
    ).all(startDate, endDate) as TimeEntry[];

    // Fetch all active blockers
    const blockers = db.prepare(
      'SELECT * FROM blockers WHERE is_resolved = 0 ORDER BY task_id, created_at DESC'
    ).all() as Blocker[];

    // Combine tasks with their time entries and blockers
    const tasksWithEntries: TaskWithTimeEntries[] = tasks.map(task => {
      const entries: Record<string, number> = {};
      
      timeEntries
        .filter(entry => entry.task_id === task.id)
        .forEach(entry => {
          entries[entry.date] = entry.hours;
        });

      const taskBlockers = blockers.filter(b => b.task_id === task.id);

      return {
        ...task,
        timeEntries: entries,
        blockers: taskBlockers,
      };
    });

    return NextResponse.json(tasksWithEntries);
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, type } = body;

    if (!title || !type) {
      return NextResponse.json(
        { error: 'Title and type are required' },
        { status: 400 }
      );
    }

    if (type !== 'task' && type !== 'bug') {
      return NextResponse.json(
        { error: 'Type must be either "task" or "bug"' },
        { status: 400 }
      );
    }

    // Get the current max display_order and add 1 for the new task
    const maxOrder = db.prepare('SELECT MAX(display_order) as max_order FROM tasks').get() as { max_order: number | null };
    const newOrder = (maxOrder.max_order ?? -1) + 1;

    const result = db.prepare(
      'INSERT INTO tasks (title, type, display_order) VALUES (?, ?, ?)'
    ).run(title, type, newOrder);

    return NextResponse.json(
      { message: 'Task created successfully', id: result.lastInsertRowid },
      { status: 201 }
    );
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to create task' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, title, type } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Task ID is required' },
        { status: 400 }
      );
    }

    // Handle status update
    if (status !== undefined) {
      const result = db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, id);

      if (result.changes === 0) {
        return NextResponse.json(
          { error: 'Task not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { message: 'Task updated successfully' },
        { status: 200 }
      );
    }

    // Handle title and type update
    if (title !== undefined || type !== undefined) {
      const updates: string[] = [];
      const values: any[] = [];

      if (title !== undefined) {
        updates.push('title = ?');
        values.push(title);
      }

      if (type !== undefined) {
        if (type !== 'task' && type !== 'bug') {
          return NextResponse.json(
            { error: 'Type must be either "task" or "bug"' },
            { status: 400 }
          );
        }
        updates.push('type = ?');
        values.push(type);
      }

      values.push(id);

      const result = db.prepare(
        `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`
      ).run(...values);

      if (result.changes === 0) {
        return NextResponse.json(
          { error: 'Task not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { message: 'Task updated successfully' },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { error: 'No valid update fields provided' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to update task' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const taskId = searchParams.get('id');

    if (!taskId) {
      return NextResponse.json(
        { error: 'Task ID is required' },
        { status: 400 }
      );
    }

    // Delete associated time entries first (cascade delete)
    db.prepare('DELETE FROM time_entries WHERE task_id = ?').run(taskId);
    
    // Delete the task
    const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);

    if (result.changes === 0) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { message: 'Task deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to delete task' },
      { status: 500 }
    );
  }
}
