import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import type { DayOff } from '@/types';

// GET - Fetch all day-offs or filter by date range
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    let query = 'SELECT * FROM day_offs';
    const params: string[] = [];

    if (startDate && endDate) {
      query += ' WHERE date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }

    query += ' ORDER BY date ASC';

    const stmt = db.prepare(query);
    const dayOffs = params.length > 0 ? stmt.all(...params) : stmt.all();

    return NextResponse.json(dayOffs);
  } catch (error) {
    console.error('Error fetching day-offs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch day-offs' },
      { status: 500 }
    );
  }
}

// POST - Create a new day-off
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, description } = body;

    if (!date) {
      return NextResponse.json(
        { error: 'Date is required' },
        { status: 400 }
      );
    }

    // Check if day-off already exists for this date
    const existing = db.prepare('SELECT id FROM day_offs WHERE date = ?').get(date);
    if (existing) {
      return NextResponse.json(
        { error: 'Day-off already exists for this date' },
        { status: 409 }
      );
    }

    const stmt = db.prepare(
      'INSERT INTO day_offs (date, description) VALUES (?, ?)'
    );
    const result = stmt.run(date, description || null);

    const newDayOff = db
      .prepare('SELECT * FROM day_offs WHERE id = ?')
      .get(result.lastInsertRowid) as DayOff;

    return NextResponse.json(newDayOff, { status: 201 });
  } catch (error) {
    console.error('Error creating day-off:', error);
    return NextResponse.json(
      { error: 'Failed to create day-off' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a day-off
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    const date = searchParams.get('date');

    if (!id && !date) {
      return NextResponse.json(
        { error: 'Either id or date is required' },
        { status: 400 }
      );
    }

    let stmt;
    let result;

    if (id) {
      stmt = db.prepare('DELETE FROM day_offs WHERE id = ?');
      result = stmt.run(parseInt(id));
    } else {
      stmt = db.prepare('DELETE FROM day_offs WHERE date = ?');
      result = stmt.run(date);
    }

    if (result.changes === 0) {
      return NextResponse.json(
        { error: 'Day-off not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting day-off:', error);
    return NextResponse.json(
      { error: 'Failed to delete day-off' },
      { status: 500 }
    );
  }
}
