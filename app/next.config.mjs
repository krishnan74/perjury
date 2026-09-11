/** @type {import('next').NextConfig} */
export default {
  // Chain and Graph credentials are read in server components only; nothing
  // here should ever reach the client bundle.
  env: {},

  // The repo root, not app/, holds three things the server reads at runtime:
  // the evidence archive, the gateway index, and the pinned deployment list.
  // They are opened by a path built at runtime, so Next's tracing cannot see
  // them and a deployment would ship without them — the evidence route would
  // 404 every claim and the replay would render a claim with no agent reads.
  // Listing them here is what puts them in the bundle.
  outputFileTracingRoot: new URL("..", import.meta.url).pathname,
  outputFileTracingIncludes: {
    "/api/evidence/[claimId]": ["../evidence-archive/**/gateway-index.json"],
    "/replay": ["../evidence-archive/**/*.json", "../cre/tribunal/config.staging.json"],
    "/submit": ["../packages/shared/src/pinned-deployments.json"],
    "/api/run": ["../packages/shared/src/pinned-deployments.json"],
  },
};
