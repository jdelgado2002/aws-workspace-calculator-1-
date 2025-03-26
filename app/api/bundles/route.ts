import { NextResponse } from 'next/server';
import sampleData from '@/sampleBundleResponse.json';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const region = searchParams.get('region');

    if (!region) {
      return NextResponse.json(
        { error: 'Region parameter is required' },
        { status: 400 }
      );
    }

    // In a real application, this would fetch from AWS API
    // For now, return the sample data
    return NextResponse.json(sampleData);

  } catch (error) {
    console.error('Error in bundles API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
