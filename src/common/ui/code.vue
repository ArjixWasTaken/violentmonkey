<template>
  <div class="flex flex-col" @focus="editor?.focus()">
    <div class="editor-code flex-auto" ref="$editorWrapper"/>
    <!-- Custom search UI removed in favor of Monaco's built-in find widget (Ctrl+F) -->
  </div>
</template>

<script>
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { debounce, i18n, sendCmdDirectly } from '@/common'; // Removed getUniqId
import { objectPick } from '@/common/object'; // Removed deepEqual, forEachEntry
import hookSetting from '@/common/hook-setting';
import options from '@/common/options';

// TODO: Placeholder logic might need these or a new approach
</script>

<script setup>
import { onBeforeUnmount, onMounted, reactive, ref, watch, watchEffect } from 'vue';
import Tooltip from 'vueleton/lib/tooltip';
import ToggleButton from '@/common/ui/toggle-button';
import { language as userjsLanguage, conf as userjsConf } from './userjs-monarch';

let editor;

// Register UserJS language if not already registered
if (!monaco.languages.getLanguages().some(lang => lang.id === 'userjs')) {
  monaco.languages.register({ id: 'userjs' });
  monaco.languages.setMonarchTokensProvider('userjs', userjsLanguage);
  monaco.languages.setLanguageConfiguration('userjs', userjsConf);
}

const props = defineProps({
  active: Boolean,
  readOnly: {
    type: Boolean,
    default: false,
  },
  value: {
    type: String,
    default: '',
  },
  mode: String,
  commands: {
    type: Object,
    default: null,
  },
  cmOptions: Object,
});
const emit = defineEmits(['code-dirty', 'ready']);

const $editorWrapper = ref();

// jumpPos, search, and tooltips related to custom search UI are removed.
// Monaco's find widget (Ctrl+F) will be used.
// Tooltips for any new custom commands can be added if necessary.

defineExpose({
  get editor() {
    return editor;
  },
  getRealContent,
});

function updateValue(val = props.value) {
  if (editor && editor.getModel()) {
    editor.getModel().setValue(val);
  }
}

function initializeEditor() {
  watchEffect(() => editor.updateOptions({ readOnly: props.readOnly }));

  if (props.commands) {
    if (props.commands.save) {
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        props.commands.save();
      });
    }
    // props.commands.close is typically handled by the parent component (e.g., via an Esc key on a modal or panel).
    // Binding it directly to Escape in the editor can conflict with Monaco's internal Escape handling
    // (e.g., closing find widget, suggestions).
    // if (props.commands.close) {
    //   editor.addCommand(monaco.KeyCode.Escape, () => {
    //     props.commands.close();
    //   }, '!findWidgetVisible && !suggestWidgetVisible');
    // }
  }

  if (props.value) updateValue();
  emit('ready', editor);
}

function onActive(state) {
  // This function is now a stub, as CodeMirror-specific logic was removed.
  // If there's Monaco-specific activation/deactivation logic, it should go here.
}

// goToLine function removed as it was part of the custom search UI.
// Monaco has built-in "Go to Line/Column..." (Ctrl+G).

function onCopy(e) {
  const sel = editor.getModel().getValueInRange(editor.getSelection());
  if (!sel) return;
  const text = getRealContent(sel);
  e.clipboardData.setData('text', text);
  e.preventDefault();
  e.stopImmediatePropagation();
}

function getRealContent(text) {
  if (text == null) {
    text = editor?.getValue() || '';
  }
  return text;
}

watch(() => props.active, onActive);
watch(() => props.mode, value => {
  if (editor && editor.getModel()) {
    monaco.editor.setModelLanguage(editor.getModel(), value || 'javascript');
  }
});
watch(() => props.value, updateValue);

