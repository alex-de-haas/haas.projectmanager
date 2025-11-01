import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import type { Settings, AzureDevOpsSettings } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const key = searchParams.get('key');

    if (key) {
      const setting = db.prepare('SELECT * FROM settings WHERE key = ?').get(key) as Settings | undefined;
      
      if (!setting) {
        return NextResponse.json({ error: 'Setting not found' }, { status: 404 });
      }

      // Parse JSON value if it's Azure DevOps settings
      if (key === 'azure_devops') {
        try {
          const value = JSON.parse(setting.value) as AzureDevOpsSettings;
          return NextResponse.json({ ...setting, value });
        } catch {
          return NextResponse.json(setting);
        }
      }

      return NextResponse.json(setting);
    }

    // Return all settings
    const settings = db.prepare('SELECT * FROM settings ORDER BY key').all() as Settings[];
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, value } = body;

    if (!key || value === undefined) {
      return NextResponse.json(
        { error: 'Key and value are required' },
        { status: 400 }
      );
    }

    // Stringify value if it's an object
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

    // Upsert setting
    const stmt = db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(key, stringValue);

    const setting = db.prepare('SELECT * FROM settings WHERE key = ?').get(key) as Settings;

    return NextResponse.json(setting);
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to save setting' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json(
        { error: 'Key is required' },
        { status: 400 }
      );
    }

    const stmt = db.prepare('DELETE FROM settings WHERE key = ?');
    const result = stmt.run(key);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Setting not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to delete setting' },
      { status: 500 }
    );
  }
}
