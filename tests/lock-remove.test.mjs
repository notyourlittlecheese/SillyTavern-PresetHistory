import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../index.js', import.meta.url), 'utf8');
const helpers = source
    .slice(0, source.indexOf('// ========== 从请求体里提取预设'))
    .replace(/^import .*;\r?\n/gm, '');
const context = vm.createContext({});
vm.runInContext(helpers, context);

function isBlocked({ locked, matches }) {
    context.settings = { lockParams: locked };
    context.target = {
        closest(selector) {
            assert.equal(selector, '#completion_prompt_manager .prompt-manager-detach-action');
            return matches ? {} : null;
        },
    };
    return vm.runInContext('isLockedPromptDetach(target, settings)', context);
}

test('blocks the prompt Remove action while parameter lock is enabled', () => {
    assert.equal(isBlocked({ locked: true, matches: true }), true);
});

test('allows the prompt Remove action when parameter lock is disabled', () => {
    assert.equal(isBlocked({ locked: false, matches: true }), false);
});

test('does not block unrelated prompt controls', () => {
    assert.equal(isBlocked({ locked: true, matches: false }), false);
});
