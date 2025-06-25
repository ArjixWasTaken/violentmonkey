<template>
  <div class="flex flex-col" @focus="editor?.focus()">
    <div class="editor-code flex-auto" ref="$editorWrapper"/>
    <div class="frame-block editor-search flex" v-show="search.show"
         @keydown.esc.exact.stop="clearSearch">
      <form @submit.prevent="goToLine()">
        <span v-text="i18n('labelLineNumber')"></span>
        <input type="text" class="w-1" v-model="jumpPos">
      </form>
      <form class="flex-1" @submit.prevent="findNext()">
        <span v-text="i18n('labelSearch')"></span>
        <tooltip :content="tooltips.find" class="flex-1">
          <!-- id is required for the built-in autocomplete using entered values -->
          <input
            :class="{ 'is-error': !search.hasResult }"
            :title="search.error"
            type="search"
            id="editor-search"
            ref="$search"
            v-model="search.query"
          />
        </tooltip>
        <tooltip :content="tooltips.findPrev" align="end">
          <button type="button" @click="findNext(1)">&lt;</button>
        </tooltip>
        <tooltip :content="tooltips.findNext" align="end">
          <button type="submit">&gt;</button>
        </tooltip>
      </form>
      <form class="flex-1" @submit.prevent="replace()" v-if="!readOnly">
        <span v-text="i18n('labelReplace')"></span>
        <!-- id is required for the built-in autocomplete using entered values -->
        <input class="flex-1" type="search" id="editor-replace" v-model="search.replace">
        <tooltip :content="tooltips.replace" align="end">
          <button type="submit" v-text="i18n('buttonReplace')"></button>
        </tooltip>
        <tooltip :content="tooltips.replaceAll" align="end">
          <button type="button" v-text="i18n('buttonReplaceAll')" @click="replace(1)"></button>
        </tooltip>
      </form>
      <div>
        <tooltip :content="i18n('searchUseRegex')" align="end">
          <toggle-button v-model="search.options.useRegex">.*</toggle-button>
        </tooltip>
        <tooltip :content="i18n('searchCaseSensitive')" align="end">
          <toggle-button v-model="search.options.caseSensitive">Aa</toggle-button>
        </tooltip>
      </div>
      <tooltip content="Esc" align="end">
        <button @click="clearSearch">&times;</button>
      </tooltip>
    </div>
  </div>
</template>

<script>
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { debounce, i18n, sendCmdDirectly } from '@/common'; // Removed getUniqId
import { objectPick } from '@/common/object'; // Removed deepEqual, forEachEntry
import hookSetting from '@/common/hook-setting';
import options from '@/common/options';

// TODO: Placeholder logic might need these or a new approach
// const CTRL_OPEN = getUniqId('\x02'.repeat(256));
// const CTRL_CLOSE = '\x03'.repeat(256);
// const CTRL_RE = new RegExp(`${CTRL_OPEN}(\\d+)${CTRL_CLOSE}`, 'g');
// const PLACEHOLDER_CLS = 'too-long-placeholder';
// const PLACEHOLDER_SYM = Symbol(PLACEHOLDER_CLS);

// TODO: Reimplement or remove keybinding/command related constants
// const Esc = ' back / cancel / close / singleSelection';

// TODO: Reimplement or remove custom keymap/helpers
// Object.assign(CodeMirror.keyMap.sublime, {
// 'Shift-Ctrl-/': 'commentSelection',
// });
// CodeMirror.registerHelper('hint', 'autoHintWithFallback', (cm, ...args) => {
// const result = cm.getHelper(cm.getCursor(), 'hint')?.(cm, ...args);
// // fallback to anyword if default returns nothing (or no default)
// return result?.list.length ? result : CodeMirror.hint.anyword(cm, ...args);
// });
</script>

