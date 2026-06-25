#!/usr/bin/env node
import { commitMsg } from '../checks/commit-msg.js';
import { runBin } from '../lib/runner.js';

await runBin(commitMsg);
