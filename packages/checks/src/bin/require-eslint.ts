#!/usr/bin/env node
import { requireEslint } from '../checks/require-eslint.js';
import { runBin } from '../lib/runner.js';

await runBin(requireEslint);