<script setup>
import { onBeforeUnmount, onMounted, reactive, ref, watch, watchEffect } from 'vue'; // Removed nextTick
import Tooltip from 'vueleton/lib/tooltip';
import ToggleButton from '@/common/ui/toggle-button';
// import { HINT_OPTIONS } from './code-autocomplete'; // TODO: Reimplement or remove

let editor; // Renamed from cm to editor
// let maxDisplayLength; // TODO: Reassess if needed with Monaco (placeholder related)
// let placeholders = new Map(); // TODO: Reassess if needed with Monaco (placeholder related)
// let placeholderId = 0; // TODO: Reassess if needed with Monaco (placeholder related)

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

const $editorWrapper = ref(); // Renamed from $cmWrapper
const $search = ref(); // This is for the custom search UI, may be removed
const jumpPos = ref(''); // This is for the custom go to line UI, may be removed
const search = reactive({ // This is for the custom search UI, may be removed
  show: false,
  query: '',
  replace: '',
  hasResult: false,
  options: {
    useRegex: false,
    caseSensitive: false,
  },
});
const tooltips = reactive({ // TODO: Reassess if needed with Monaco's command palette / UI
  find: '',
  findPrev: '',
  findNext: '',
  replace: '',
  replaceAll: '',
});
// TODO: Reimplement custom commands using Monaco's action/command system
// const customCommands = Object.assign({
//   // call own methods explicitly to strip `cm` parameter passed by CodeMirror
//   find: () => find(),
//   findNext: () => findNext(),
//   findPrev: () => findNext(1),
//   replace: () => replace(),
//   replaceAll: () => replace(1),
//   autocomplete() {
//     // Monaco has its own autocomplete, trigger via editor.trigger('keyboard', 'editor.action.triggerSuggest')
//   },
//   [Esc]: () => {
//     if (search.show) { // search.show might be removed
//       clearSearch();
//     } else {
//       // Monaco: editor.trigger('keyboard', 'closeFindWidget') or other relevant commands
//     }
//   },
//   commentSelection() {
//     // Monaco: editor.getAction('editor.action.commentLine').run() or editor.getAction('editor.action.blockComment').run()
//   },
//   insertTab() {
//     // Monaco handles tab insertion based on its options
//   },
// }, props.commands);
// const reroutedKeys = {}; // TODO: Reimplement with Monaco's keybinding system

defineExpose({
  get editor() { // Renamed from cm to editor
    return editor;
  },
  getRealContent, // TODO: Reimplement or remove if placeholder logic changes
  // expandKeyMap,   // TODO: Reimplement or remove for Monaco
});

function updateValue(val = props.value) {
  if (editor && editor.getModel()) {
    editor.getModel().setValue(val);
    // TODO: Port clearHistory and markClean if necessary
    // editor.clearHistory();
    // editor.markClean();
  }
}

// TODO: Reimplement placeholder logic if needed for Monaco
// function onBeforeChange(cm, change) {
//   if (createPlaceholders(change)) {
//     cm.on('change', onChange); // triggered before DOM is updated
//     change.update?.(null, null, change.text);
//   }
//   // TODO: remove placeholders that belong to a change beyond `undoDepth`
// }
// function onChange(cm) {
//   cm.off('change', onChange);
//   renderPlaceholders();
// }

// TODO: Reimplement or remove onChanges for dirty state
// function onChanges(cm, [{ origin }]) {
//   // No need to report if changed externally via props.value
//   if (origin !== 'setValue') {
//     emit('code-dirty', !cm.isClean());
//   }
// }

