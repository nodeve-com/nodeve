#!/usr/bin/env node
import { reshape } from '../checks/reshape.js';
import { runBin } from '../lib/runner.js';

await runBin(reshape);
