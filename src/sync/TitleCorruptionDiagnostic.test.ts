/**
 * @file sync/TitleCorruptionDiagnostic.test.ts
 * @description Diagnostic tests to isolate the task title corruption issue.
 *
 * Symptoms:
 * - Tasks with emoji metadata get corrupted with replacement characters (◆ or %)
 * - Tracking ID format showing as `% %vikunja:XX%` instead of `%%vikunja:XX%%`
 * - Simple tasks without emoji metadata sync cleanly
 *
 * This test suite helps identify at which step the corruption occurs:
 * 1. Parsing emoji metadata
 * 2. Stripping emoji from title
 * 3. Serializing task back to markdown
 * 4. JSON encoding/decoding cycle
 */

import { describe, it, expect } from 'vitest';
import { TaskParser } from './TaskParser';
import type { ObsidianTask } from '../types';

describe('Title Corruption Diagnostic', () => {

  describe('Emoji handling - parsing and stripping', () => {
    it('correctly parses task title with priority emoji', () => {
      const line = '- [ ] test title ⏫ 📅 2026-05-03';
      const task = TaskParser.parseLine(line, 0, 'test.md');

      expect(task).not.toBeNull();
      expect(task!.title).toBe('test title');
      expect(task!.priority).toBe(4);
      expect(task!.dueDate).toBe('2026-05-03');
    });

    it('correctly parses complex emoji combination', () => {
      const line = '- [ ] complex task ⏫ 📅 2026-05-03 🔁 every week @project:Work';
      const task = TaskParser.parseLine(line, 0, 'test.md');

      expect(task).not.toBeNull();
      expect(task!.title).toBe('complex task');
      expect(task!.priority).toBe(4);
      expect(task!.dueDate).toBe('2026-05-03');
      expect(task!.recurrence).toBe('every week');
      expect(task!.projectName).toBe('Work');
    });

    it('cleanTitle removes all emoji metadata', () => {
      const raw = 'test title ⏫ 📅 2026-05-03 🔁 every week @project:Work %%vikunja:42%%';
      const clean = TaskParser.cleanTitle(raw);

      expect(clean).toBe('test title');
      // No emoji should remain
      expect(clean).not.toMatch(/[📅🛫⏳🔺⏫🔼🔽⏬🔁@%]/);
    });
  });

  describe('Serialization round-trip', () => {
    it('serializes and deserializes task without loss', () => {
      const original: ObsidianTask = {
        rawLine: '- [ ] original title',
        lineNumber: 0,
        filePath: 'test.md',
        title: 'test title',
        done: false,
        dueDate: '2026-05-03',
        startDate: '2026-05-01',
        scheduledDate: '2026-05-02',
        priority: 4,
        recurrence: 'every week',
        vikunjaId: 42,
        projectId: 1,
        projectName: 'Work',
      };

      // Serialize to markdown
      const serialized = TaskParser.serialise(original);
      console.log('Serialized line:', serialized);

      // Verify structure
      expect(serialized).toContain('test title');
      expect(serialized).toContain('⏫');
      expect(serialized).toContain('📅 2026-05-03');
      expect(serialized).toContain('🛫 2026-05-01');
      expect(serialized).toContain('⏳ 2026-05-02');
      expect(serialized).toContain('🔁 every week');
      expect(serialized).toContain('@project:Work');
      expect(serialized).toContain('%%vikunja:42%%');

      // Re-parse the serialized line
      const reparsed = TaskParser.parseLine(serialized, 0, 'test.md');
      expect(reparsed).not.toBeNull();

      if (reparsed) {
        // Verify all fields are preserved
        expect(reparsed.title).toBe(original.title);
        expect(reparsed.done).toBe(original.done);
        expect(reparsed.dueDate).toBe(original.dueDate);
        expect(reparsed.startDate).toBe(original.startDate);
        expect(reparsed.scheduledDate).toBe(original.scheduledDate);
        expect(reparsed.priority).toBe(original.priority);
        expect(reparsed.recurrence).toBe(original.recurrence);
        expect(reparsed.vikunjaId).toBe(original.vikunjaId);
        expect(reparsed.projectName).toBe(original.projectName);
      }
    });
  });

  describe('JSON encoding/decoding', () => {
    it('JSON round-trip preserves emoji characters', () => {
      const taskData = {
        title: 'test title',
        priority: 4,
        dueDate: '2026-05-03',
      };

      const json = JSON.stringify(taskData);
      console.log('JSON:', json);

      const parsed = JSON.parse(json);
      expect(parsed.title).toBe('test title');
    });

    it('JSON with emoji in string', () => {
      const withEmoji = { text: 'task ⏫ 📅' };
      const json = JSON.stringify(withEmoji);
      console.log('JSON with emoji:', json);
      console.log('JSON bytes:', Array.from(new TextEncoder().encode(json)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));

      const decoded = JSON.parse(json);
      expect(decoded.text).toBe('task ⏫ 📅');
    });
  });

  describe('Percent sign handling', () => {
    it('percent signs in tracking ID are preserved', () => {
      const line = '- [ ] task %%vikunja:42%%';
      const task = TaskParser.parseLine(line, 0, 'test.md');

      expect(task).not.toBeNull();
      expect(task!.vikunjaId).toBe(42);

      // Re-serialize
      const serialized = TaskParser.serialise(task!);
      console.log('Reserialized:', serialized);

      expect(serialized).toContain('%%vikunja:42%%');
      expect(serialized).not.toContain('% %vikunja');
    });

    it('tracking ID with emoji in title', () => {
      const line = '- [ ] task ⏫ 📅 2026-05-03 %%vikunja:42%%';
      const task = TaskParser.parseLine(line, 0, 'test.md');

      expect(task).not.toBeNull();
      expect(task!.title).toBe('task');
      expect(task!.vikunjaId).toBe(42);

      const serialized = TaskParser.serialise(task!);
      console.log('Serialized with emoji + ID:', serialized);

      // Both the emoji and the tracking ID should be intact
      expect(serialized).toContain('⏫');
      expect(serialized).toContain('📅 2026-05-03');
      expect(serialized).toContain('%%vikunja:42%%');
    });
  });

  describe('Specific corruption patterns', () => {
    it('reproduces the "% % " pattern if it occurs', () => {
      // Try to create conditions that might cause % % pattern
      const problematic = '- [ ] task ⏫ %%vikunja:42%%';
      const parsed = TaskParser.parseLine(problematic, 0, 'test.md');

      if (parsed) {
        const serialized = TaskParser.serialise(parsed);
        console.log('Potentially problematic serialization:', serialized);

        // The tracking ID should always have %% not % %
        expect(serialized).not.toMatch(/% %vikunja/);
        expect(serialized).toContain('%%vikunja');
      }
    });

    it('handles replacement character in title', () => {
      // If a title already contains the replacement character, we should detect it
      const withReplacement = 'task with replacement char: ' + String.fromCharCode(0xFFFD);
      const encoded = JSON.stringify({ title: withReplacement });
      console.log('Encoded replacement char:', encoded);

      const decoded = JSON.parse(encoded);
      console.log('Decoded title:', decoded.title);
      console.log('Title includes replacement char:', decoded.title.includes(String.fromCharCode(0xFFFD)));
    });
  });

  describe('API response encoding', () => {
    it('simulates Vikunja API response with emoji', () => {
      // Simulate what Vikunja API might return
      const vikunjaResponse = {
        id: 42,
        title: 'task title',
        description: '',
        done: false,
        done_at: null,
        due_date: '2026-05-03T00:00:00Z',
        start_date: '2026-05-01T00:00:00Z',
        end_date: null,
        priority: 4,
        labels: [],
        assignees: [],
        project_id: 1,
        created: '2026-04-26T00:00:00Z',
        updated: '2026-04-26T00:00:00Z',
        repeat_after: 604800, // 1 week
        percent_done: 0,
      };

      const json = JSON.stringify(vikunjaResponse);
      console.log('API response JSON:', json);

      const parsed = JSON.parse(json);
      expect(parsed.title).toBe('task title');
      expect(parsed.priority).toBe(4);
    });

    it('API response with emoji in title (if Vikunja echoes it back)', () => {
      const vikunjaResponseWithEmoji = {
        id: 42,
        title: 'task ⏫ 📅', // If title accidentally includes emoji
        priority: 4,
      };

      const json = JSON.stringify(vikunjaResponseWithEmoji);
      const parsed = JSON.parse(json);

      console.log('Title from API:', parsed.title);
      console.log('Title bytes:', Array.from(new TextEncoder().encode(parsed.title)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));

      expect(parsed.title).toContain('task');
    });
  });
});