// TODO: Reimplement placeholder logic if needed for Monaco
// function createPlaceholders(change) {
//   const { line, ch } = change.from;
//   let res = false;
//   let len;
//   let prefix;
//   change.text.forEach((textLine, i) => {
//     if (textLine.includes(CTRL_OPEN)) {
//       textLine = getRealContent(textLine);
//     }
//     len = textLine.length - maxDisplayLength;
//     prefix = len > 0 ? textLine.match(/^\s*/)[0] : '';
//     len -= prefix.length;
//     if (len > 0 && len - textLine.match(/\s*$/)[0].length > 0) {
//       res = true;
//       placeholderId += 1;
//       const id = placeholderId;
//       const body = textLine.slice(prefix.length);
//       const replaced = `${CTRL_OPEN}${id}${CTRL_CLOSE}`;
//       placeholders.set(id, {
//         body,
//         el: null,
//         line: line + i,
//         ch: ch + prefix.length,
//         length: replaced.length,
//       });
//       change.text[i] = `${prefix}${replaced}`;
//     }
//   });
//   return res;
// }
// function renderPlaceholders() {
//   placeholders.forEach(p => {
//     if (!p.el) {
//       const { line, ch, body, length } = p;
//       const el = document.createElement('span');
//       const marker = cm.markText({ line, ch }, { line, ch: ch + length }, { replacedWith: el });
//       marker[PLACEHOLDER_SYM] = true;
//       el.className = PLACEHOLDER_CLS;
//       el.title = i18n('editLongLineTooltip');
//       el.textContent = `${body.slice(0, maxDisplayLength)}...[${i18n('editLongLine')}]`;
//       el.onclick = () => {
//         if (!`${window.getSelection()}`) {
//           cm.setCursor(marker.find().from);
//           cm.focus();
//         }
//       };
//       p.el = el;
//     }
//   });
// }

function initializeEditor() {
  // maxDisplayLength = editor.getOption('maxDisplayLength'); // Monaco doesn't have this option directly
  watchEffect(() => editor.updateOptions({ readOnly: props.readOnly }));

  // TODO: Reimplement keybindings and commands
  // editor.addCommand(monaco.KeyCode.Escape, () => { /* ... */ });
  // editor.addCommand(monaco.KeyCode.F1, () => { /* ... */ });
  // editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => { /* ... */ });


  // TODO: Reimplement or remove placeholder logic
  // editor.onDidScrollChange((e) => { /* ... */ }); // For rendering placeholders
  // editor.onDidChangeModelContent((e) => { /* ... */ }); // For creating/updating placeholders

  if (props.value) updateValue();
  emit('ready', editor);
}

function onActive(state) {
  // TODO: Reimplement command handling and focus/blur toggling for custom keybindings
  // const onOff = state ? 'on' : 'off';
  // editor[onOff]('blur', onKeyDownToggler);
  // editor[onOff]('focus', onKeyDownToggler);
  // if (state) {
  //   Object.assign(cmCommands, customCommands);
  // } else {
  //   for (const id in customCommands) {
  //     if (cmCommands[id] === customCommands[id]) {
  //       cmCommands[id] = cmOrigCommands[id];
  //     }
  //   }
  // }
  // onKeyDownToggler(editor, { type: state ? 'blur' : '' });
}

/* reroute hotkeys back to editor when it isn't focused,
   but ignore `window` blur (`evt` param is absent) */
// function onKeyDownToggler(editor, evt) { // TODO: Reimplement
//   if (evt) {
//     document.body::(evt.type === 'blur' ? addEventListener : removeEventListener)(
//       'keydown', onKeyDown);
//   }
// }

// function onKeyDown(e) { // TODO: Reimplement
//   const cmd = reroutedKeys[CodeMirror.keyName(e)];
//   if (cmd && cmCommands[cmd]) {
//     e.preventDefault();
//     e.stopPropagation();
//     editor.trigger('keyboard', cmd); // This is an example, actual API might differ
//   }
// }

// function findFillQuery(force) { // TODO: Adapt for Monaco's find widget - custom UI removed
//   if (!search.query || force) {
//     const selection = editor.getSelection();
//     if (selection && !selection.isEmpty() && selection.startLineNumber === selection.endLineNumber) {
//       const query = editor.getModel().getValueInRange(selection);
//       search.queryFilled = !!query;
//       search.query = query;
//     }
//     search.show = true; // This might be removed if using Monaco's built-in find
//   }
// }

