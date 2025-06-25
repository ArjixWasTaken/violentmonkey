// Monarch language definition for UserScript headers.
// This is a simplified conversion from the TextMate grammar:
// https://github.com/kufii/vscode-userscript/blob/master/syntaxes/userjs.tmLanguage.json

export const conf = {
  comments: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: "'", close: "'", notIn: ['string', 'comment'] },
    { open: '"', close: '"', notIn: ['string', 'comment'] },
    { open: '`', close: '`', notIn: ['string', 'comment'] },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '<', close: '>' },
    { open: "'", close: "'" },
    { open: '"', close: '"' },
    { open: '`', close: '`' },
  ],
};

export const language = {
  defaultToken: 'invalid',
  tokenPostfix: '.userjs', // Will be appended to token types, e.g., 'comment.userjs'

  keywords: [
    // JavaScript keywords are typically handled by the underlying JS/TS Monarch definition
    // when this is used as an injection. For a standalone 'userjs' language,
    // they might need to be listed here if not embedding within JS.
    // For now, focusing on the UserScript header.
  ],

  tokenizer: {
    root: [
      // UserScript header block
      [/^\/\/\s*==UserScript==/, { token: 'comment.doc.tag', next: '@userscriptHeader' }],
      [/^\/\/\s*==\/UserScript==/, { token: 'comment.doc.tag', next: '@pop' }], // Should pop from @userscriptHeader

      // Include JavaScript tokenization for the rest of the file
      // This assumes we are defining a standalone 'userjs' language.
      // If injecting, this part might be different or unnecessary.
      { include: '@javascript' },
    ],

    userscriptHeader: [
      // Match various @-rules. Order can be important.
      // More specific matches should come before general ones.

      // @name, @author, @description, @nocompat, @license, @copyright
      [/^(\/\/\s*)([@](?:name(?::\w+)?|author|description|nocompat|license|copyright))(\s+)(.*)/, [
        'comment.doc', // '// '
        'comment.doc.tag', // '@rule'
        'comment.doc', // ' '
        'comment.doc.string', // rest of the line
      ]],

      // @grant
      [/^(\/\/\s*)([@]grant)(\s+)(.*)/, [
        'comment.doc', // '// '
        'comment.doc.tag', // '@grant'
        'comment.doc', // ' '
        { token: '@rematch', next: '@grantValues' } // Process grant values specifically
      ]],

      // @run-at
      [/^(\/\/\s*)([@]run-at)(\s+)(.*)/, [
        'comment.doc',
        'comment.doc.tag',
        'comment.doc',
        { token: '@rematch', next: '@runAtValues'}
      ]],

      // @inject-into
      [/^(\/\/\s*)([@]inject-into)(\s+)(.*)/, [
        'comment.doc',
        'comment.doc.tag',
        'comment.doc',
        { token: '@rematch', next: '@injectIntoValues'}
      ]],

      // URLs: @namespace, @homepage, @homepageURL, @website, @source, @icon, @iconURL, @defaulticon, @icon64, @icon64URL, @updateURL, @downloadURL, @supportURL, @require, @connect
      [/^(\/\/\s*)([@](?:namespace|homepage(?:URL)?|website|source|icon(?:URL)?|defaulticon|icon64(?:URL)?|updateURL|downloadURL|supportURL|require|connect))(\s+)(.*)/, [
        'comment.doc',
        'comment.doc.tag',
        'comment.doc',
        'comment.doc.uri', // The URL part
      ]],

      // @version
      [/^(\/\/\s*)([@]version)(\s+)(.*)/, [
        'comment.doc',
        'comment.doc.tag',
        'comment.doc',
        'comment.doc.version', // Version string
      ]],

      // @match, @include, @exclude (these might need glob/regex patterns)
      // For simplicity, treating the rest of the line as a string for now.
      // A more advanced version would parse globs.
      [/^(\/\/\s*)([@](?:match|include|exclude))(\s+)(.*)/, [
        'comment.doc',
        'comment.doc.tag',
        'comment.doc',
        'comment.doc.string', // Pattern string
      ]],

      // @resource name URL
      [/^(\/\/\s*)([@]resource)(\s+)([\w-]+)(\s+)(.*)/, [
        'comment.doc',        // '// '
        'comment.doc.tag',    // '@resource'
        'comment.doc',        // ' '
        'comment.doc.symbol', // resource name
        'comment.doc',        // ' '
        'comment.doc.uri',    // resource URL
      ]],

      // @noframes, @unwrap (no value)
      [/^(\/\/\s*)([@](?:noframes|unwrap))(\s*.*)/, [
        'comment.doc',
        'comment.doc.tag',
        'comment.doc.string', // any trailing part
      ]],

      // Any other line within the UserScript header block
      [/^\/\/.*/, 'comment.doc'],

      // End of UserScript header
      [/^\/\/\s*==\/UserScript==/, { token: 'comment.doc.tag', next: '@pop' }],
    ],

    grantValues: [
      [/\b(none|unsafeWindow|window\.close|window\.focus|GM_addStyle|GM_deleteValue|GM_listValues|GM_addValueChangeListener|GM_removeValueChangeListener|GM_setValue|GM_getValue|GM_log|GM_getResourceText|GM_getResourceURL|GM_registerMenuCommand|GM_unregisterMenuCommand|GM_openInTab|GM_xmlhttpRequest|GM_download|GM_getTab|GM_saveTab|GM_getTabs|GM_notification|GM_setClipboard|GM_info)\b/, 'comment.doc.constant'],
      [/[\s,]+/, 'comment.doc'], // separators
      [/.$/, 'comment.doc.string', '@pop'], // End of line, pop back to userscriptHeader
      [/.*/, 'comment.doc.string'], // Catch all for the rest of the line
    ],

    runAtValues: [
        [/\b(document-start|document-body|document-end|document-idle|context-menu)\b/, 'comment.doc.constant'],
        [/.$/, 'comment.doc.string', '@pop'],
        [/.*/, 'comment.doc.string'],
    ],

    injectIntoValues: [
        [/\b(page|content|auto)\b/, 'comment.doc.constant'],
        [/.$/, 'comment.doc.string', '@pop'],
        [/.*/, 'comment.doc.string'],
    ],

    // A basic JavaScript tokenizer (can be enhanced or replaced by importing Monaco's own JS tokenizer)
    javascript: [
      { include: '@whitespace' },
      { include: '@numbers' },
      { include: '@strings' },
      { include: '@tags' }, // HTML tags in strings or JSX
      { include: '@keywordsAndOperators' }, // Keywords and operators

      [/[;,.]/, 'delimiter'],
      [/[(){}\[\]]/, '@brackets'],
      [/[a-zA-Z_]\w*/, 'identifier'], // identifiers
    ],

    whitespace: [
      [/\s+/, 'white'],
      [/\/\*/, 'comment', '@comment'],
      [/\/\/.*$/, 'comment'],
    ],
    comment: [
      [/[^/*]+/, 'comment'],
      [/\*\//, 'comment', '@pop'],
      [/[/*]/, 'comment'],
    ],
    numbers: [
      [/0[xX][0-9a-fA-F]+/, 'number.hex'],
      [/\d*\.\d+([eE][-+]?\d+)?/, 'number.float'],
      [/\d+/, 'number'],
    ],
    strings: [
      [/'([^'\\]|\\.)*$/, 'string.invalid'], // unterminated string
      [/'/, 'string', '@string_single'],
      [/"([^"\\]|\\.)*$/, 'string.invalid'], // unterminated string
      [/"/, 'string', '@string_double'],
      [/`/, 'string', '@string_template'],
    ],
    string_single: [
      [/[^\\']+/, 'string'],
      [/\\./, 'string.escape'],
      [/'/, 'string', '@pop'],
    ],
    string_double: [
      [/[^\\"]+/, 'string'],
      [/\\./, 'string.escape'],
      [/"/, 'string', '@pop'],
    ],
    string_template: [
      [/[^\\`$]+/, 'string'],
      [/\\./, 'string.escape'],
      [/\$\{/, 'delimiter.bracket', '@template_expression'],
      [/`/, 'string', '@pop'],
    ],
    template_expression: [
      { include: '@javascript' }, // Allow full JS expressions inside templates
      [/\}/, 'delimiter.bracket', '@pop'],
    ],
    tags: [
       [/<\??\w+/, { token: 'tag', next: '@tagInner' }],
       [/<\/\w+\s*>/, 'tag']
    ],
    tagInner: [
      [/\w+/, 'attribute.name'],
      [/=/, 'delimiter'],
      [/"([^"]*)"/, 'attribute.value'],
      [/'([^']*)'/, 'attribute.value'],
      [/\?>/, { token: 'tag', next: '@pop' }],
      [/\/>/, { token: 'tag', next: '@pop' }],
      [/>/, { token: 'tag', next: '@pop' }],
    ],
    keywordsAndOperators: [
      [/\b(break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|false|finally|for|function|if|import|in|instanceof|let|new|null|return|super|switch|this|throw|true|try|typeof|var|void|while|with|yield|async|await|enum|implements|interface|package|private|protected|public|static)\b/, 'keyword'],
      [/[+\-*/%&|^~<>=!?:]=??/, 'operator'], // common operators
    ],
  },
};
