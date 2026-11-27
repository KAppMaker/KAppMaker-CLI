import type { ToolDef } from '../define.js';
import { healthTools } from './health.js';
import { projectTools } from './project.js';
import { storeTools } from './stores.js';
import { monetizationTools } from './monetization.js';
import { assetTools } from './assets.js';
import { shipTools } from './ship.js';
import { armySetupTools } from './army-setup.js';
import { armyOpsTools } from './army-ops.js';

/** Every tool `kappmaker mcp` exposes, in the order agents see them. */
export const allTools: ToolDef[] = [
  ...healthTools,
  ...projectTools,
  ...assetTools,
  ...storeTools,
  ...monetizationTools,
  ...shipTools,
  ...armySetupTools,
  ...armyOpsTools,
];
