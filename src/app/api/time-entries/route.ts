import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { task_id, date, hours } = body;

    if (!task_id || !date) {
      return NextResponse.json(
        { error: 'Task ID and date are required' },
        { status: 400 }
      );
    }

    const hoursValue = parseFloat(hours) || 0;

    if (hoursValue === 0) {
      // Delete the entry if hours is 0
      db.prepare(
        'DELETE FROM time_entries WHERE task_id = ? AND date = ?'
      ).run(task_id, date);
    } else {
      // Insert or update the time entry
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
    const searchParams = request.nextUrl.searchParams;
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json(
        { error: 'taskId is required' },
        { status: 400 }
      );
    }

    const entries = db.prepare(
      'SELECT date, hours FROM time_entries WHERE task_id = ? ORDER BY date DESC'
    ).all(taskId);

    return NextResponse.json(entries);
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch time entries' },
      { status: 500 }
    );
  }
}
