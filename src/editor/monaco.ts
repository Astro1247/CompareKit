// Worker setup and visual baseline adapted from Text Diff View (MIT), © 2024 kaishuu0123.
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import CssWorker from 'monaco-editor/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker?worker'
import TypeScriptWorker from 'monaco-editor/language/typescript/ts.worker?worker'

self.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    if (label === 'json') return new JsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker()
    if (label === 'typescript' || label === 'javascript') return new TypeScriptWorker()
    return new EditorWorker()
  },
}

monaco.languages.register({ id: 'nginx', extensions: ['.nginx'], aliases: ['Nginx'] })
monaco.languages.setMonarchTokensProvider('nginx', {
  tokenizer: {
    root: [
      [/#.*$/, 'comment'],
      [/^\s*[a-z][a-z_]*\b/, 'keyword'],
      [/\$[a-z0-9_]+/i, 'variable'],
      [/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/, 'string'],
      [/\b\d+[smhd]?\b/i, 'number'],
      [/[{};]/, 'delimiter'],
    ],
  },
})
monaco.languages.register({ id: 'toml', extensions: ['.toml'], aliases: ['TOML'] })
monaco.languages.setMonarchTokensProvider('toml', {
  tokenizer: {
    root: [
      [/#.*$/, 'comment'],
      [/^\s*\[\[?[^\]]+\]\]?/, 'keyword'],
      [/^[\t ]*[\w.-]+(?=\s*=)/, 'key'],
      [/"(?:[^"\\]|\\.)*"|'[^']*'/, 'string'],
      [/\b(?:true|false)\b/, 'keyword'],
      [/[+-]?\b[0-9][0-9_]*(?:\.[0-9_]+)?\b/, 'number'],
      [/[=,\[\]{}]/, 'delimiter'],
    ],
  },
})
export { monaco }
