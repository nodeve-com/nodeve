#!/usr/bin/env node
import { docTokens } from '../checks/doc-tokens.js';
import { runBin } from '../lib/runner.js';

await runBin(docTokens);
