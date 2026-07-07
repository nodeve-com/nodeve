#!/usr/bin/env node
import { pluralArrays } from '../checks/plural-arrays.js';
import { runBin } from '../lib/runner.js';

await runBin(pluralArrays);
