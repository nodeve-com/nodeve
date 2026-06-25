#!/usr/bin/env node
import { fileSize } from '../checks/file-size.js';
import { runBin } from '../lib/runner.js';

await runBin(fileSize);
