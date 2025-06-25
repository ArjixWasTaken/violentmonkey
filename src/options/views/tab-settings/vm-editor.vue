<template>
  <section ref="$el">
    <h3 v-text="i18n('labelEditor')"></h3>
    <div class="mb-1 mr-1c flex center-items">
      <span v-text="i18n('labelTheme')"/>
      <select v-model="theme">
        <option :value="DEFAULT_THEME" v-text="i18n('labelRunAtDefault')"/>
        <!-- <option value="" v-text="i18n('labelBadgeNone')"/> removed as Monaco themes are always set -->
        <option v-for="name in MONACO_THEMES" :key="name" :value="name" v-text="name"/>
      </select>
      <!-- Removed link to CodeMirror themes and error display related to fetching them -->
      <!-- <a :href="ghURL" target="_blank">&nearr;</a> -->
      <!-- <p v-text="error"/> -->
    </div>
    <p class="my-1" v-html="i18n('descEditorOptions')"/>
    <setting-text name="editor" json has-reset @dblclick="toggleBoolean">
      <a class="ml-1" tabindex="0" @click="info = !info">
        <icon name="info"/>
      </a>
      <label class="btn-ghost" style="border:none">
        <input type="checkbox" v-model="hintShown">
        <span v-text="i18n('buttonShowEditorState')"/>
      </label>
    </setting-text>
    <template v-if="info">
      <p class="mt-1" v-html="i18n('descEditorOptionsGeneric')"/>
      <p class="mt-1" v-html="i18n('descEditorOptionsVM')"/>
    </template>
    <pre v-text="hint" class="monospace-font dim-hint" />
  </section>
</template>

<script>
// Monaco themes are typically 'vs', 'vs-dark', 'hc-black'. Custom themes can be added.
// We'll simplify the theme selection to these, or allow users to specify one if they know how to add it.
// For now, removing the dynamic fetching of CodeMirror themes.
const keyThemeNAME = 'editorThemeName';
const DEFAULT_THEME = 'vs'; // Default Monaco theme
const MONACO_THEMES = ['vs', 'vs-dark', 'hc-black']; // Standard Monaco themes

// The concept of fetching CSS for themes is not directly applicable to Monaco in the same way.
// Monaco themes are self-contained or loaded via its loader.
// So, keyThemeCSS and related logic (fetchUrl, makeTextPreview for CSS) are removed.
</script>

<script setup>
import options from '@/common/options';
import hookSetting from '@/common/hook-setting';
// import { getActiveElement } from '@/common/ui'; // Not used after removing fetchUrl
import SettingText from '@/common/ui/setting-text';
import { nextTick, onMounted, ref, watch } from 'vue';
import Icon from '@/common/ui/icon';
import { toggleBoolean } from "@/options/utils";
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'; // For Monaco editor options

const $el = ref();
const hint = ref();
const hintShown = ref(false);
const info = ref();
// const busy = ref(); // No longer fetching themes
// const error = ref(); // No longer fetching themes
// const themeCss = ref(); // Monaco themes don't have separate CSS previews in this manner
const theme = ref();

onMounted(async () => {
  await options.ready;
  let fromHook;
  watch(hintShown, toggleStateHint);
  watch(theme, async val => {
    if (fromHook) {
      fromHook = false;
      return;
    }
    // With Monaco, theme is just a string name. Setting it in options will be picked up by code.vue
    options.set(keyThemeNAME, val || DEFAULT_THEME);
  });
  hookSetting(keyThemeNAME, val => {
    const newTheme = val || DEFAULT_THEME;
    if (theme.value != newTheme) {
      fromHook = true;
      theme.value = newTheme;
    }
  });
  // No longer need to watch/set themeCss
});

// fetchUrl is removed as it was for CodeMirror theme CSS.

async function toggleStateHint(curValue) {
  let res;
  if (curValue) {
    // Monaco editor options are structured differently.
    // This is a simplified representation. For a full list, refer to Monaco's IEditorOptions.
    // We'll show the currently configured options from `options.get('editor')`
    // and some common Monaco defaults for context if needed.
    const editorOpts = options.get('editor') || {};
    const monacoSpecificDefaults = { // A few examples, not exhaustive
        // These are often derived from userOpts in code.vue, so showing them here might be redundant
        // or could show the base defaults before user overrides.
        // For simplicity, just showing the user's current settings.
    };

    const combinedOptions = {
        ...monacoSpecificDefaults, // Show some Monaco defaults first
        ...editorOpts, // Then user's overrides
    };

    // Filter out complex objects or functions for readability if necessary
    const simplifiedOpts = {};
    Object.entries(combinedOptions)
        .sort(([a], [b]) => (a < b ? -1 : a > b))
        .forEach(([key, val]) => {
            if (typeof val !== 'function' && (typeof val !== 'object' || val === null || Array.isArray(val))) {
                simplifiedOpts[key] = val;
            } else if (typeof val === 'object' && key === 'minimap') { // specifically include minimap object
                 simplifiedOpts[key] = val;
            }
        });
    res = JSON.stringify(simplifiedOpts, null, '  ');
  }
  hint.value = res;
  if (res) {
    await nextTick();
    if ($el.value.getBoundingClientRect().bottom > innerHeight) {
      $el.value.scrollIntoView({ behavior: 'smooth' });
    }
  }
}
</script>

<style>
  .dim-hint {
    font-size: .85rem;
    color: var(--fill-8);
  }
</style>
