/**
 * @file TaskParser.test.ts
 * @description Tests for TaskParser — parsing, serialization, and metadata extraction
 */

import { describe, it, expect } from 'vitest';
import { TaskParser } from './TaskParser';

describe('TaskParser', () => {
  describe('parseLine', () => {
    it('parses basic incomplete task', () => {
      const line = '- [ ] Buy milk';
      const task = TaskParser.parseLine(line, 0, 'test.md');

      expect(task).not.toBeNull();
      expect(task!.title).toBe('Buy milk');
      expect(task!.done).toBe(false);
      expect(task!.vikunjaId).toBeNull();
    });

    it('parses completed task', () => {
      const line = '- [x] Buy milk';
      const task = TaskParser.parseLine(line, 0, 'test.md');

      expect(task).not.toBeNull();
      expect(task!.done).toBe(true);
    });

    it('parses task with due date', () => {
      const line = '- [ ] Buy milk 📅 2026-05-15';
      const task = TaskParser.parseLine(line, 0, 'test.md');

      expect(task).not.toBeNull();
      expect(task!.dueDate).toBe('2026-05-15');
      // Title should not contain the date portion
      expect(task!.title).not.toContain('2026-05-15');
      expect(task!.title).toContain('Buy milk');
    });

    it('parses task with start date', () => {
      const line = '- [ ] Project work 🛫 2026-05-10';
      const task = TaskParser.parseLine(line, 0, 'test.md');

      expect(task).not.toBeNull();
      expect(task!.startDate).toBe('2026-05-10');
    });

    it('parses task with scheduled date', () => {
      const line = '- [ ] Review draft ⏳ 2026-05-12';
      const task = TaskParser.parseLine(line, 0, 'test.md');

      expect(task).not.toBeNull();
      expect(task!.scheduledDate).toBe('2026-05-12');
    });

    it('parses task with priority emojis', () => {
      const testCases = [
        { line: '- [ ] Task 🔺', priority: 5 },
        { line: '- [ ] Task ⏫', priority: 4 },
        { line: '- [ ] Task 🔼', priority: 3 },
        { line: '- [ ] Task 🔽', priority: 2 },
        { line: '- [ ] Task ⏬', priority: 1 },
      ];

      testCases.forEach(({ line, priority }) => {
        const task = TaskParser.parseLine(line, 0, 'test.md');
        expect(task!.priority).toBe(priority);
      });
    });

    it('parses task with recurrence', () => {
      const line = '- [ ] Weekly standup 🔁 every week';
      const task = TaskParser.parseLine(line, 0, 'test.md');

      expect(task).not.toBeNull();
      expect(task!.recurrence).toBe('every week');
    });

    it('parses task with Vikunja ID (new %% format)', () => {
      const line = '- [ ] My task %%vikunja:42%%';
      const task = TaskParser.parseLine(line, 0, 'test.md');

      expect(task).not.toBeNull();
      expect(task!.vikunjaId).toBe(42);
    });

    it('parses task with Vikunja ID (old <!-- --> format)', () => {
      const line = '- [ ] My task <!--vikunja:99-->';
      const task = TaskParser.parseLine(line, 0, 'test.md');

      expect(task).not.toBeNull();
      expect(task!.vikunjaId).toBe(99);
    });

    it('parses task with inline project override', () => {
      const line = '- [ ] Buy milk @project:Shopping';
      const task = TaskParser.parseLine(line, 0, 'test.md');

      expect(task).not.toBeNull();
      expect(task!.projectName).toBe('Shopping');
      expect(task!.title).toBe('Buy milk');
    });

    it('parses task with multiple metadata tokens', () => {
      const line = '- [ ] File taxes 📅 2026-04-30 🔺 @project:Finance %%vikunja:15%%';
      const task = TaskParser.parseLine(line, 0, 'test.md');

      expect(task).not.toBeNull();
      expect(task!.title).toContain('File taxes');
      expect(task!.dueDate).toBe('2026-04-30');
      expect(task!.priority).toBe(5);
      expect(task!.projectName).toBe('Finance');
      expect(task!.vikunjaId).toBe(15);
      // Verify all metadata is extracted (not in title)
      expect(task!.title).not.toContain('2026-04-30');
      expect(task!.title).not.toContain('@project:');
      expect(task!.title).not.toContain('%%');
    });

    it('returns null for non-task lines', () => {
      expect(TaskParser.parseLine('# Heading', 0, 'test.md')).toBeNull();
      expect(TaskParser.parseLine('Regular paragraph', 0, 'test.md')).toBeNull();
      expect(TaskParser.parseLine('', 0, 'test.md')).toBeNull();
    });

    it('ignores Tasks plugin tokens and strips them from title', () => {
      const line = '- [ ] Send email ✅ 2026-04-20 🆔 abc123 ➕ 2026-04-19';
      const task = TaskParser.parseLine(line, 0, 'test.md');

      expect(task).not.toBeNull();
      expect(task!.title).toBe('Send email');
      // Tokens should not appear in title
      expect(task!.title).not.toContain('✅');
      expect(task!.title).not.toContain('🆔');
      expect(task!.title).not.toContain('➕');
    });
  });

  describe('parseFile', () => {
    it('parses multiple tasks from file content', () => {
      const content = `- [ ] Task 1
- [x] Task 2
- [ ] Task 3 📅 2026-05-01`;

      const tasks = TaskParser.parseFile(content, 'test.md');

      expect(tasks).toHaveLength(3);
      expect(tasks[0].title).toBe('Task 1');
      expect(tasks[1].done).toBe(true);
      expect(tasks[2].dueDate).toBe('2026-05-01');
    });

    it('ignores non-task lines', () => {
      const content = `# My Tasks
- [ ] Task 1
Regular paragraph
- [ ] Task 2`;

      const tasks = TaskParser.parseFile(content, 'test.md');
      expect(tasks).toHaveLength(2);
    });
  });

  describe('serialise', () => {
    it('serializes basic task', () => {
      const task = {
        rawLine: '- [ ] Buy milk',
        lineNumber: 0,
        filePath: 'test.md',
        title: 'Buy milk',
        done: false,
        dueDate: null,
        startDate: null,
        scheduledDate: null,
        priority: 0,
        recurrence: null,
        vikunjaId: null,
        projectId: null,
        projectName: null,
      };

      const line = TaskParser.serialise(task);
      expect(line).toBe('- [ ] Buy milk');
    });

    it('serializes completed task', () => {
      const task = {
        rawLine: '- [ ] Buy milk',
        lineNumber: 0,
        filePath: 'test.md',
        title: 'Buy milk',
        done: true,
        dueDate: null,
        startDate: null,
        scheduledDate: null,
        priority: 0,
        recurrence: null,
        vikunjaId: null,
        projectId: null,
        projectName: null,
      };

      const line = TaskParser.serialise(task);
      expect(line).toBe('- [x] Buy milk');
    });

    it('serializes task with all metadata', () => {
      const task = {
        rawLine: '- [ ] Task',
        lineNumber: 0,
        filePath: 'test.md',
        title: 'File taxes',
        done: false,
        dueDate: '2026-04-30',
        startDate: '2026-04-20',
        scheduledDate: '2026-04-25',
        priority: 5,
        recurrence: 'every month',
        vikunjaId: 42,
        projectId: 1,
        projectName: 'Finance',
      };

      const line = TaskParser.serialise(task);

      // Check all components are present
      expect(line).toContain('File taxes');
      expect(line).toContain('@project:Finance');
      expect(line).toContain('🔁 every month');
      expect(line).toContain('🛫 2026-04-20');
      expect(line).toContain('⏳ 2026-04-25');
      expect(line).toContain('📅 2026-04-30');
      expect(line).toContain('🔺');
      expect(line).toContain('%%vikunja:42%%');
    });

    it('round-trips task through parse → serialize', () => {
      const original = '- [ ] Buy milk 📅 2026-05-15 🔺 @project:Shopping %%vikunja:99%%';
      const parsed = TaskParser.parseLine(original, 0, 'test.md');
      const serialized = TaskParser.serialise(parsed!);

      // Verify all components are preserved (order may differ)
      expect(serialized).toContain('Buy milk');
      expect(serialized).toContain('📅 2026-05-15');
      expect(serialized).toContain('🔺');
      expect(serialized).toContain('@project:Shopping');
      expect(serialized).toContain('%%vikunja:99%%');
    });
  });

  describe('cleanTitle', () => {
    it('strips metadata tokens from title', () => {
      const cleaned1 = TaskParser.cleanTitle('Buy milk 📅 2026-05-15');
      expect(cleaned1).toContain('Buy milk');
      expect(cleaned1).not.toContain('2026-05-15');

      const cleaned2 = TaskParser.cleanTitle('Task @project:Work 🔺');
      expect(cleaned2).toContain('Task');
      expect(cleaned2).not.toContain('@project:');
      expect(cleaned2).not.toContain('project');

      const cleaned3 = TaskParser.cleanTitle('Repeat 🔁 every week');
      expect(cleaned3).toContain('Repeat');
      expect(cleaned3).not.toContain('every week');
      expect(cleaned3).not.toContain('🔁');
    });

    it('strips Tasks plugin tokens', () => {
      expect(TaskParser.cleanTitle('Task ✅ 2026-04-20')).toBe('Task');
      expect(TaskParser.cleanTitle('Task 🆔 abc123')).toBe('Task');
      expect(TaskParser.cleanTitle('Task ➕ 2026-04-20')).toBe('Task');
      expect(TaskParser.cleanTitle('Task ❌ 2026-04-20')).toBe('Task');
      expect(TaskParser.cleanTitle('Task ⛔ dependency')).toBe('Task');
      expect(TaskParser.cleanTitle('Task 🏁 nextTask')).toBe('Task');
    });

    it('normalizes whitespace', () => {
      expect(TaskParser.cleanTitle('Task   with   spaces')).toBe('Task with spaces');
      expect(TaskParser.cleanTitle('  Task  ')).toBe('Task');
    });
  });

  describe('parseRepeatAfter', () => {
    it('converts common recurrence patterns to seconds', () => {
      expect(TaskParser.parseRepeatAfter('every day')).toBe(86400);
      expect(TaskParser.parseRepeatAfter('every week')).toBe(604800);
      expect(TaskParser.parseRepeatAfter('every month')).toBe(2592000);
      expect(TaskParser.parseRepeatAfter('every year')).toBe(31536000);
    });

    it('converts numeric patterns', () => {
      expect(TaskParser.parseRepeatAfter('every 2 weeks')).toBe(1209600);
      expect(TaskParser.parseRepeatAfter('every 3 days')).toBe(259200);
      expect(TaskParser.parseRepeatAfter('every 6 months')).toBe(15552000);
    });

    it('handles edge cases', () => {
      expect(TaskParser.parseRepeatAfter('every other day')).toBe(172800);
      expect(TaskParser.parseRepeatAfter('daily')).toBe(86400);
      expect(TaskParser.parseRepeatAfter('weekly')).toBe(604800);
      expect(TaskParser.parseRepeatAfter(null)).toBeUndefined();
      expect(TaskParser.parseRepeatAfter('')).toBeUndefined();
      expect(TaskParser.parseRepeatAfter('invalid')).toBeUndefined();
    });
  });

  describe('formatRepeatAfter', () => {
    it('converts seconds back to human-readable format', () => {
      expect(TaskParser.formatRepeatAfter(86400)).toBe('every day');
      expect(TaskParser.formatRepeatAfter(604800)).toBe('every week');
      expect(TaskParser.formatRepeatAfter(2592000)).toBe('every month');
      expect(TaskParser.formatRepeatAfter(31536000)).toBe('every year');
    });

    it('handles null/zero values', () => {
      expect(TaskParser.formatRepeatAfter(0)).toBeNull();
      expect(TaskParser.formatRepeatAfter(-1)).toBeNull();
    });
  });
});
