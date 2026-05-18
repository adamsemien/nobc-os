/** Metric Registry entrypoint.
 *  Importing this module registers every metric as a side effect. Any consumer
 *  (dashboard page, MCP route, insight generator) imports from here. */

import './metrics/pipeline/application-funnel';
import './metrics/pipeline/charter-conversion';
import './metrics/community/archetype-distribution';
import './metrics/engagement/dormancy-cohort';
import './metrics/taste/top-advocated-brands';
import './metrics/sponsors/sponsor-fit-score';

export * from './types';
export * from './registry';
export * from './filters';
