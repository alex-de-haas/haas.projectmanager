import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import type { Settings } from '@/types';

interface LMStudioSettings {
  endpoint: string;
  model: string;
}

interface LMStudioModel {
  id: string;
  object: string;
  owned_by: string;
}

interface LMStudioModelsResponse {
  data: LMStudioModel[];
}

async function getLMStudioSettings(): Promise<LMStudioSettings | null> {
  try {
    const setting = db.prepare('SELECT * FROM settings WHERE key = ?').get('lm_studio') as Settings | undefined;
    if (!setting) return null;
    return JSON.parse(setting.value) as LMStudioSettings;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { endpoint } = body;

    // Use provided endpoint or get from settings
    const targetEndpoint = endpoint || (await getLMStudioSettings())?.endpoint;

    if (!targetEndpoint) {
      return NextResponse.json(
        { error: 'LM Studio endpoint is required' },
        { status: 400 }
      );
    }

    // Test connection by fetching models
    const response = await fetch(`${targetEndpoint}/v1/models`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `LM Studio returned ${response.status}: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json() as LMStudioModelsResponse;
    const models = data.data?.map((m) => m.id) || [];

    return NextResponse.json({
      success: true,
      models,
      message: models.length > 0 
        ? `Connection successful! Available models: ${models.join(', ')}`
        : 'Connection successful! No models loaded.',
    });
  } catch (error) {
    console.error('LM Studio test error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error 
          ? `Connection failed: ${error.message}` 
          : 'Failed to connect to LM Studio. Make sure it is running.',
      },
      { status: 500 }
    );
  }
}
