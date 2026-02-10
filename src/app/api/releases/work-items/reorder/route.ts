import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getRequestUserId } from '@/lib/user-context';

export async function PATCH(request: NextRequest) {
  try {
    const userId = getRequestUserId(request);
    const body = await request.json();
    const { workItemOrders } = body;

    if (!workItemOrders || !Array.isArray(workItemOrders)) {
      return NextResponse.json(
        { error: 'workItemOrders array is required' },
        { status: 400 }
      );
    }

    // Update display_order for each work item in a transaction
    const updateStmt = db.prepare('UPDATE release_work_items SET display_order = ? WHERE id = ? AND user_id = ?');
    
    const transaction = db.transaction((orders: Array<{ id: number; order: number }>) => {
      for (const { id, order } of orders) {
        updateStmt.run(order, id, userId);
      }
    });

    transaction(workItemOrders);

    return NextResponse.json(
      { message: 'Work item order updated successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to reorder work items' },
      { status: 500 }
    );
  }
}