/** @param {VMSearchOptions} opts */
// function doSearch(opts) { // TODO: Adapt for Monaco's find widget - custom UI removed
//   if (!search.query) {
//     search.hasResult = true;
//     return;
//   }
//   const findController = editor.getContribution('editor.contrib.findController');
//   if (opts.reversed) {
//     findController.findPrevious();
//   } else {
//     findController.findNext();
//   }
//   // TODO: Update search.hasResult based on Monaco's find status
// }

/**
 * @param {VMSearchOptions} opts
 * @returns {?true}
 */
// function doSearchInternal({ reversed, wrapAround, pos, reuseCursor } = {}) { // TODO: Remove or heavily adapt
//   const { caseSensitive, useRegex } = search.options;
//   let retry = wrapAround ? 2 : 1;
//   // ...
// }

// async function find() { // TODO: Adapt for Monaco's find widget - custom UI removed for now
//   editor.getAction('actions.find').run(); // Show Monaco's find widget
//   await nextTick();
// }

// function findNext(reversed) { // TODO: Adapt for Monaco's find widget - custom UI removed for now
//   const findController = editor.getContribution('editor.contrib.findController');
//   if (reversed) {
//     findController.findPrevious();
//   } else {
//     findController.findNext();
//   }
// }

// function clearSearch() { // TODO: Adapt for Monaco's find widget - custom UI removed for now
//   search.show = false; // This UI might be removed
//   editor.getAction('closeFindWidget').run();
//   editor.focus();
// }

// function replace(all) { // TODO: Adapt for Monaco's find widget - custom UI removed for now
//   if (props.readOnly) return;
//   const findController = editor.getContribution('editor.contrib.findController');
//   if (!search.query || !search.show) { // search.show might be removed
//     editor.getAction('editor.action.startFindReplaceAction').run();
//     return;
//   }
//   if (all) {
//     findController.replaceAll();
//   } else {
//     findController.replace();
//   }
// }

/** Centers the selection if it's outside of viewport so the surrounding context is visible */
// function reveal(from, to) { // Monaco handles scrolling automatically in most cases. `revealRangeInCenter` can be used.
//   editor.revealRangeInCenterIfOutsideViewport(new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column));
// }

function goToLine() { // This function is tied to the custom search UI, which is being removed/reassessed
  let [line, ch] = jumpPos.value.split(':').map(Number) || [];
  if (line) {
    ch = ch || 1; // Monaco lines are 1-indexed
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: ch });
    search.show = false; // This UI might be removed
    editor.focus();
  }
}

function onCopy(e) { // Monaco handles copy internally, but if getRealContent is needed:
  const sel = editor.getModel().getValueInRange(editor.getSelection());
  if (!sel) return;
  const text = getRealContent(sel); // Ensure getRealContent is adapted or this is removed
  e.clipboardData.setData('text', text);
  e.preventDefault();
  e.stopImmediatePropagation();
}

function getRealContent(text) { // TODO: Reimplement or remove placeholder logic
  if (text == null) {
    // text = killTrailingSpaces(editor, placeholders); // killTrailingSpaces needs to be adapted for Monaco
    text = editor?.getValue() || ''; // Basic version, ensure editor exists
  }
  // TODO: Adapt placeholder logic if it's kept
  // if (placeholders.size) {
  //   text = text.replace(CTRL_RE, (_, id) => placeholders.get(+id)?.body || '');
  // }
  return text;
}

// function expandKeyMap(res, ...maps) { // TODO: Reimplement for Monaco's keybinding system
//   // ... (Monaco uses a different keybinding system)
//   return res;
// }

watch(() => props.active, onActive); // TODO: Reimplement onActive
watch(() => props.mode, value => {
  if (editor && editor.getModel()) {
    monaco.editor.setModelLanguage(editor.getModel(), value || 'javascript');
  }
});
watch(() => props.value, updateValue);

