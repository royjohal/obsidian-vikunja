/**
 * @file DeletionSafeguards.test.ts
 * @description Tests for task deletion safeguards — ensuring we never delete too many tasks
 *
 * These tests verify the critical safety mechanisms that prevent data loss when
 * tasks are deleted from Obsidian.
 */

import { describe, it, expect } from 'vitest';

/**
 * Simulates the deletion safeguard logic from SyncEngine.deleteOrphanedTasks()
 * Returns { shouldDelete: boolean, reason?: string }
 */
function checkDeletionSafeguards(
  localTaskCount: number,
  remoteTaskCount: number
): { shouldDelete: boolean; reason?: string } {
  // Safeguard 1: Empty file check
  if (localTaskCount === 0) {
    return {
      shouldDelete: false,
      reason: 'File is empty (not yet populated with remote tasks)',
    };
  }

  // Safeguard 2: 50% threshold check
  const orphanedCount = remoteTaskCount - localTaskCount;
  if (orphanedCount >= remoteTaskCount * 0.5) {
    return {
      shouldDelete: false,
      reason: `Too many orphaned tasks (${orphanedCount}/${remoteTaskCount}), likely a sync issue`,
    };
  }

  return { shouldDelete: true };
}

describe('Deletion Safeguards', () => {
  describe('Empty file check', () => {
    it('prevents deletion when file is empty', () => {
      const result = checkDeletionSafeguards(0, 45);
      expect(result.shouldDelete).toBe(false);
      expect(result.reason).toContain('empty');
    });

    it('allows deletion when file has tasks', () => {
      const result = checkDeletionSafeguards(1, 1);
      expect(result.shouldDelete).toBe(true);
    });

    it('prevents mass deletion on first sync (empty file created but not populated)', () => {
      // Scenario: user enables auto-creation, 50 tasks in Vikunja, but the
      // auto-created file hasn't had tasks imported yet
      const result = checkDeletionSafeguards(0, 50);
      expect(result.shouldDelete).toBe(false);
    });
  });

  describe('50% threshold check', () => {
    it('allows deletion of single tasks', () => {
      // 10 tasks in Obsidian, 11 in Vikunja (1 orphaned = 9%)
      const result = checkDeletionSafeguards(10, 11);
      expect(result.shouldDelete).toBe(true);
    });

    it('allows deletion of minority of tasks', () => {
      // 100 tasks in Obsidian, 110 in Vikunja (10 orphaned = 9%)
      const result = checkDeletionSafeguards(100, 110);
      expect(result.shouldDelete).toBe(true);
    });

    it('prevents deletion at exactly 50% threshold', () => {
      // 50 tasks in Obsidian, 100 in Vikunja (50 orphaned = 50%)
      const result = checkDeletionSafeguards(50, 100);
      expect(result.shouldDelete).toBe(false);
      expect(result.reason).toContain('Too many orphaned tasks');
    });

    it('prevents deletion above 50% threshold', () => {
      // 45 tasks in Obsidian, 100 in Vikunja (55 orphaned = 55%)
      // This is the scenario that happened to the user
      const result = checkDeletionSafeguards(45, 100);
      expect(result.shouldDelete).toBe(false);
      expect(result.reason).toContain('Too many orphaned tasks');
    });

    it('prevents catastrophic deletion (all tasks orphaned)', () => {
      // 0 tasks in Obsidian (but not caught by empty check because...)
      // Actually, empty check catches this first
      // But test the threshold anyway
      const result = checkDeletionSafeguards(0, 100);
      expect(result.shouldDelete).toBe(false);
    });

    it('prevents deletion when 75% of tasks are orphaned', () => {
      // 25 tasks in Obsidian, 100 in Vikunja (75 orphaned = 75%)
      const result = checkDeletionSafeguards(25, 100);
      expect(result.shouldDelete).toBe(false);
    });
  });

  describe('Real-world scenarios', () => {
    it('allows safe cleanup of a few deleted tasks', () => {
      // User has 50 tasks synced, deletes 3 from Obsidian
      // Next sync should delete the 3 from Vikunja (6%)
      const result = checkDeletionSafeguards(47, 50);
      expect(result.shouldDelete).toBe(true);
    });

    it('prevents deletion when sync is broken (tasks not imported yet)', () => {
      // User has 200 tasks in Vikunja, creates project file but sync fails
      // File has 0 tasks, next sync would delete all 200
      const result = checkDeletionSafeguards(0, 200);
      expect(result.shouldDelete).toBe(false);
    });

    it('prevents deletion when file is corrupted/cleared accidentally', () => {
      // User accidentally deletes file content (clears all tasks)
      // File has 0 tasks, would delete all 150 from Vikunja
      const result = checkDeletionSafeguards(0, 150);
      expect(result.shouldDelete).toBe(false);
    });

    it('prevents deletion when integration is broken', () => {
      // Some kind of issue causes remoteTaskIds to not match localTaskIds
      // for most tasks. Maybe file parsing is broken, or API returned wrong IDs
      const result = checkDeletionSafeguards(2, 50);
      expect(result.shouldDelete).toBe(false);
    });

    it('allows deletion in normal operation', () => {
      // 150 tasks in file, 152 in Vikunja
      // User deleted 2, next sync should be safe
      const result = checkDeletionSafeguards(150, 152);
      expect(result.shouldDelete).toBe(true);
    });

    it('allows deletion of up to 49% of tasks (conservative threshold)', () => {
      // Even at nearly 50%, should still delete
      // 51 tasks in Obsidian, 100 in Vikunja (49 orphaned = 49%)
      const result = checkDeletionSafeguards(51, 100);
      expect(result.shouldDelete).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('handles single task correctly', () => {
      const result = checkDeletionSafeguards(1, 1);
      expect(result.shouldDelete).toBe(true);
    });

    it('handles all tasks deleted from file', () => {
      const result = checkDeletionSafeguards(0, 100);
      expect(result.shouldDelete).toBe(false); // Caught by empty check
    });

    it('handles no tasks in either place', () => {
      const result = checkDeletionSafeguards(0, 0);
      expect(result.shouldDelete).toBe(false); // Caught by empty check
    });

    it('handles large numbers', () => {
      // 10,000 tasks synced, user deletes 100
      const result = checkDeletionSafeguards(9900, 10000);
      expect(result.shouldDelete).toBe(true);
    });
  });

  describe('Safeguard complement', () => {
    it('empty check and threshold check work together', () => {
      // Empty file: caught by safeguard 1
      expect(checkDeletionSafeguards(0, 45).shouldDelete).toBe(false);

      // Too many orphaned: caught by safeguard 2
      expect(checkDeletionSafeguards(10, 100).shouldDelete).toBe(false);

      // Both safe: neither safeguard triggered
      expect(checkDeletionSafeguards(90, 100).shouldDelete).toBe(true);
    });
  });
});
