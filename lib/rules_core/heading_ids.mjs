// Add `id` attributes to headings (anchors compatible with github.com).
//
// Runs after inline parsing, so the visible heading text is taken from the
// rendered inline tokens: emphasis/links contribute their text, inline code
// contributes its content, while images and raw HTML tags contribute
// nothing. A fresh slugger is created for each document, so duplicate heading
// counters never leak across renders.

import { Slugger } from '../common/slugger.mjs'

function getHeadingText (tokens) {
  let text = ''

  for (let i = 0, len = tokens.length; i < len; i++) {
    if (tokens[i].type === 'text' || tokens[i].type === 'code_inline') {
      text += tokens[i].content
    } else if (tokens[i].type === 'softbreak' || tokens[i].type === 'hardbreak') {
      // line break inside a (setext) heading is rendered as whitespace
      text += ' '
    }
  }

  return text
}

export default function heading_ids (state) {
  if (!state.md.options.headingIds) { return }

  const slugger = new Slugger()
  const tokens = state.tokens

  for (let i = 0, l = tokens.length; i < l; i++) {
    if (tokens[i].type !== 'heading_open') { continue }

    // token right after heading_open is the inline content token
    const inlineToken = tokens[i + 1]
    const id = slugger.slug(getHeadingText(inlineToken.children || []))

    tokens[i].attrSet('id', id)
  }
}
