import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../index.js', import.meta.url), 'utf8');
const start = source.indexOf('function applyPromptOrderLock(');
const end = source.indexOf('function installPromptOrderLockObserver(', start);
const helper = source.slice(start, end);

function runLock(locked, { present = true, initialized = true, disabled = false } = {}) {
    const commands = [];
    const context = vm.createContext({
        locked,
        console,
        jQuery(selector) {
            assert.equal(selector, '#completion_prompt_manager_list');
            return {
                length: present ? 1 : 0,
                hasClass(name) {
                    if (name === 'ui-sortable') return initialized;
                    if (name === 'ui-sortable-disabled') return disabled;
                    throw new Error('Unexpected class check: ' + name);
                },
                sortable(command) {
                    commands.push(command);
                },
            };
        },
    });
    vm.runInContext(helper, context);
    const applied = vm.runInContext('applyPromptOrderLock(locked)', context);
    return { applied, commands };
}

test('disables SillyTavern sortable when order lock is enabled', () => {
    assert.deepEqual(runLock(true), { applied: true, commands: ['disable'] });
});

test('re-enables SillyTavern sortable when order lock is disabled', () => {
    assert.deepEqual(runLock(false, { disabled: true }), { applied: true, commands: ['enable'] });
});

test('waits safely when the prompt list has not initialized yet', () => {
    assert.deepEqual(runLock(true, { initialized: false }), { applied: false, commands: [] });
});

test('does not repeatedly disable an already locked sortable list', () => {
    assert.deepEqual(runLock(true, { disabled: true }), { applied: true, commands: [] });
});
