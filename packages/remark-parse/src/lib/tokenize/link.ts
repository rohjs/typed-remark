import { isWhitespaceCharacter } from 'typed-string-utils'
import { TokenizeMethod, Eat } from '../tokenizer'
import { RemarkParser } from '../RemarkParser'
import { Node, Parent } from 'typed-unist'
import { locateLink } from '../locate/link'

const own = {}.hasOwnProperty

const C_BACKSLASH = '\\'
const C_BRACKET_OPEN = '['
const C_BRACKET_CLOSE = ']'
const C_PAREN_OPEN = '('
const C_PAREN_CLOSE = ')'
const C_LT = '<'
const C_GT = '>'
const C_TICK = '`'
const C_DOUBLE_QUOTE = '"'
const C_SINGLE_QUOTE = '\''

/* Map of characters, which can be used to mark link
 * and image titles. */
const LINK_MARKERS = {
  [C_DOUBLE_QUOTE]: C_DOUBLE_QUOTE,
  [C_SINGLE_QUOTE]: C_SINGLE_QUOTE,
}

/* Map of characters, which can be used to mark link
 * and image titles in commonmark-mode. */
const COMMONMARK_LINK_MARKERS = {
  [C_DOUBLE_QUOTE]: C_DOUBLE_QUOTE,
  [C_SINGLE_QUOTE]: C_SINGLE_QUOTE,
  [C_PAREN_OPEN]: C_PAREN_CLOSE,
}

