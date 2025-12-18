import { NextResponse } from 'next/server';
import { generateStandardForecast } from '../../../services/gemini-forecast';

export async function POST(request) {
    try {
        const body = await request.json();
        const { ticker, companyName } = body;

        // Validate inputs
        if (!ticker) {
            return NextResponse.json(
                { error: 'Missing required fields: ticker' },
                { status: 400 }
            );
        }

        // Default company name if missing
        const name = companyName || ticker;

        console.log(`[API/Forecast] Request for ${ticker}`);

        // Generate forecast
        const result = await generateStandardForecast(ticker, name);

        // Check if generation failed
        if (!result.forecast) {
            return NextResponse.json(
                {
                    error: 'Forecast generation failed',
                    details: result.metadata?.error
                },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            forecast: result.forecast,
            metadata: result.metadata
        });

    } catch (error) {
        console.error('[API/Forecast] Internal error:', error);

        return NextResponse.json(
            {
                error: 'Internal server error',
                message: error.message
            },
            { status: 500 }
        );
    }
}
