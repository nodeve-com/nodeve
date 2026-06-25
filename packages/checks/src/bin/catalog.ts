#!/usr/bin/env node
import { catalog } from '../checks/catalog.js';
import { runBin } from '../lib/runner.js';

await runBin(catalog);