onMounted(() => {
  let userOpts = options.get('editor');
  const theme = options.get('editorThemeName') || 'vs'; // Default to 'vs' for Monaco
  const internalOpts = props.cmOptions || {}; // These will be mapped to Monaco options

  const monacoOptions = {
    value: props.value,
    language: props.mode || userOpts.mode || 'javascript',
    theme: theme,
    readOnly: props.readOnly,
    automaticLayout: true,
    lineNumbers: userOpts.lineNumbers ? 'on' : 'off',
    folding: !!userOpts.foldGutter,
    showFoldingControls: userOpts.foldGutter ? 'always' : 'never',
    glyphMargin: !!userOpts.foldGutter,
    minimap: {
      enabled: userOpts.minimap !== undefined ? userOpts.minimap : true,
    },
    wordWrap: userOpts.lineWrapping ? 'on' : 'off',
    renderWhitespace: userOpts.showTrailingSpace ? "boundary" : "none",
    trimAutoWhitespace: userOpts.killTrailingSpaceOnSave !== undefined ? userOpts.killTrailingSpaceOnSave : true,
    quickSuggestions: userOpts.autocompleteOnTyping !== undefined ? userOpts.autocompleteOnTyping : true,
    suggestOnTriggerCharacters: userOpts.autocompleteOnTyping !== undefined ? userOpts.autocompleteOnTyping : true,
    matchBrackets: userOpts.matchBrackets ? 'always' : 'never', // Example mapping
    autoClosingBrackets: userOpts.autoCloseBrackets ? 'languageDefined' : 'never', // Example mapping
    selectionHighlight: !!userOpts.highlightSelectionMatches, // Example mapping
    ...internalOpts, // Spread mapped internalOpts if any specific Monaco ones are needed
  };

  editor = monaco.editor.create($editorWrapper.value, monacoOptions);
  initializeEditor();
  onActive(true);

  $editorWrapper.value::addEventListener('copy', onCopy);

  hookSetting('editor', (newUserOpts) => {
    const newMonacoOpts = {};
    if (newUserOpts.lineNumbers !== undefined) newMonacoOpts.lineNumbers = newUserOpts.lineNumbers ? 'on' : 'off';
    if (newUserOpts.lineWrapping !== undefined) newMonacoOpts.wordWrap = newUserOpts.lineWrapping ? 'on' : 'off';
    if (newUserOpts.foldGutter !== undefined) {
        newMonacoOpts.folding = !!newUserOpts.foldGutter;
        newMonacoOpts.showFoldingControls = newUserOpts.foldGutter ? 'always' : 'never';
        newMonacoOpts.glyphMargin = !!newUserOpts.foldGutter;
    }
    if (newUserOpts.showTrailingSpace !== undefined) newMonacoOpts.renderWhitespace = newUserOpts.showTrailingSpace ? "boundary" : "none";
    if (newUserOpts.killTrailingSpaceOnSave !== undefined) newMonacoOpts.trimAutoWhitespace = newUserOpts.killTrailingSpaceOnSave;
    if (newUserOpts.autocompleteOnTyping !== undefined) {
        newMonacoOpts.quickSuggestions = newUserOpts.autocompleteOnTyping;
        newMonacoOpts.suggestOnTriggerCharacters = newUserOpts.autocompleteOnTyping;
    }
    if (newUserOpts.matchBrackets !== undefined) newMonacoOpts.matchBrackets = newUserOpts.matchBrackets ? 'always' : 'never';
    if (newUserOpts.autoCloseBrackets !== undefined) newMonacoOpts.autoClosingBrackets = newUserOpts.autoCloseBrackets ? 'languageDefined' : 'never';
    if (newUserOpts.highlightSelectionMatches !== undefined) newMonacoOpts.selectionHighlight = !!newUserOpts.highlightSelectionMatches;

    editor.updateOptions(newMonacoOpts);
    userOpts = newUserOpts;
  });

  // Removed custom search persistence logic. Monaco's find widget has its own persistence if any.

  hookSetting('editorThemeName', val => {
    if (val != null && val !== editor.getOption(monaco.editor.EditorOption.theme)) {
      monaco.editor.setTheme(val);
    }
  });
  updateValue();
});

