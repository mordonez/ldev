let input = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});

process.stdin.on('end', () => {
  const packJson = input.match(/\[\s*\{[\s\S]*\}\s*\]\s*$/)?.[0];

  if (!packJson) {
    console.error('Could not find npm pack JSON output in stdout.');
    process.exit(1);
  }

  let parsed;

  try {
    parsed = JSON.parse(packJson);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  const filename = parsed.at(-1)?.filename;

  if (!filename) {
    console.error('Could not resolve package filename from npm pack JSON output.');
    process.exit(1);
  }

  process.stdout.write(`${filename}\n`);
});
