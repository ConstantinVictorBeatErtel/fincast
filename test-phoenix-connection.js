/**
 * Debug script to test Phoenix connectivity
 * Run: node test-phoenix-connection.js
 */

async function testPhoenixConnection() {
  console.log('🔍 Testing Phoenix Connection...\n');

  const phoenixUrl = process.env.PHOENIX_COLLECTOR_ENDPOINT || 'http://localhost:6006/v1/traces';
  const phoenixHealthUrl = 'http://localhost:6006/healthz';

  // Test 1: Check if Phoenix server is running
  console.log('Test 1: Checking Phoenix server health...');
  try {
    const response = await fetch(phoenixHealthUrl);
    const data = await response.json();
    console.log('✅ Phoenix server is running:', data);
  } catch (error) {
    console.log('❌ Phoenix server not reachable:', error.message);
    console.log('   Make sure Phoenix is running: python -m phoenix.server.main serve');
    return;
  }

  // Test 2: Check environment variables
  console.log('\nTest 2: Checking environment variables...');
  console.log('PHOENIX_ENABLED:', process.env.PHOENIX_ENABLED || 'not set');
  console.log('PHOENIX_COLLECTOR_ENDPOINT:', process.env.PHOENIX_COLLECTOR_ENDPOINT || 'not set');
  console.log('NEXT_PUBLIC_PHOENIX_URL:', process.env.NEXT_PUBLIC_PHOENIX_URL || 'not set');

  if (process.env.PHOENIX_ENABLED === 'false') {
    console.log('❌ Phoenix is disabled! Set PHOENIX_ENABLED="true" in .env');
    return;
  }

  console.log('✅ Environment variables look good');

  // Test 3: Try to send a test trace
  console.log('\nTest 3: Attempting to send test trace to Phoenix...');
  console.log('Endpoint:', phoenixUrl);

  try {
    const testTrace = {
      resourceSpans: [{
        resource: {
          attributes: [{
            key: 'service.name',
            value: { stringValue: 'fincast-test' }
          }]
        },
        scopeSpans: [{
          scope: {
            name: 'test-tracer'
          },
          spans: [{
            traceId: Buffer.from('12345678901234567890123456789012', 'hex').toString('base64'),
            spanId: Buffer.from('1234567890123456', 'hex').toString('base64'),
            name: 'test-span',
            kind: 1,
            startTimeUnixNano: Date.now() * 1000000,
            endTimeUnixNano: Date.now() * 1000000 + 1000000,
            attributes: [{
              key: 'test',
              value: { stringValue: 'Phoenix connection test' }
            }]
          }]
        }]
      }]
    };

    const response = await fetch(phoenixUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testTrace)
    });

    if (response.ok) {
      console.log('✅ Test trace sent successfully!');
      console.log('   Check Phoenix UI at http://localhost:6006');
    } else {
      console.log('❌ Failed to send trace:', response.status, response.statusText);
      const text = await response.text();
      console.log('   Response:', text);
    }
  } catch (error) {
    console.log('❌ Error sending trace:', error.message);
  }

  console.log('\n🏁 Test complete!');
  console.log('\nNext steps:');
  console.log('1. Make sure all tests pass ✅');
  console.log('2. Restart your Next.js app: npm run dev');
  console.log('3. Make a valuation request');
  console.log('4. Check Phoenix UI: http://localhost:6006');
}

testPhoenixConnection();
