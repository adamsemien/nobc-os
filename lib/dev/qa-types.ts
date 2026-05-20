export type MissionDifficulty = 'easy' | 'medium' | 'hard';

export type MissionType =
  | 'speed_run'
  | 'discovery'
  | 'workflow'
  | 'stress_test'
  | 'bug_hunt';

export interface MissionStep {
  id: string;
  instruction: string;
  checkpoint: string;
  points: number;
}

export interface CompletedStep {
  id: string;
  completedAt: string;
  pointsAwarded: number;
  source: 'auto' | 'manual';
  evidence?: string;
}

export type BugSeverity = 'low' | 'medium' | 'high';

export interface BugReport {
  id: string;
  description: string;
  location: string;
  screenshotUrl?: string;
  reportedAt: string;
  pointsAwarded: number;
  /** 0-based index into mission.steps, or null if not tied to a step. */
  stepIndex?: number | null;
  /** Snapshot of the step.instruction at time of report. */
  stepTitle?: string | null;
  severity?: BugSeverity;
}

export type MissionDisplayMode = 'hud' | 'expanded';

export interface ActiveMission {
  id: string;
  scenario: string;
  missionType: MissionType | string;
  difficulty: MissionDifficulty | string;
  steps: MissionStep[];
  completedSteps: CompletedStep[];
  score: number;
  bugsFound: BugReport[];
  status: string;
  startedAt: string;
  timeLimit?: number | null;
  bonusObjective?: string | null;
}

// "visit:/operator/applications" → /operator/applications
// "visit:/operator/applications/*" → wildcard match
// "manual:..." → operator-marked only
export function matchCheckpoint(checkpoint: string, pathname: string): boolean {
  if (!checkpoint.startsWith('visit:')) return false;
  const target = checkpoint.slice(6).trim();
  if (!target) return false;
  if (target.endsWith('/*')) {
    const prefix = target.slice(0, -2);
    return pathname === prefix || pathname.startsWith(prefix + '/');
  }
  if (target.endsWith('*')) {
    return pathname.startsWith(target.slice(0, -1));
  }
  return pathname === target;
}
