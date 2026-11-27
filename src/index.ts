#!/usr/bin/env node

// Checked before anything else is imported: commander/execa/ora/chalk require
// Node 22.12+, and on an older Node they fail with an import error that does
// not say the fix is "upgrade Node". cli.js is therefore loaded dynamically.
const MIN_NODE = [22, 12] as const;
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < MIN_NODE[0] || (major === MIN_NODE[0] && minor < MIN_NODE[1])) {
  console.error(
    `kappmaker needs Node.js ${MIN_NODE.join('.')} or newer (found ${process.versions.node}).\n` +
      '  macOS:  brew install node@22   (or nvm install 22)\n' +
      '  Linux:  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs',
  );
  process.exit(1);
}

process.on('SIGINT', () => {
  console.log('\n');
  process.exit(130);
});

const { createCli } = await import('./cli.js');
const program = createCli();

program.parseAsync(process.argv).catch((error) => {
  // A prompt nobody can answer (KAPPMAKER_NONINTERACTIVE=1): one plain line, no stack.
  if (error instanceof Error && error.name === 'NeedsAnswerError') {
    console.error(error.message);
    process.exit(2);
  }
  console.error(error);
  process.exit(1);
});
