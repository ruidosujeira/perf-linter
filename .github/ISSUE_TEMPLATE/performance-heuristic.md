---
name: "Feature request: performance heuristic"
about: "Pitch a new rule or heuristic focused on performance regressions (loops, GC churn, unstable deps, etc.)"
title: "[Perf Heuristic] "
labels: [enhancement, perf-heuristic]
assignees: []
---

## Pain point
Describe the slowdown, GC pressure, or instability you want to eliminate. Include code snippets, metrics, or traces that highlight the issue.

## Proposed heuristic
Outline the lint signal, including when it should fire and the message developers should see. Mention whether it targets React, Node services, build tooling, etc.

## False-positive guardrails
List scenarios that must *not* trigger the rule. Reference existing utilities (e.g., analyzer stats, call graph checks) if they help avoid noise.

## Validation plan
How can we prove the heuristic works? Add sample files, benchmarks, or test cases that should accompany the implementation.

## References
Link to articles, production incidents, or prior art that inspired this request.
