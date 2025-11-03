import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import type { Task, TimeEntry, TaskWithTimeEntries } from '@/types';

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

    // Fetch all tasks
    const tasks = db.prepare('SELECT * FROM tasks ORDER BY created_at ASC').all() as Task[];

    // Fetch time entries for the specified month
    const timeEntries = db.prepare(
      'SELECT * FROM time_entries WHERE date >= ? AND date <= ?'
    ).all(startDate, endDate) as TimeEntry[];

    // Combine tasks with their time entries
    const tasksWithEntries: TaskWithTimeEntries[] = tasks.map(task => {
      const entries: Record<string, number> = {};
      
      timeEntries
        .filter(entry => entry.task_id === task.id)
        .forEach(entry => {
          entries[entry.date] = entry.hours;
        });

      return {
        ...task,
        timeEntries: entries,
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

    const result = db.prepare(
      'INSERT INTO tasks (title, type) VALUES (?, ?)'
    ).run(title, type);

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
    const { id, status } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Task ID is required' },
        { status: 400 }
      );
    }

    if (!status) {
      return NextResponse.json(
        { error: 'Status is required' },
        { status: 400 }
      );
    }

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
