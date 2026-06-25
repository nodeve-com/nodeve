#!/usr/bin/env node
import { requireDeps } from '../checks/require-deps.js';
import { runBin } from '../lib/runner.js';

await runBin(requireDeps);
