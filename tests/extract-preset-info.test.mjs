import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../index.js', import.meta.url), 'utf8');
const helpers = source
    .slice(0, source.indexOf('function saveSnapshot'))
    .replace(/^import .*;\r?\n/gm, '');

function extract(body, jQuery = () => {
    throw new Error('DOM fallback should not be used');
}) {
    const context = vm.createContext({
        body,
        jQuery,
        structuredClone,
        console,
    });
    vm.runInContext(helpers, context);
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
