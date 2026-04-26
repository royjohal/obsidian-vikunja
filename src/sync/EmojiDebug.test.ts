/**
 * @file sync/EmojiDebug.test.ts
 * @description Debug emoji encoding issues
 */

import { describe, it, expect } from 'vitest';
import { PRIORITY_MAP } from '../types';
import { TaskParser } from './TaskParser';

describe('Emoji encoding debug', () => {
  it('shows PRIORITY_MAP emoji bytes', () => {
    console.log('\n=== PRIORITY_MAP emoji bytes ===');
    for (const [emoji, value] of Object.entries(PRIORITY_MAP)) {
      const bytes = Array.from(new TextEncoder().encode(emoji))
        .map(b => '0x' + b.toString(16).padStart(2, '0'))
        .join(' ');
      console.log(`${emoji} (value: ${value}): ${bytes}`);
    }
  });

  it('shows test string emoji bytes', () => {
    console.log('\n=== Test string emoji bytes ===');
    const testString = '- [ ] test title ⏫ 📅 2026-05-03';
    const bytes = Array.from(new TextEncoder().encode(testString))
      .map(b => '0x' + b.toString(16).padStart(2, '0'))
      .join(' ');
    console.log(`Test string: ${testString}`);
    console.log(`Bytes: ${bytes}`);
  });

  it('tests if PRIORITY_MAP emoji match in string', () => {
    const testString = '- [ ] test title ⏫ 📅 2026-05-03';
    console.log('\n=== Testing emoji matching ===');
    console.log(`Original: "${testString}"`);

    for (const [emoji, value] of Object.entries(PRIORITY_MAP)) {
      const includes = testString.includes(emoji);
      const indexOf = testString.indexOf(emoji);
      console.log(`${emoji}: includes=${includes}, indexOf=${indexOf}`);

      if (includes) {
        const result = testString.replaceAll(emoji, '[REPLACED]');
        console.log(`  After replaceAll: "${result}"`);
      }
    }
  });

  it('tests DATE_STRIP_REGEX vs replaceAll', () => {
    const testString = '- [ ] test title ⏫ 📅 2026-05-03';
    console.log('\n=== Testing regex vs replaceAll ===');
    console.log(`Original: "${testString}"`);

    // Using regex (like in cleanTitle)
    const DATE_STRIP_REGEX = /[📅🛫⏳]\s*\d{4}-\d{2}-\d{2}/g;
    const afterRegex = testString.replace(DATE_STRIP_REGEX, '');
    console.log(`After regex DATE_STRIP: "${afterRegex}"`);

    // Using replaceAll on individual emoji
    let afterReplaceAll = testString;
    for (const emoji of ['🔺', '⏫', '🔼', '🔽', '⏬']) {
      afterReplaceAll = afterReplaceAll.replaceAll(emoji, '');
    }
    console.log(`After replaceAll emoji: "${afterReplaceAll}"`);
  });

  it('tests cleanTitle function step by step', () => {
    const testString = '- [ ] test title ⏫ 📅 2026-05-03';
    console.log('\n=== Testing cleanTitle step by step ===');
    console.log(`Input to cleanTitle: "${testString}"`);

    // Extract the part after the checkbox (what cleanTitle actually receives)
    const match = testString.match(/^(\s*)[-*]\s+\[([x ])\]\s+(.+)$/i);
    const rawContent = match ? match[3] : testString;
    console.log(`After extracting rawContent: "${rawContent}"`);

    // Now apply cleanTitle logic
    let t = rawContent;

    const DATE_STRIP_REGEX = /[📅🛫⏳]\s*\d{4}-\d{2}-\d{2}/g;
    t = t.replace(DATE_STRIP_REGEX, '');
    console.log(`After DATE_STRIP: "${t}"`);

    const RECURRENCE_STRIP_REGEX = /🔁\s*[^🔺⏫🔼🔽⏬📅🛫⏳➕✅❌🆔⛔🏁@<]*/g;
    t = t.replace(RECURRENCE_STRIP_REGEX, '');
    console.log(`After RECURRENCE_STRIP: "${t}"`);

    const PROJECT_OVERRIDE_REGEX = /@project:([^@<📅🛫⏳🔺⏫🔼🔽⏬➕✅❌🆔⛔🏁%]+)/;
    t = t.replace(PROJECT_OVERRIDE_REGEX, '');
    console.log(`After PROJECT_OVERRIDE: "${t}"`);

    // Priority emoji
    const priorityEmoji = ['🔺', '⏫', '🔼', '🔽', '⏬'];
    for (const emoji of priorityEmoji) {
      t = t.replaceAll(emoji, '');
    }
    console.log(`After priority emoji replaceAll: "${t}"`);

    t = t.trim().replace(/\s+/g, ' ');
    console.log(`Final (after trim + collapse spaces): "${t}"`);
  });

  it('tests actual TaskParser.cleanTitle', () => {
    const input = 'test title ⏫ 📅 2026-05-03';
    console.log('\n=== Testing actual TaskParser.cleanTitle ===');
    console.log(`Input: "${input}"`);
    const result = TaskParser.cleanTitle(input);
    console.log(`Result: "${result}"`);
    console.log(`Result bytes: ${Array.from(new TextEncoder().encode(result)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
    console.log(`Contains replacement char: ${result.includes(String.fromCharCode(0xFFFD))}`);
  });
});