onMounted(() => {
  let userOpts = options.get('editor');
  const theme = options.get('editorThemeName') || 'vs'; // Default to 'vs' for Monaco
  const internalOpts = props.cmOptions || {}; // These will need to be mapped to Monaco options

  // TODO: Map CodeMirror options to Monaco options
  const monacoOptions = {
    value: props.value,
    language: props.mode || userOpts.mode || 'javascript',
    theme: theme,
    readOnly: props.readOnly,
    automaticLayout: true,
    // Common options to port:
    lineNumbers: userOpts.lineNumbers ? 'on' : 'off', // Example mapping
    // foldGutter: userOpts.foldGutter, // Monaco: folding, showFoldingControls
    // gutters: ..., // Monaco: lineNumbers, glyphMargin, etc.
    // matchBrackets: userOpts.matchBrackets, // Monaco: matchBrackets
    // autoCloseBrackets: userOpts.autoCloseBrackets, // Monaco: autoClosingBrackets
    // highlightSelectionMatches: userOpts.highlightSelectionMatches, // Monaco: selectionHighlight
    // keyMap: 'sublime', // Monaco has some presets, or manual keybindings
    // maxDisplayLength: ..., // Monaco: maxTokenizationLineLength (for performance, not display)
    // --- Monaco specific or equivalents ---
    folding: !!userOpts.foldGutter,
    showFoldingControls: userOpts.foldGutter ? 'always' : 'never',
    glyphMargin: !!userOpts.foldGutter, // For folding markers
    minimap: {
      enabled: userOpts.minimap !== undefined ? userOpts.minimap : true, // Example: assuming a new option
    },
    wordWrap: userOpts.lineWrapping ? 'on' : 'off', // Example mapping for lineWrapping
    // Trailing spaces
    "renderWhitespace": userOpts.showTrailingSpace ? "boundary" : "none", // Example
    "trimAutoWhitespace": userOpts.killTrailingSpaceOnSave !== undefined ? userOpts.killTrailingSpaceOnSave : true, // Example
    // Autocomplete
    quickSuggestions: userOpts.autocompleteOnTyping !== undefined ? userOpts.autocompleteOnTyping : true, // Example
    suggestOnTriggerCharacters: userOpts.autocompleteOnTyping !== undefined ? userOpts.autocompleteOnTyping : true, // Example
    ...internalOpts, // Mapped internal options
  };

  editor = monaco.editor.create($editorWrapper.value, monacoOptions);
  initializeEditor();
  onActive(true); // DANGER! Must precede expandKeyMap. // TODO: Reassess expandKeyMap

  // TODO: Reimplement keybinding tooltips and reroutedKeys
  // expandKeyMap()::forEachEntry(([key, cmd]) => {
  //   if (cmd in tooltips) {
  //     tooltips[cmd] += `${tooltips[cmd] ? ', ' : ''}${key}`;
  //     reroutedKeys[key] = cmd;
  //   }
  // });

  // TODO: Reimplement tab insertion logic if needed
  // if (!opts.tabSize) editor.options.tabSize = editor.options.indentUnit;

  $editorWrapper.value::addEventListener('copy', onCopy); // May not be needed if getRealContent is removed

  hookSetting('editor', (newUserOpts) => {
    const newMonacoOpts = {};
    // TODO: Map newUserOpts to Monaco options and update editor.updateOptions(newMonacoOpts)
    // Example:
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
    // ... map other options ...
    editor.updateOptions(newMonacoOpts);
    userOpts = newUserOpts;
  });

  sendCmdDirectly('Storage', ['base', 'getOne', 'editorSearch']).then(prev => {
    const saveSearchLater = debounce(() => {
      sendCmdDirectly('Storage', ['base', 'setOne', 'editorSearch',
        objectPick(search, ['query', 'replace', 'options'])]);
    }, 500);
    const searchAgain = () => { // TODO: Adapt for Monaco
      saveSearchLater();
      // doSearch({ pos: 'from' });
      if (search.query && editor.getContribution('editor.contrib.findController').getState().searchString !== search.query) {
        editor.getContribution('editor.contrib.findController').setSearchString(search.query);
      }
      // This might trigger search automatically or require findNext()
    };
    if (prev) Object.assign(search, prev);
    watch(() => search.query, () => {
      if (!search.queryFilled) searchAgain();
      else search.queryFilled = null;
    });
    watch(() => search.options, searchAgain, { deep: true }); // TODO: connect search.options to Monaco find widget
    watch(() => search.replace, saveSearchLater); // TODO: connect search.replace to Monaco find widget
  });

  hookSetting('editorThemeName', val => {
    if (val != null && val !== editor.getOption(monaco.editor.EditorOption.theme)) {
      monaco.editor.setTheme(val);
    }
  });
  updateValue();
});

