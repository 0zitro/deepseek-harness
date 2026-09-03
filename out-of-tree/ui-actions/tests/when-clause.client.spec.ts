import { describe, expect, it } from 'vitest'
import { compileWhenClause, evaluateWhen, parseWhenClause } from '../src/when-clause.ts'

describe('parseWhenClause', () => {
  it('parses a bare key as truthiness', () => {
    expect(parseWhenClause('agentBusy')).toEqual({ kind: 'key', key: 'agentBusy' })
  })

  it('parses negation and boolean operators', () => {
    expect(parseWhenClause('!agentBusy && inChat')).toEqual({
      kind: 'and',
      left: { kind: 'not', operand: { kind: 'key', key: 'agentBusy' } },
      right: { kind: 'key', key: 'inChat' },
    })
  })

  it('parses equality, inequality, and regex comparisons', () => {
    expect(parseWhenClause("resourceExtname == '.ts'")).toEqual({
      kind: 'eq', key: 'resourceExtname', value: '.ts',
    })
    expect(parseWhenClause("resourceExtname != '.ts'")).toEqual({
      kind: 'ne', key: 'resourceExtname', value: '.ts',
    })
    expect(parseWhenClause('resourceExtname =~ /ts/')).toMatchObject({
      kind: 'regex', key: 'resourceExtname',
    })
  })

  it('respects parentheses and precedence', () => {
    expect(parseWhenClause('a && (b || c)')).toEqual({
      kind: 'and',
      left: { kind: 'key', key: 'a' },
      right: { kind: 'or', left: { kind: 'key', key: 'b' }, right: { kind: 'key', key: 'c' } },
    })
  })

  it('rejects trailing or malformed input', () => {
    expect(() => parseWhenClause('a b')).toThrow()
    expect(() => parseWhenClause('a &&')).toThrow()
    expect(() => parseWhenClause('(a')).toThrow()
  })

  it('parses number and boolean values', () => {
    expect(parseWhenClause('count == 42')).toEqual({ kind: 'eq', key: 'count', value: 42 })
    expect(parseWhenClause('flag == true')).toEqual({ kind: 'eq', key: 'flag', value: true })
    expect(parseWhenClause('flag == false')).toEqual({ kind: 'eq', key: 'flag', value: false })
  })

  it('rejects a malformed value and a non-regex after =~', () => {
    expect(() => parseWhenClause('x == @')).toThrow()
    expect(() => parseWhenClause('x =~ foo')).toThrow()
  })

  it('rejects an unterminated string or regex', () => {
    expect(() => parseWhenClause("x == 'abc")).toThrow()
    expect(() => parseWhenClause('x =~ /abc')).toThrow()
  })

  it('parses regex flags and stops at a non-letter', () => {
    expect(parseWhenClause('x =~ /ts/i')).toMatchObject({ kind: 'regex', key: 'x' })
    expect(parseWhenClause('x =~ /ts/ && y')).toMatchObject({ kind: 'and' })
  })
})

describe('evaluateWhen', () => {
  it('evaluates truthiness, negation, and operators', () => {
    expect(evaluateWhen(parseWhenClause('agentBusy'), { agentBusy: true })).toBe(true)
    expect(evaluateWhen(parseWhenClause('!agentBusy'), { agentBusy: true })).toBe(false)
    expect(evaluateWhen(parseWhenClause('a && b'), { a: true, b: false })).toBe(false)
    expect(evaluateWhen(parseWhenClause('a || b'), { a: false, b: true })).toBe(true)
  })

  it('evaluates equality, inequality, and regex', () => {
    expect(evaluateWhen(parseWhenClause("ext == '.ts'"), { ext: '.ts' })).toBe(true)
    expect(evaluateWhen(parseWhenClause("ext != '.ts'"), { ext: '.js' })).toBe(true)
    expect(evaluateWhen(parseWhenClause('ext =~ /ts/'), { ext: 'foo.ts' })).toBe(true)
  })

  it('treats a missing context key as falsy', () => {
    expect(evaluateWhen(parseWhenClause('agentBusy'), {})).toBe(false)
    expect(evaluateWhen(parseWhenClause('!agentBusy'), {})).toBe(true)
  })

  it('treats a non-string regex context as no match', () => {
    expect(evaluateWhen(parseWhenClause('ext =~ /ts/'), { ext: 42 })).toBe(false)
  })
})

describe('compileWhenClause', () => {
  it('returns a reusable predicate', () => {
    const predicate = compileWhenClause('agentBusy && inChat')
    expect(predicate({ agentBusy: true, inChat: true })).toBe(true)
    expect(predicate({ agentBusy: true, inChat: false })).toBe(false)
  })
})
