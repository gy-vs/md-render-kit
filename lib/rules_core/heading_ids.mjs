// Add `id` attributes to headings, with slugs matching the anchors GitHub
// generates for headings (as produced by github-slugger).
//
// Runs as the last core rule, after inline tokens exist and typographic
// replacements have been applied, so the slug is calculated from the text
// the heading actually displays (emphasis/links/code/entities already
// resolved) rather than from its raw markdown source.
//
// Duplicate slugs get numeric suffixes, and the counters are local to the
// document: a fresh slugger is created on every parse, so reusing one
// MarkdownIt instance to render many documents never leaks counts between
// them.

import { createSlugger } from '../common/slugify.mjs'

// Collect the visible text of an inline token stream, the way a browser would
// expose `element.textContent`: inline markup and link wrappers contribute
// only their text, images contribute their alt text, raw HTML tags are
// dropped and line breaks become newlines.
function getInlineText (children) {
  let result = ''

  for (let i = 0, l = children.length; i < l; i++) {
    const token = children[i]

    if (token.type === 'text' || token.type === 'text_special' || token.type === 'code_inline') {
      result += token.content
    } else if (token.type === 'image') {
      result += getInlineText(token.children || [])
    } else if (token.type === 'softbreak' || token.type === 'hardbreak') {
      result += '\n'
    } else if (token.type === 'html_inline' || token.type === 'html_block') {
      result += token.content.replace(/<[^>]*>/g, '')
    }
    // opening/closing and other tokens render no text of their own
  }

  return result
}

export default function heading_ids (state) {
  if (!state.md.options.headingIds) { return }

  const tokens = state.tokens
  const slugger = createSlugger()

  for (let i = 0, l = tokens.length; i < l; i++) {
    if (tokens[i].type !== 'heading_open') { continue }

    const inline = tokens[i + 1]
    const text = inline && inline.type === 'inline' ? getInlineText(inline.children || []) : ''

    // attrSet, not attrPush, so an explicit id assigned earlier wins
    // predictably instead of producing a duplicate attribute.
    tokens[i].attrSet('id', slugger.slug(text))
  }
}