export const link: TokenizeMethod = function (this: RemarkParser, eat: Eat, value: string, silent?: boolean): Node | boolean {
  const self = this
  let subvalue = ''
  let index = 0
  let character = value.charAt(0)
  const pedantic = self.options.pedantic
  const commonmark = self.options.commonmark
  const gfm = self.options.gfm
  let closed
  let count
  let opening
  let beforeURL
  let beforeTitle
  let subqueue
  let hasMarker
  let markers
  let isImage
  let content
  let marker
  let length
  let title
  let depth
  let queue
  let url
  let now
  let node

  /* Detect whether this is an image. */
  if (character === '!') {
    isImage = true
    subvalue = character
    character = value.charAt(++index)
  }

  /* Eat the opening. */
  if (character !== C_BRACKET_OPEN) {
    return
  }

  /* Exit when this is a link and we’re already inside
   * a link. */
  if (!isImage && self.inLink) {
    return
  }

  subvalue += character
  queue = ''
  index++

  /* Eat the content. */
  length = value.length
  now = eat.now()
  depth = 0

  now.column += index
  now.offset += index

  while (index < length) {
    character = value.charAt(index)
    subqueue = character

    if (character === C_TICK) {
      /* Inline-code in link content. */
      count = 1

      while (value.charAt(index + 1) === C_TICK) {
        subqueue += character
        index++
        count++
      }

      if (!opening) {
        opening = count
      } else if (count >= opening) {
        opening = 0
      }
    } else if (character === C_BACKSLASH) {
      /* Allow brackets to be escaped. */
      index++
      subqueue += value.charAt(index)
    /* In GFM mode, brackets in code still count.
     * In all other modes, they don’t.  This empty
     * block prevents the next statements are
     * entered. */
    } else if ((!opening || gfm) && character === C_BRACKET_OPEN) {
      depth++
    } else if ((!opening || gfm) && character === C_BRACKET_CLOSE) {
      if (depth) {
        depth--
      } else {
        /* Allow white-space between content and
         * url in GFM mode. */
        if (!pedantic) {
          while (index < length) {
            character = value.charAt(index + 1)

            if (!isWhitespaceCharacter(character)) {
              break
            }

            subqueue += character
            index++
          }
        }

        if (value.charAt(index + 1) !== C_PAREN_OPEN) {
          return
        }

        subqueue += C_PAREN_OPEN
        closed = true
        index++

        break
      }
    }

    queue += subqueue
    subqueue = ''
    index++
  }

  /* Eat the content closing. */
  if (!closed) {
    return
  }

  content = queue
  subvalue += queue + subqueue
  index++

  /* Eat white-space. */
  while (index < length) {
    character = value.charAt(index)

    if (!isWhitespaceCharacter(character)) {
      break
    }

    subvalue += character
    index++
  }

  /* Eat the URL. */
  character = value.charAt(index)
  markers = commonmark ? COMMONMARK_LINK_MARKERS : LINK_MARKERS
  queue = ''
  beforeURL = subvalue

  if (character === C_LT) {
    index++
    beforeURL += C_LT

    while (index < length) {
      character = value.charAt(index)

      if (character === C_GT) {
        break
      }

      if (commonmark && character === '\n') {
        return
      }

      queue += character
      index++
    }

    if (value.charAt(index) !== C_GT) {
      return
    }

    subvalue += C_LT + queue + C_GT
    url = queue
    index++
  } else {
    character = null
    subqueue = ''

    while (index < length) {
      character = value.charAt(index)

      if (subqueue && own.call(markers, character)) {
        break
      }

      if (isWhitespaceCharacter(character)) {
        if (!pedantic) {
          break
        }

        subqueue += character
      } else {
        if (character === C_PAREN_OPEN) {
          depth++
        } else if (character === C_PAREN_CLOSE) {
          if (depth === 0) {
            break
          }

          depth--
        }

        queue += subqueue
        subqueue = ''

        if (character === C_BACKSLASH) {
          queue += C_BACKSLASH
          character = value.charAt(++index)
        }

        queue += character
      }

      index++
    }

    subvalue += queue
    url = queue
    index = subvalue.length
  }

  /* Eat white-space. */
  queue = ''

  while (index < length) {
    character = value.charAt(index)

    if (!isWhitespaceCharacter(character)) {
      break
    }

    queue += character
    index++
  }

  character = value.charAt(index)
  subvalue += queue

  /* Eat the title. */
  if (queue && own.call(markers, character)) {
    index++
    subvalue += character
    queue = ''
    marker = markers[character]
    beforeTitle = subvalue

    /* In commonmark-mode, things are pretty easy: the
     * marker cannot occur inside the title.
     *
     * Non-commonmark does, however, support nested
     * delimiters. */
    if (commonmark) {
      while (index < length) {
        character = value.charAt(index)

        if (character === marker) {
          break
        }

        if (character === C_BACKSLASH) {
          queue += C_BACKSLASH
          character = value.charAt(++index)
        }

        index++
        queue += character
      }

      character = value.charAt(index)

      if (character !== marker) {
        return
      }

      title = queue
      subvalue += queue + character
      index++

      while (index < length) {
        character = value.charAt(index)

        if (!isWhitespaceCharacter(character)) {
          break
        }

        subvalue += character
        index++
      }
    } else {
      subqueue = ''

      while (index < length) {
        character = value.charAt(index)

        if (character === marker) {
          if (hasMarker) {
            queue += marker + subqueue
            subqueue = ''
          }

          hasMarker = true
        } else if (!hasMarker) {
          queue += character
        } else if (character === C_PAREN_CLOSE) {
          subvalue += queue + marker + subqueue
          title = queue
          break
        } else if (isWhitespaceCharacter(character)) {
          subqueue += character
        } else {
          queue += marker + subqueue + character
          subqueue = ''
          hasMarker = false
        }

        index++
      }
    }
  }

  if (value.charAt(index) !== C_PAREN_CLOSE) {
    return
  }

  /* istanbul ignore if - never used (yet) */
  if (silent) {
    return true
  }

  subvalue += C_PAREN_CLOSE

  url = self.decodeRaw(self.unescape(url), eat(beforeURL).test().end)

  if (title) {
    beforeTitle = eat(beforeTitle).test().end
    title = self.decodeRaw(self.unescape(title), beforeTitle)
  }

  node = {
    type: isImage ? 'image' : 'link',
    title: title || null,
    url,
  } as Node

  if (isImage) {
    (node as any).alt = self.decodeRaw(self.unescape(content), now) || null
  } else {
    const exitLink = this.enterLink();

    (node as Parent).children = self.tokenizeInline(content, now)

    exitLink()
  }

  return eat(subvalue)(node)
} as TokenizeMethod

link.locator = locateLink
