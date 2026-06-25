#!/usr/bin/env node
import { inlineDupes } from '../checks/inline-dupes.js';
import { runBin } from '../lib/runner.js';

await runBin(inlineDupes);
