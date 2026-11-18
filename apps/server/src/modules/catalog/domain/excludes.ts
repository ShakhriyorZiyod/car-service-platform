/**
 * What choosing a zone removes (docs/PLAN.md, section 7.5): "whole body" covers the panels, so
 * they drop out of the order. Only zones of the same kind of work can exclude one another.
 */

export interface ZoneRef {
  id: string;
  serviceTypeId: string;
}

export type ExcludeProblem = 'excludes_itself' | 'unknown_zone' | 'other_service_type';

export interface ExcludeIssue {
  zoneId: string;
  problem: ExcludeProblem;
}

/** The excluded zones that are not allowed, each with why. `zones` knows every zone by id. */
export function excludeProblems(
  zone: ZoneRef,
  excludedIds: readonly string[],
  zones: ReadonlyMap<string, ZoneRef>,
): ExcludeIssue[] {
  const issues: ExcludeIssue[] = [];
  for (const excludedId of new Set(excludedIds)) {
    const excluded = zones.get(excludedId);
    if (excludedId === zone.id) issues.push({ zoneId: excludedId, problem: 'excludes_itself' });
    else if (!excluded) issues.push({ zoneId: excludedId, problem: 'unknown_zone' });
    else if (excluded.serviceTypeId !== zone.serviceTypeId) {
      issues.push({ zoneId: excludedId, problem: 'other_service_type' });
    }
  }
  return issues;
}
