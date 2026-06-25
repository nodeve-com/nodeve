#!/usr/bin/env node
import { pageSize } from '../checks/page-size.js';
import { runBin } from '../lib/runner.js';

await runBin(pageSize);
