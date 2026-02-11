export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getRequestProjectId, getRequestUserId } from '@/lib/user-context';

export async function PATCH(request: NextRequest) {
  try {
    const userId = getRequestUserId(request);
    const projectId = getRequestProjectId(request, userId);
    const body = await request.json();
    const { taskOrders } = body;

    if (!taskOrders || !Array.isArray(taskOrders)) {
      return NextResponse.json(
        { error: 'taskOrders array is required' },
        { status: 400 }
      );
    }

    // Update display_order for each task in a transaction
    const updateStmt = db.prepare('UPDATE tasks SET display_order = ? WHERE id = ? AND user_id = ? AND project_id = ?');
    
    const transaction = db.transaction((orders: Array<{ id: number; order: number }>) => {
      for (const { id, order } of orders) {
        updateStmt.run(order, id, userId, projectId);
      }
    });

    transaction(taskOrders);

    return NextResponse.json(
      { message: 'Task order updated successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to reorder tasks' },
      { status: 500 }
    );
  }
}
