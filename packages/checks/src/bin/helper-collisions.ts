#!/usr/bin/env node
import { helperCollisions } from '../checks/helper-collisions.js';
import { runBin } from '../lib/runner.js';

await runBin(helperCollisions);
