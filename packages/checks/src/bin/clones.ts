#!/usr/bin/env node
import { clones } from '../checks/clones.js';
import { runBin } from '../lib/runner.js';

await runBin(clones);
