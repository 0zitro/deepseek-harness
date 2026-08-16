/**
 * VSCode-style `when` clause parser and evaluator over a flat context map.
 *
 * Grammar, precedence low to high:
 *
 *   expr    := or
 *   or      := and ( '||' and )*
 *   and     := unary ( '&&' unary )*
 *   unary   := '!' unary | primary
 *   primary := key ( '==' | '!=' | '=~' value )? | '(' expr ')'
 *
 * A bare key is a truthiness test. Values are `true`, `false`, a number, a
 * single-quoted string, or a `/regex/` literal. A context entry is a boolean,
 * number, string, or a readonly array of those.
 */

/** A flat map of context keys to their current values. */
export type WhenContext = Record<string, unknown>

/** A literal value a `when` clause can compare against. */
export type WhenValue = boolean | number | string

/** Parsed `when` clause node. */
export type WhenNode =
  | { kind: 'or'; left: WhenNode; right: WhenNode }
  | { kind: 'and'; left: WhenNode; right: WhenNode }
  | { kind: 'not'; operand: WhenNode }
  | { kind: 'key'; key: string }
  | { kind: 'eq'; key: string; value: WhenValue }
  | { kind: 'ne'; key: string; value: WhenValue }
  | { kind: 'regex'; key: string; regex: RegExp }

const KEY_START = /[A-Za-z_]/
const KEY_PART = /[A-Za-z0-9_.]/
const WHITESPACE = /\s/

/** Recursive-descent parser over one `when` source string. */
class Parser {
  private pos = 0

  constructor(private readonly source: string) {}

  /** Parse the whole source; throws on trailing or malformed input. */
  parse(): WhenNode {
    const node = this.parseOr()
    this.skipWhitespace()
    if (this.pos < this.source.length) {
      throw new Error(`when clause: unexpected ${JSON.stringify(this.source[this.pos])} at ${this.pos}`)
    }
    return node
  }

  private skipWhitespace(): void {
    while (WHITESPACE.test(this.source[this.pos] ?? '')) this.pos++
  }

  private match(token: string): boolean {
    this.skipWhitespace()
    if (this.source.startsWith(token, this.pos)) {
      this.pos += token.length
      return true
    }
    return false
  }

  private parseOr(): WhenNode {
    let left = this.parseAnd()
    while (this.match('||')) left = { kind: 'or', left, right: this.parseAnd() }
    return left
  }

  private parseAnd(): WhenNode {
    let left = this.parseUnary()
    while (this.match('&&')) left = { kind: 'and', left, right: this.parseUnary() }
    return left
  }

  private parseUnary(): WhenNode {
    if (this.match('!')) return { kind: 'not', operand: this.parseUnary() }
    return this.parsePrimary()
  }

  private parsePrimary(): WhenNode {
    this.skipWhitespace()
    if (this.match('(')) {
      const inner = this.parseOr()
      if (!this.match(')')) throw new Error('when clause: expected )')
      return inner
    }
    const key = this.parseKey()
    if (this.match('==')) return { kind: 'eq', key, value: this.parseValue() }
    if (this.match('!=')) return { kind: 'ne', key, value: this.parseValue() }
    if (this.match('=~')) return { kind: 'regex', key, regex: this.parseRegex() }
    return { kind: 'key', key }
  }

  private parseKey(): string {
    this.skipWhitespace()
    const start = this.pos
    if (!KEY_START.test(this.source[this.pos] ?? '')) {
      throw new Error(`when clause: expected key at ${start}`)
    }
    this.pos++
    while (KEY_PART.test(this.source[this.pos] ?? '')) this.pos++
    return this.source.slice(start, this.pos)
  }

  private parseValue(): WhenValue {
    this.skipWhitespace()

    if (this.source[this.pos] === "'") {
      const end = this.source.indexOf("'", this.pos + 1)
      if (end === -1) throw new Error(`when clause: unterminated string at ${this.pos}`)
      const value = this.source.slice(this.pos + 1, end)
      this.pos = end + 1
      return value
    }

    const rest = this.source.slice(this.pos)
    const number = /^-?\d+(?:\.\d+)?/.exec(rest)
    if (number !== null) {
      this.pos += number[0].length
      return Number(number[0])
    }

    const bool = /^(true|false)\b/.exec(rest)
    if (bool !== null) {
      this.pos += bool[0].length
      return bool[1] === 'true'
    }

    throw new Error(`when clause: expected value at ${this.pos}`)
  }

  private parseRegex(): RegExp {
    this.skipWhitespace()
    if (this.source[this.pos] !== '/') throw new Error(`when clause: expected /regex/ at ${this.pos}`)
    const end = this.source.indexOf('/', this.pos + 1)
    if (end === -1) throw new Error(`when clause: unterminated regex at ${this.pos}`)
    const pattern = this.source.slice(this.pos + 1, end)
    this.pos = end + 1
    let flags = ''
    while (this.pos < this.source.length) {
      const char = this.source.charAt(this.pos)
      if (!/[a-z]/.test(char)) break
      flags += char
      this.pos++
    }
    // The global flag makes `test` stateful, which a predicate must never be.
    return new RegExp(pattern, flags.replace('g', ''))
  }
}

/** Parse a `when` clause into its node tree. */
export function parseWhenClause(source: string): WhenNode {
  return new Parser(source).parse()
}

/** Evaluate a parsed node against a context map. */
export function evaluateWhen(node: WhenNode, context: WhenContext): boolean {
  switch (node.kind) {
    case 'or': return evaluateWhen(node.left, context) || evaluateWhen(node.right, context)
    case 'and': return evaluateWhen(node.left, context) && evaluateWhen(node.right, context)
    case 'not': return !evaluateWhen(node.operand, context)
    case 'key': return Boolean(context[node.key])
    case 'eq': return context[node.key] === node.value
    case 'ne': return context[node.key] !== node.value
    case 'regex': {
      const value = context[node.key]
      if (typeof value !== 'string') return false
      return node.regex.test(value)
    }
  }
}

/** Compile a `when` clause into a predicate over a context map. */
export function compileWhenClause(source: string): (context: WhenContext) => boolean {
  const node = parseWhenClause(source)
  return context => evaluateWhen(node, context)
}
