import { TokenizeMethod, Eat } from '../tokenizer'
import { RemarkParser } from '../RemarkParser'
import { Node } from 'typed-unist'
import { openCloseTag } from '../utils/html'

const C_TAB = '\t'
const C_SPACE = ' '
const C_NEWLINE = '\n'
const C_LT = '<'

type Sequence = [RegExp, RegExp, boolean]

export const blockHTML: TokenizeMethod = function (this: RemarkParser, eat: Eat, value: string, silent?: boolean): Node | boolean {
  const self = this
  const blocks = self.options.blocks
  const length = value.length
  let index = 0
  let next
  let line
  let offset
  let character
  let count
  let sequence: Sequence
  let subvalue

  const sequences: Sequence[] = [
    [/^<(script|pre|style)(?=(\s|>|$))/i, /<\/(script|pre|style)>/i, true],
    [/^<!--/, /-->/, true],
    [/^<\?/, /\?>/, true],
    [/^<![A-Za-z]/, />/, true],
    [/^<!\[CDATA\[/, /\]\]>/, true],
    [new RegExp('^</?(' + blocks.join('|') + ')(?=(\\s|/?>|$))', 'i'), /^$/, true],
    [new RegExp(openCloseTag.source + '\\s*$'), /^$/, false],
  ]

  /* Eat initial spacing. */
  while (index < length) {
    character = value.charAt(index)

    if (character !== C_TAB && character !== C_SPACE) {
      break
    }

    index++
  }

  if (value.charAt(index) !== C_LT) {
    // FIXME: it returns void
    return
  }

  next = value.indexOf(C_NEWLINE, index + 1)
  next = next === -1 ? length : next
  line = value.slice(index, next)
  offset = -1
  count = sequences.length

  while (++offset < count) {
    if (sequences[offset][0].test(line)) {
      sequence = sequences[offset]
      break
    }
  }

  if (!sequence) {
    // FIXME: it returns void
    return
  }

  if (silent) {
    return sequence[2]
  }

  index = next

  if (!sequence[1].test(line)) {
    while (index < length) {
      next = value.indexOf(C_NEWLINE, index + 1)
      next = next === -1 ? length : next
      line = value.slice(index + 1, next)

      if (sequence[1].test(line)) {
        if (line) {
          index = next
        }

        break
      }

      index = next
    }
  }

  subvalue = value.slice(0, index)

  return eat(subvalue)({type: 'html', value: subvalue} as Node)
} as TokenizeMethod
