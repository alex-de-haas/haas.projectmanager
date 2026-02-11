export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getRequestProjectId, getRequestUserId } from '@/lib/user-context';

export async function POST(request: NextRequest) {
  try {
    const userId = getRequestUserId(request);
    const projectId = getRequestProjectId(request, userId);
    const body = await request.json();
    const { task_id, date, hours } = body;

    if (!task_id || !date) {
      return NextResponse.json(
        { error: 'Task ID and date are required' },
        { status: 400 }
      );
    }

    const hoursValue = parseFloat(hours) || 0;

    if (hoursValue < 0) {
      return NextResponse.json(
        { error: 'Hours cannot be negative' },
        { status: 400 }
      );
    }

    if (hoursValue === 0) {
      // Delete the entry if hours is 0
      db.prepare(
        `DELETE FROM time_entries 
         WHERE task_id = ? AND date = ?
           AND task_id IN (SELECT id FROM tasks WHERE id = ? AND user_id = ? AND project_id = ?)`
      ).run(task_id, date, task_id, userId, projectId);
    } else {
      // Insert or update the time entry
      const task = db
        .prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ? AND project_id = ?')
        .get(task_id, userId, projectId) as { id: number } | undefined;
      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }

      db.prepare(
        `INSERT INTO time_entries (task_id, date, hours) 
         VALUES (?, ?, ?) 
         ON CONFLICT(task_id, date) DO UPDATE SET hours = excluded.hours`
      ).run(task_id, date, hoursValue);
    }

    return NextResponse.json(
      { message: 'Time entry saved successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to save time entry' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = getRequestUserId(request);
    const projectId = getRequestProjectId(request, userId);
    const searchParams = request.nextUrl.searchParams;
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json(
        { error: 'taskId is required' },
        { status: 400 }
      );
    }

    const entries = db.prepare(
      `SELECT te.date, te.hours
       FROM time_entries te
       INNER JOIN tasks t ON t.id = te.task_id
       WHERE te.task_id = ? AND t.user_id = ? AND t.project_id = ?
       ORDER BY te.date DESC`
    ).all(taskId, userId, projectId);

    return NextResponse.json(entries);
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch time entries' },
      { status: 500 }
    );
  }
}