onBeforeUnmount(() => {
  onActive(false);
  if (editor) {
    editor.dispose();
  }
});
</script>

<style>
/* compatible with old browsers, e.g. Maxthon 4.4, Chrome 50- */
.editor-code.flex-auto {
  position: relative;
  > div {
    position: absolute;
    width: 100%;
  }
}

/* Custom search UI styles removed. */
/*
.editor-search {
  white-space: pre;
  flex-wrap: wrap; // wrap fields in a narrow window
  > form,
  > div {
    display: flex;
    align-items: center;
    margin-right: .5rem;
  }
  @supports (field-sizing: content) {
    input {
      field-sizing: content;
      min-width: 3ch;
      width: auto;
    }
  }
  span > input { // a tooltip'ed input
    width: 100%;
  }
  .is-error, .is-error:focus {
    border-color: #e85600;
    background: #e8560010;
  }
}
*/

/* Styles previously for CodeMirror that might be adaptable or are superceded by Monaco's own styling */
/*
.too-long-placeholder {
  font-style: italic;
}
*/

/* Monaco's suggest widget (autocomplete) handles its own z-indexing and styling. */
/*
.CodeMirror-hints {
  z-index: 9999;
}
*/

/* Monaco handles selection styling. Custom selection styling might still be desired. */
/*
.CodeMirror .CodeMirror-line {
  ::selection {
    background: $selectionBg;
  }
  ::-moz-selection {
    background: $selectionBg;
  }
}
*/

/* Monaco has its own match highlighting. */
/*
.cm-matchhighlight {
  background-color: hsla(168, 100%, 50%, 0.15);
}
*/

/* Monaco handles trailing space rendering via options. */
/*
.cm-trailingspace {
  background: radial-gradient(cornflowerblue, transparent 1px) 0 50% / 1ch 1ch repeat-x;
}
*/

/* Monaco handles bracket matching. */
/*
div.CodeMirror span.CodeMirror-matchingbracket {
  color: unset;
  background-color: hsla(102, 80%, 50%, 0.3);
}
*/

/* Theme-specific syntax highlighting is handled by Monaco themes. */
/*
.cm-s-default {
  .cm-comment {
    color: #918982;
  }
  .cm-string-2 { // template literal: `example`
    color: #870;
  }
  .cm-string-2.cm-regexp {
    color: #d60;
  }
}
*/

/* Dark theme adjustments are handled by Monaco themes (e.g., 'vs-dark'). */
/*
@media (prefers-color-scheme: dark) {
  .cm-matchhighlight {
    background-color: hsla(40, 100%, 50%, 0.1);
    border-bottom-color: hsla(40, 100%, 50%, 0.25);
  }
  .CodeMirror-hints {
    background: var(--bg);
  }
  .CodeMirror-hint {
    color: var(--fg);
  }
  li.CodeMirror-hint-active {
    background: var(--fg);
    color: var(--bg);
  }
  .CodeMirror {
    color: var(--fg);
    background: var(--bg);
    & &-scrollbar-filler,
    & &-gutter-filler {
      background: none;
    }
    & &-gutters {
      border-color: var(--fill-2);
      background-color: var(--fill-0-5);
    }
    & &-selected {
      background: $selectionDarkBg;
    }
    & &-line {
      ::selection {
        background: $selectionDarkBg;
      }
      ::-moz-selection {
        background: $selectionDarkBg;
      }
    }
    & &-guttermarker {
      color: white;
      &-subtle {
        color: #d0d0d0;
      }
    }
    & &-linenumber {
      color: #666;
    }
    & &-cursor {
      border-color: #f8f8f0;
    }
    & &-activeline-background {
      background: #1a1a1a;
    }
    & &-matchingbracket {
      outline: none;
      background: #444;
      color: yellow !important;
    }
  }
  .cm-s-default {
    // mostly copied from Monokai theme
    .cm-comment {
      color: #75715e;
    }
    // ... many other theme specific rules
  }
}
*/
</style>
