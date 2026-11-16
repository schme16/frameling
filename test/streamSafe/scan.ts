// The stream-safe source scanner. It reads a .tsx file's syntax tree and finds the places where a path, a name or a
// key is put on a screen without going through src/core/streamSafe.ts. Shared by the audit and its own checks.
import { parseAst } from 'rolldown/parseAst';

/** Calls that make a value safe to show. Anything inside one of these is fine. */
export const SAFE_CALLS = new Set(['displayPath', 'displayFile', 'displayFolder', 'displayName', 'displaySecret', 'scrubText', 'shownRecent', 'shownMade']);

/** Words that, as a property or a plain name, mean "this holds a place on the computer, a person's name or a secret". */
export const RISKY_NAME = /^(path|paths|filePath|filePaths|folderPath|dirPath|fileName|filename|author|authorName|userName|profileName|contact|betaContact|accessToken|authToken|apiKey|secret|password|reportKey|sourcePath)$/;

/** Calls whose answer is a piece of a path. */
export const RISKY_CALLS = new Set(['baseName', 'dirName', 'describePlace']);

/** Attributes that are never shown (code, identity, styling), so a path in them is not a leak. */
const QUIET_ATTR = /^(on[A-Z].*|key|ref|className|style|id|htmlFor|name|type|disabled|checked|src|href|data-testid|data-command|data-help|data-wraps|data-autofocus|data-saved|data-answer|role|tabIndex|autoFocus|maxLength|accept|multiple|d|points|transform|viewBox|fill|stroke)$/;

export interface Finding {
  line: number;
  text: string;
  why: string;
}

const MARK = 'stream-safe-ok';

// The syntax tree is plain ESTree (from the parser Vite builds with). Only the few node kinds read here are typed.
interface N {
  type: string;
  start: number;
  end: number;
  [k: string]: unknown;
}
const isNode = (v: unknown): v is N => !!v && typeof v === 'object' && typeof (v as N).type === 'string';
const SKIP_KEYS = new Set(['typeAnnotation', 'typeArguments', 'typeParameters', 'returnType', 'decorators']);

const children = (n: N): N[] => {
  const out: N[] = [];
  for (const [k, v] of Object.entries(n)) {
    if (SKIP_KEYS.has(k)) continue;
    if (Array.isArray(v)) for (const x of v) if (isNode(x)) out.push(x);
    if (isNode(v)) out.push(v);
  }
  return out;
};

/** Finds every raw path, name or key on a screen in one file's source. A `stream-safe-ok: reason` comment inside the braces allows one on purpose. */
export function findRawDisplays(fileName: string, source: string): Finding[] {
  return scan(fileName, source, 'jsx');
}

/** Calls that put a sentence in front of someone: a toast. A path or file name inside must go through the helper. */
export const MESSAGE_CALLS = new Set(['notify', 'notifySaved', 'toast']);

/** Finds a path or file name put into a toast or message without the helper, in any .ts or .tsx file. */
export function findRawMessages(fileName: string, source: string): Finding[] {
  return scan(fileName, source, 'messages');
}

function scan(fileName: string, source: string, mode: 'jsx' | 'messages'): Finding[] {
  const ast = parseAst(source, { lang: fileName.endsWith('.tsx') ? 'tsx' : 'ts' }, fileName) as unknown as N;
  const out: Finding[] = [];
  const text = (n: N) => source.slice(n.start, n.end);
  const lineOf = (pos: number) => source.slice(0, pos).split('\n').length;
  const isJsx = (n: N) => n.type === 'JSXElement' || n.type === 'JSXFragment';

  /** The first risky thing inside an expression, skipping safe calls and nested JSX (which are checked on their own). */
  const risky = (n: N, parent?: N): string | null => {
    if (isJsx(n)) return null;
    if (n.type === 'CallExpression') {
      const c = n.callee as N;
      const callee = c.type === 'Identifier' ? (c.name as string) : c.type === 'MemberExpression' && !c.computed ? ((c.property as N).name as string) : '';
      if (SAFE_CALLS.has(callee)) return null;
      if (RISKY_CALLS.has(callee)) return `${callee}()`;
    }
    // Asking whether there is one (x && ..., !x, x ? a : b) or how many (x.length) shows nothing.
    if (n.type === 'LogicalExpression' && n.operator === '&&') return risky(n.right as N, n);
    if (n.type === 'ConditionalExpression') return risky(n.consequent as N, n) ?? risky(n.alternate as N, n);
    if (n.type === 'UnaryExpression' && n.operator === '!') return null;
    if (n.type === 'MemberExpression' && !n.computed && (n.property as N).name === 'length') return null;
    // A lookup by path (pics[f.path]) uses the path as a key, it does not show it.
    if (n.type === 'MemberExpression' && n.computed) return risky(n.object as N, n);
    if (n.type === 'MemberExpression' && !n.computed && RISKY_NAME.test((n.property as N).name as string)) return text(n);
    if (n.type === 'Identifier' && RISKY_NAME.test(n.name as string)) {
      const asProperty = parent && ((parent.type === 'MemberExpression' && parent.property === n && !parent.computed) || (parent.type === 'Property' && parent.key === n && !parent.computed && !parent.shorthand));
      if (!asProperty) return n.name as string;
    }
    for (const c of children(n)) {
      const r = risky(c, n);
      if (r) return r;
    }
    return null;
  };

  const check = (e: N, where: string) => {
    const expr = e.expression as N;
    if (!expr || expr.type === 'JSXEmptyExpression') return;
    if (text(e).includes(MARK)) return;
    const why = risky(expr, e);
    if (!why) return;
    out.push({ line: lineOf(e.start), text: `${where}={${text(expr).slice(0, 80)}}`, why });
  };

  const visit = (n: N, parent?: N) => {
    if (mode === 'messages') {
      if (n.type === 'CallExpression') {
        const c = n.callee as N;
        const callee = c.type === 'Identifier' ? (c.name as string) : '';
        const args = n.arguments as N[];
        if (MESSAGE_CALLS.has(callee) && args[0] && !text(n).includes(MARK)) {
          // Only the sentence itself (the first argument) is a message; buttons and options are code.
          const why = risky(args[0], n);
          if (why) out.push({ line: lineOf(n.start), text: `${callee}(${text(args[0]).slice(0, 80)})`, why });
        }
      }
    } else if (n.type === 'JSXExpressionContainer' && parent) {
      if (parent.type === 'JSXAttribute') {
        const nm = parent.name as N;
        const attr = nm.type === 'JSXIdentifier' ? (nm.name as string) : text(nm);
        if (!QUIET_ATTR.test(attr)) check(n, attr);
      } else if (parent.type === 'JSXElement' || parent.type === 'JSXFragment') {
        check(n, 'child');
      }
    }
    for (const c of children(n)) visit(c, n);
  };
  visit(ast);
  return out;
}
