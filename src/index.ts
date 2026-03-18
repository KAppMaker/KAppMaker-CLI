#!/usr/bin/env node

import { createCli } from './cli.js';

process.on('SIGINT', () => {
  console.log('\n');
  process.exit(130);
});

const program = createCli();

program.parseAsync(process.argv).catch((error) => {
  console.error(error);
  process.exit(1);
});
