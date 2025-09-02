// Start a LocalTunnel to expose http://127.0.0.1:8000 and write the public URL to run_dir/py_yf_url.txt
const fs = require('fs');

async function main() {
  const localtunnel = await import('localtunnel');
  const subdomain = `fincast-${Math.random().toString(36).slice(2, 8)}`;
  const tunnel = await localtunnel.default({ port: 8000, local_host: '127.0.0.1', subdomain });

  const publicUrl = `${tunnel.url}/yf`;
  console.log(`PY_YF_URL: ${publicUrl}`);

  fs.mkdirSync('run_dir', { recursive: true });
  fs.writeFileSync('run_dir/py_yf_url.txt', publicUrl);

  tunnel.on('close', () => {
    // Tunnel closed
  });
}

main().catch((err) => {
  console.error('Failed to start tunnel:', err);
  process.exit(1);
});


