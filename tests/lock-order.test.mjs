import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../index.js', import.meta.url), 'utf8');
const utilityHelpers = source
    .slice(0, source.indexOf('// ========== 从请求体里提取预设'))
    .replace(/^import .*;\r?\n/gm, '');
const start = source.indexOf('function getPromptOrderSortableDefaults(');
const end = source.indexOf('function installPromptOrderLockObserver(', start);
const helper = source.slice(start, end);

function runLock(locked, {
    present = true,
    initialized = true,
    disabled = false,
    items = '.completion_prompt_manager_prompt_draggable',
    cancel = 'input,textarea,button,select,option',
} = {}) {
    const commands = [];
    const store = new Map();
    const context = vm.createContext({
        locked,
        console,
        jQuery(selector) {
            assert.equal(selector, '#completion_prompt_manager_list');
            return {
                length: present ? 1 : 0,
                data(key, value) {
                    if (arguments.length === 1) return store.get(key);
                    store.set(key, value);
                },
                sortable(command, option, value) {
                    if (!initialized) throw new Error('not initialized');
                    if (command === 'option' && option === 'disabled' && arguments.length === 2) return disabled;
                    if (command === 'option' && option === 'items' && arguments.length === 2) return items;
                    if (command === 'option' && option === 'cancel' && arguments.length === 2) return cancel;
                    if (command === 'option' && option === 'disabled' && arguments.length === 3) {
                        commands.push({ option, value });
                        disabled = value;
                        return;
                    }
                    if (command === 'option' && option === 'items' && arguments.length === 3) {
                        commands.push({ option, value });
                        items = value;
                        return;
                    }
                    if (command === 'option' && option === 'cancel' && arguments.length === 3) {
                        commands.push({ option, value });
                        cancel = value;
                        return;
                    }
                    throw new Error('Unexpected sortable call');
                },
            };
        },
    });
    vm.runInContext(helper, context);
    const applied = vm.runInContext('applyPromptOrderLock(locked)', context);
    return { applied, commands };
}

test('disables SillyTavern sortable when order lock is enabled', () => {
    assert.deepEqual(runLock(true), {
        applied: true,
        commands: [
            { option: 'items', value: '.preset-history-no-sortable-items' },
            { option: 'cancel', value: '#completion_prompt_manager_list *' },
            { option: 'disabled', value: true },
        ],
    });
});

test('re-enables SillyTavern sortable when order lock is disabled', () => {
    assert.deepEqual(runLock(false, {
        disabled: true,
        items: '.preset-history-no-sortable-items',
        cancel: '#completion_prompt_manager_list *',
    }), {
        applied: true,
        commands: [
            { option: 'items', value: '.completion_prompt_manager_prompt_draggable' },
            { option: 'cancel', value: 'input,textarea,button,select,option' },
            { option: 'disabled', value: false },
        ],
    });
});

test('waits safely when the prompt list has not initialized yet', () => {
    assert.deepEqual(runLock(true, { initialized: false }), { applied: false, commands: [] });
});

test('keeps all sortable gates locked when reapplied', () => {
    assert.deepEqual(runLock(true, { disabled: true }), {
        applied: true,
        commands: [
            { option: 'items', value: '.preset-history-no-sortable-items' },
            { option: 'cancel', value: '#completion_prompt_manager_list *' },
            { option: 'disabled', value: true },
        ],
    });
});

function runCancel(locked) {
    const commands = [];
    const context = vm.createContext({
        element: {},
        settings: { lockPromptOrder: locked },
        console,
        jQuery(received) {
            if (received === '#completion_prompt_manager_list') {
                return {
                    length: 1,
                    data() {},
                    sortable(command, option, value) {
                        if (command === 'option' && arguments.length === 2) return undefined;
                        commands.push({ option, value });
                    },
                };
            }
            assert.equal(received, context.element);
            return { sortable(command) { commands.push(command); } };
        },
    });
    vm.runInContext(helper, context);
    const cancelled = vm.runInContext('cancelLockedPromptOrderSort(element, settings)', context);
    return { cancelled, commands };
}

test('cancels any sort that still starts while order is locked', () => {
    assert.deepEqual(runCancel(true), {
        cancelled: true,
        commands: [
            'cancel',
            { option: 'items', value: '.preset-history-no-sortable-items' },
            { option: 'cancel', value: '#completion_prompt_manager_list *' },
            { option: 'disabled', value: true },
        ],
    });
});

test('allows sort completion after the order lock is disabled', () => {
    assert.deepEqual(runCancel(false), { cancelled: false, commands: [] });
});

function detectsDrag({ locked, touchOnly, inList = true, desktopItem, dragHandle, sortableHandle, interactive }) {
    const context = vm.createContext({
        settings: { lockPromptOrder: locked },
        touchOnly,
        target: {
            closest(selector) {
                if (selector === '#completion_prompt_manager_list') return inList ? {} : null;
                if (selector.includes('button')) return interactive ? {} : null;
                if (selector === '.drag-handle, .ui-sortable-handle') return (dragHandle || sortableHandle) ? {} : null;
                if (selector === '.completion_prompt_manager_prompt_draggable, .ui-sortable-handle, .drag-handle') {
                    return (desktopItem || sortableHandle || dragHandle) ? {} : null;
                }
                return null;
            },
        },
    });
    vm.runInContext(utilityHelpers, context);
    return vm.runInContext('isLockedPromptOrderDrag(target, settings, touchOnly)', context);
}

test('hard-blocks desktop drag initiation anywhere on a draggable row', () => {
    assert.equal(detectsDrag({ locked: true, touchOnly: false, desktopItem: true, dragHandle: false }), true);
});

test('hard-blocks mobile drag initiation on the drag handle', () => {
    assert.equal(detectsDrag({ locked: true, touchOnly: true, desktopItem: true, dragHandle: true }), true);
});

test('keeps non-handle mobile controls available while order is locked', () => {
    assert.equal(detectsDrag({ locked: true, touchOnly: true, desktopItem: true, dragHandle: false }), false);
});

test('does not intercept drag events after the order lock is disabled', () => {
    assert.equal(detectsDrag({ locked: false, touchOnly: false, desktopItem: true, dragHandle: true }), false);
});