onBeforeUnmount(() => {
  onActive(false); // TODO: Reimplement
  if (editor) {
    editor.dispose();
  }
});
</script>

<style>
$selectionBg: #d7d4f0; /* copied from codemirror.css */
$selectionDarkBg: rgba(80, 75, 65, .99);

/* compatible with old browsers, e.g. Maxthon 4.4, Chrome 50- */
.editor-code.flex-auto {
  position: relative;
  > div {
    position: absolute;
    width: 100%;
  }
}

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

.too-long-placeholder {
  font-style: italic;
}

/* CodeMirror show-hints fix to work here */
.CodeMirror-hints {
  z-index: 9999;
}

/* fix contenteditable selection color bug */
.CodeMirror .CodeMirror-line {
  ::selection {
    background: $selectionBg;
  }
  /* must be used separately otherwise the entire rule is ignored in Chrome */
  ::-moz-selection {
    background: $selectionBg;
  }
}

.cm-matchhighlight {
  background-color: hsla(168, 100%, 50%, 0.15);
}
.cm-trailingspace {
  background: radial-gradient(cornflowerblue, transparent 1px) 0 50% / 1ch 1ch repeat-x;
}
div.CodeMirror span.CodeMirror-matchingbracket { /* the same selector used in codemirror.css */
  color: unset;
  background-color: hsla(102, 80%, 50%, 0.3);
}
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
      /* must be used separately otherwise the entire rule is ignored in Chrome */
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
    .cm-atom {
      color: #ae81ff;
    }
    .cm-number {
      color: #ae81ff;
    }
    .cm-comment.cm-attribute {
      color: #97b757;
    }
    .cm-comment.cm-def {
      color: #bc9262;
    }
    .cm-comment.cm-tag {
      color: #bc6283;
    }
    .cm-comment.cm-type {
      color: #5998a6;
    }
    .cm-property,
    .cm-attribute {
      color: #a6e22e;
    }
    .cm-keyword {
      color: #f92672;
    }
    .cm-builtin {
      color: #66d9ef;
    }
    .cm-string {
      color: #e6db74;
    }
    .cm-string-2 {
      color: #bcb149;
    }
    .cm-string-2.cm-regexp {
      color: #ff00f7;
    }
    .cm-variable {
      color: #f8f8f2;
    }
    .cm-variable-2 {
      color: #9effff;
    }
    .cm-variable-3,
    .cm-type {
      color: #66d9ef;
    }
    .cm-def {
      color: #fd971f;
    }
    .cm-bracket {
      color: #f8f8f2;
    }
    .cm-tag {
      color: #f92672;
    }
    .cm-header {
      color: #ae81ff;
    }
    .cm-link {
      color: #ae81ff;
    }
    .cm-error {
      color: #f8f8f0;
      background: #f92672;
    }
    .cm-operator {
      color: #999
    }
  }
}
</style>
