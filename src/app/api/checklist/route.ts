import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import type { ChecklistItem } from '@/types';
import { getRequestProjectId, getRequestUserId } from '@/lib/user-context';

export async function GET(request: NextRequest) {
  try {
    const userId = getRequestUserId(request);
    const projectId = getRequestProjectId(request, userId);
    const searchParams = request.nextUrl.searchParams;
    const taskId = searchParams.get('taskId');

    if (taskId) {
      // Get checklist items for a specific task
      const items = db.prepare(
        'SELECT * FROM checklist_items WHERE task_id = ? AND user_id = ? AND project_id = ? ORDER BY display_order ASC, created_at ASC'
      ).all(taskId, userId, projectId) as ChecklistItem[];

      return NextResponse.json(items);
    } else {
      // Get all checklist items
      const items = db.prepare(
        'SELECT * FROM checklist_items WHERE user_id = ? AND project_id = ? ORDER BY task_id, display_order ASC'
      ).all(userId, projectId) as ChecklistItem[];

      return NextResponse.json(items);
    }
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch checklist items' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = getRequestUserId(request);
    const projectId = getRequestProjectId(request, userId);
    const body = await request.json();
    const { task_id, title } = body;

    if (!task_id || !title) {
      return NextResponse.json(
        { error: 'Task ID and title are required' },
        { status: 400 }
      );
    }

    const task = db
      .prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ? AND project_id = ?')
      .get(task_id, userId, projectId) as { id: number } | undefined;
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Get the current max display_order for this task
    const maxOrder = db.prepare(
      'SELECT MAX(display_order) as max_order FROM checklist_items WHERE task_id = ? AND user_id = ? AND project_id = ?'
    ).get(task_id, userId, projectId) as { max_order: number | null };
    const newOrder = (maxOrder.max_order ?? -1) + 1;

    const result = db.prepare(
      'INSERT INTO checklist_items (user_id, project_id, task_id, title, display_order) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, projectId, task_id, title, newOrder);

    return NextResponse.json(
      { message: 'Checklist item created successfully', id: result.lastInsertRowid },
      { status: 201 }
    );
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to create checklist item' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = getRequestUserId(request);
    const projectId = getRequestProjectId(request, userId);
    const body = await request.json();
    const { id, title, is_completed, display_order } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Checklist item ID is required' },
        { status: 400 }
      );
    }

    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }

    if (is_completed !== undefined) {
      updates.push('is_completed = ?');
      values.push(is_completed);
      
      // Update completed_at based on is_completed status
      if (is_completed) {
        updates.push('completed_at = CURRENT_TIMESTAMP');
      } else {
        updates.push('completed_at = NULL');
      }
    }

    if (display_order !== undefined) {
      updates.push('display_order = ?');
      values.push(display_order);
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    values.push(id);
    values.push(userId);
    values.push(projectId);

    const result = db.prepare(
      `UPDATE checklist_items SET ${updates.join(', ')} WHERE id = ? AND user_id = ? AND project_id = ?`
    ).run(...values);

    if (result.changes === 0) {
      return NextResponse.json(
        { error: 'Checklist item not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { message: 'Checklist item updated successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to update checklist item' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = getRequestUserId(request);
    const projectId = getRequestProjectId(request, userId);
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Checklist item ID is required' },
        { status: 400 }
      );
    }

    const result = db.prepare('DELETE FROM checklist_items WHERE id = ? AND user_id = ? AND project_id = ?').run(id, userId, projectId);

    if (result.changes === 0) {
      return NextResponse.json(
        { error: 'Checklist item not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { message: 'Checklist item deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to delete checklist item' },
      { status: 500 }
    );
  }
}
