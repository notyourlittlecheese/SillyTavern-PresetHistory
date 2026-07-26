import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../index.js', import.meta.url), 'utf8');
const helpers = source
    .slice(0, source.indexOf('function installFetchInterceptor'))
    .replace(/^import .*;\r?\n/gm, '');

function makeContext(body, jQuery = () => {
    throw new Error('DOM fallback should not be used');
}) {
    const extension_settings = {};
    const context = vm.createContext({
        body,
        jQuery,
        structuredClone,
        console,
        extension_settings,
        saveSettingsDebounced() {},
    });
    vm.runInContext(helpers, context);
    return { context, extension_settings };
}

function extract(body, jQuery) {
    const { context } = makeContext(body, jQuery);
    return vm.runInContext('extractPresetInfo(body)', context);
}

test('uses the request name for a copied preset before the select changes', () => {
    const preset = {
        prompts: [{ identifier: 'main', content: 'copied preset' }],
        prompt_order: [{ character_id: 100001, order: [] }],
        temp_openai: 1,
    };

    const result = extract({
        preset,
        name: 'My Preset - copy',
        apiId: 'openai',
    });

    assert.equal(result.name, 'My Preset - copy');
    assert.deepEqual(result.data, preset);
});

test('keeps suffix-only preset names in separate history keys', () => {
    const preset = { prompts: [], prompt_order: [] };
    const original = extract({ preset, name: 'Roleplay', apiId: 'openai' });
    const copy = extract({ preset, name: 'Roleplay-v2', apiId: 'openai' });

    assert.notEqual(original.name, copy.name);
    assert.equal(original.name, 'Roleplay');
    assert.equal(copy.name, 'Roleplay-v2');
});

test('ignores save requests for non-OpenAI preset types', () => {
    const result = extract({
        preset: { name: 'Context Template', story_string: '{{char}}' },
        name: 'Context Template',
        apiId: 'context',
    }, () => ({ length: 0 }));

    assert.equal(result, null);
});

test('skips a nameless save instead of merging it into a shared fallback history', () => {
    const result = extract({
        oai_settings: { prompts: [], prompt_order: [] },
    }, () => ({ length: 0 }));

    assert.equal(result, null);
});

test('stores identical original and copied presets in separate history arrays', () => {
    const preset = {
        prompts: [{ identifier: 'main', content: 'same content' }],
        prompt_order: [{ character_id: 100001, order: [] }],
    };
    const { context, extension_settings } = makeContext(null);
    context.originalBody = { preset, name: 'Roleplay', apiId: 'openai' };
    context.copyBody = { preset, name: 'Roleplay-v2', apiId: 'openai' };

    vm.runInContext(`
        var originalInfo = extractPresetInfo(originalBody);
        var copyInfo = extractPresetInfo(copyBody);
        saveSnapshot(originalInfo.name, originalInfo.data, 'auto', 'first');
        saveSnapshot(copyInfo.name, copyInfo.data, 'auto', 'first');
    `, context);

    const histories = extension_settings['preset-history'].snapshots;
    assert.deepEqual(Object.keys(histories).sort(), ['Roleplay', 'Roleplay-v2']);
    assert.equal(histories.Roleplay.length, 1);
    assert.equal(histories['Roleplay-v2'].length, 1);
    assert.notStrictEqual(histories.Roleplay, histories['Roleplay-v2']);
});

test('still supports legacy settings save bodies', () => {
    const data = {
        prompts: [],
        prompt_order: [],
        temp_openai: 1,
        top_p_openai: 1,
        freq_pen_openai: 0,
    };
    const result = extract({
        preset_settings_openai: 'Legacy Preset',
        oai_settings: data,
    });

    assert.equal(result.name, 'Legacy Preset');
    assert.deepEqual(result.data, data);
});
