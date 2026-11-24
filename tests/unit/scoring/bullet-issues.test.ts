import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { sampleResumeData } from '@/lib/resume-schema/sample';
import type { ResumeData } from '@/lib/resume-schema';
import type { ScoreBreakdown } from '@/lib/scoring/score';
import { collectHighlightEntries } from '@/lib/scoring/highlight-paths';
import {
  BULLET_ISSUE_THRESHOLDS,
  buildBulletIssues,
  firstIssueForCriterion,
  groupIssuesByPath
} from '@/lib/scoring/bullet-issues';
import { buildDynamicTips } from '@/lib/scoring/tips';
import { buildMatchBreakdown } from '@/lib/inline-issue/build-match-breakdown';

function resumeWithBullets(bullets: string[]): ResumeData {
  return {
    ...sampleResumeData,
    sections: {
      ...sampleResumeData.sections,
      work: [
        {
          company: 'Northwind',
          location: '',
          url: '',
          description: '',
          positions: [{ title: 'Engineer', startDate: '', endDate: '', highlights: bullets }]
        }
      ]
    }
  };
}

function breakdownWithBullets(
  bullets: Array<{ impact: number; opening: number }>
): ScoreBreakdown {
  return {
    overallScore: 70,
    dimensionScores: {
      atsMatching: 70,
      structure: 70,
      contentQuality: 70,
      alignment: 70,
      intentCoverage: 70,
      roleFit: 70,
      seniorityFit: 70
    },
    criteriaScores: {
      'ATS Keyword Match': 70,
      'ATS Similarity': 70,
      'Intent Coverage': 70,
      'Section Completeness': 70,
      'Optimal Length': 70,
      'Accomplishment Focus': 70,
      'Action Verb Usage': 70,
      Tailoring: 70,
      'Unique Value': 70,
      'Soft Skills': 70,
      'Role Fit': 70,
      'Seniority Fit': 70
    },
    computedInMs: 1,
    intentCoverageBreakdown: {
      value: 70,
      missed: { mustHave: [], niceToHave: [], implicit: [] },
      penalty: 0,
      fallback: true,
      eligibility: []
    },
    jevBullets: bullets
  } as ScoreBreakdown;
}

describe('buildBulletIssues', () => {
  it('returns no issues when the snapshot has no Jev bullet measurements', () => {
    const breakdown = breakdownWithBullets([]);
    delete breakdown.jevBullets;
    expect(buildBulletIssues(breakdown, resumeWithBullets(['Led a team']))).toEqual([]);
  });

  it('uses strict thresholds shared with the scorecard tips', () => {
    expect(BULLET_ISSUE_THRESHOLDS).toEqual({ impact: 1.5, opening: 1.5 });
    const resume = resumeWithBullets(['at boundary', 'below boundary']);
    const breakdown = breakdownWithBullets([
      { impact: 1.5, opening: 1.5 },
      { impact: 1.49, opening: 1.49 }
    ]);
    const issues = buildBulletIssues(breakdown, resume);

    expect(issues).toHaveLength(2);
    expect(issues.map((issue) => issue.path)).toEqual([
      'sections.work.0.positions.0.highlights.1',
      'sections.work.0.positions.0.highlights.1'
    ]);
    expect(issues.map((issue) => issue.criterion)).toEqual([
      'Accomplishment Focus',
      'Action Verb Usage'
    ]);
  });

  it('carries reason, fix, company, role and occurrence metadata', () => {
    const resume = resumeWithBullets(['worked on the thing', 'worked   on the thing']);
    const issues = buildBulletIssues(
      breakdownWithBullets([
        { impact: 0.2, opening: 2.5 },
        { impact: 0.1, opening: 0.2 }
      ]),
      resume
    );

    expect(issues).toEqual([
      expect.objectContaining({
        path: 'sections.work.0.positions.0.highlights.0',
        criterion: 'Accomplishment Focus',
        dimensionLabel: 'Impact',
        reason: 'This reads as a task, not an outcome.',
        fix: 'Say what changed because of this work, not just what you did.',
        currentText: 'worked on the thing',
        company: 'Northwind',
        role: 'Engineer',
        occurrence: 0
      }),
      expect.objectContaining({
        path: 'sections.work.0.positions.0.highlights.1',
        criterion: 'Accomplishment Focus',
        currentText: 'worked   on the thing',
        occurrence: 1
      }),
      expect.objectContaining({
        path: 'sections.work.0.positions.0.highlights.1',
        criterion: 'Action Verb Usage',
        dimensionLabel: 'Action Verb Usage',
        reason: 'This bullet opens flatly.',
        fix: 'Lead with a stronger action verb.',
        occurrence: 1
      })
    ]);
  });

  it('aligns paths with the engine’s flattened bullet list', () => {
    const resume = {
      ...sampleResumeData,
      sections: {
        ...sampleResumeData.sections,
        work: [
          {
            company: 'One',
            location: '',
            url: '',
            description: '',
            positions: [
              { title: 'A', startDate: '', endDate: '', highlights: ['first', ''] },
              { title: 'B', startDate: '', endDate: '', highlights: ['second'] }
            ]
          },
          {
            company: 'Two',
            location: '',
            url: '',
            description: '',
            positions: [{ title: 'C', startDate: '', endDate: '', highlights: ['third'] }]
          }
        ]
      }
    };
    const entries = collectHighlightEntries(resume);
    const issues = buildBulletIssues(
      breakdownWithBullets([
        { impact: 0, opening: 3 },
        { impact: 3, opening: 0 },
        { impact: 0, opening: 0 }
      ]),
      resume
    );

    expect(entries.map((entry) => entry.path)).toEqual([
      'sections.work.0.positions.0.highlights.0',
      'sections.work.0.positions.1.highlights.0',
      'sections.work.1.positions.0.highlights.0'
    ]);
    expect(firstIssueForCriterion(issues, 'Accomplishment Focus')?.path).toBe(entries[0]?.path);
    expect(firstIssueForCriterion(issues, 'Action Verb Usage')?.path).toBe(entries[1]?.path);
    expect(groupIssuesByPath(issues).get(entries[2]!.path)).toHaveLength(2);
  });

  it('stops at a stale measurement rather than inventing a path', () => {
    const resume = resumeWithBullets(['only bullet']);
    const issues = buildBulletIssues(
      breakdownWithBullets([
        { impact: 0, opening: 0 },
        { impact: 0, opening: 0 }
      ]),
      resume
    );
    expect(issues).toHaveLength(2);
    expect(new Set(issues.map((issue) => issue.path)).size).toBe(1);
  });
});

describe('bullet issue consumers agree', () => {
  it('scores the same bullet count in tips, icons and match breakdown', () => {
    const resume = resumeWithBullets(['helped with code', 'Built a service']);
    const breakdown = breakdownWithBullets([
      { impact: 0.5, opening: 0.5 },
      { impact: 2.5, opening: 2.5 }
    ]);
    const issues = buildBulletIssues(breakdown, resume);
    expect(issues).toHaveLength(2);

    const tips = buildDynamicTips(breakdown, resume, null);
    const impactTip = renderToStaticMarkup(tips['Accomplishment Focus'] as never);
    expect(impactTip).toContain('1 of 2');
    expect(impactTip).toContain('see the marked bullets');
    expect(impactTip).toContain('helped with code');

    const match = buildMatchBreakdown(breakdown, resume);
    expect(match.find((row) => row.criterion === 'Accomplishment Focus')?.path).toBe(
      issues[0]?.path
    );
  });
});
