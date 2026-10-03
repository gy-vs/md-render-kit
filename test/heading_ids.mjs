import { assert } from 'chai'
import GithubSlugger from 'github-slugger'
import markdownit from '../index.mjs'

// Extract the visible text of a heading the same way the implementation
// does it, then ask github-slugger (the reference for github.com anchors)
// what the id should be.
function expectedIds (md, src, env) {
  const tokens = md.parse(src, env || {})
  const slugger = new GithubSlugger()
  const result = []

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'heading_open') { continue }

    let text = ''
    const children = tokens[i + 1].children || []
    for (let j = 0; j < children.length; j++) {
      if (children[j].type === 'text' || children[j].type === 'code_inline') {
        text += children[j].content
      } else if (children[j].type === 'softbreak' || children[j].type === 'hardbreak') {
        text += ' '
      }
    }
    result.push(slugger.slug(text))
  }

  return result
}

// Render and collect (level, id) pairs from the generated heading tags.
function renderedHeadings (html) {
  const result = []
  const re = /<h([1-6]) id="([^"]*)">/g
  let m
  while ((m = re.exec(html)) !== null) {
    result.push({ level: Number(m[1]), id: m[2] })
  }
  return result
}

function headingIds (md, src, env) {
  return renderedHeadings(md.render(src, env)).map(h => h.id)
}

describe('headingIds option', function () {
  describe('disabled by default (byte-identical output)', function () {
    it('has no id attributes on headings', function () {
      const md = markdownit()
      assert.strictEqual(md.render('# heading'), '<h1>heading</h1>\n')
      assert.strictEqual(md.render('setext\n======\n'), '<h1>setext</h1>\n')
      assert.strictEqual(md.render('setext\n------\n'), '<h2>setext</h2>\n')
    })

    it('remains disabled in commonmark preset', function () {
      const md = markdownit('commonmark')
      assert.strictEqual(md.render('# heading\n'), '<h1>heading</h1>\n')
    })

    it('does not mutate token attrs when disabled', function () {
      const md = markdownit()
      const tokens = md.parse('# heading', {})
      assert.strictEqual(tokens[0].type, 'heading_open')
      assert.isNull(tokens[0].attrs)
    })

    it('can be toggled via set()', function () {
      const md = markdownit()
      assert.strictEqual(md.render('# heading\n'), '<h1>heading</h1>\n')
      md.set({ headingIds: true })
      assert.strictEqual(md.render('# heading\n'), '<h1 id="heading">heading</h1>\n')
    })
  })

  describe('id generation matches github-slugger', function () {
    const md = markdownit({ headingIds: true, html: true })

    const cases = [
      // plain
      '# deploy-guide',
      '## rollback steps',
      // levels 1-6, ATX and setext
      '# h1\n## h2\n### h3\n#### h4\n##### h5\n###### h6',
      'Setext one\n==========\n\nSetext two\n----------',
      // multiline setext heading: line breaks count as whitespace
      'line one\nline two\n========',
      'hard line  \nbreak\n========',
      // inline markup: emphasis, code, links contribute their visible text
      '# Hello *world* and **bold**',
      '# run `npm install` now',
      '# read the [docs](https://example.com/docs) please',
      '# ***nested `code` emphasis***',
      // entities are decoded before slugging (visible page text)
      '# a &amp; b &#9731; &#x2603;',
      '# quotes &ldquo;smart&rdquo;',
      // raw html contributes nothing (like on github.com)
      '# html <b>bold</b> text <span class="x">z</span>',
      '# comment <!-- c --> end',
      // images contribute nothing
      '# before ![alt text](x.png) after',
      // punctuation / casing / spacing
      '# UPPER CASE Heading',
      '# foo--bar__baz.qux',
      '# !!! what ???',
      '# a(b)c[d]e{f}g',
      '# x + y = z, 100%',
      '# multiple    spaces   here',
      // unicode text kept in slugs
      '# 中文标题',
      '# 日本語のテスト',
      '# café résumé naïve über',
      '# Русский заголовок',
      '# العربية عنوان',
      // emoji are punctuation/symbols and get stripped
      '# 🎉 release party 😀',
      '# emoji 😀😀 between',
      // escapes resolve to visible characters
      '# a\\_b\\&c\\#d',
      // headings nested in structures
      '> # inside blockquote\n> text',
      '> > ## nested blockquotes',
      '- # heading in list',
      '| head |\n| ---- |\n| cell |\n\n# after table',
      // code spans containing entities/markup are taken literally
      '# use `#foo &bar` here'
    ]

    cases.forEach(function (src) {
      it(JSON.stringify(src), function () {
        assert.deepStrictEqual(headingIds(md, src), expectedIds(md, src))
      })
    })
  })

  describe('duplicate headings get numeric suffixes', function () {
    it('suffixes like github-slugger', function () {
      const md = markdownit({ headingIds: true })
      const src = '# foo\n\n# foo\n\n# foo\n\n# bar\n\n# bar'
      assert.deepStrictEqual(headingIds(md, src), ['foo', 'foo-1', 'foo-2', 'bar', 'bar-1'])
    })

    it('collision with a heading already named foo-1', function () {
      const md = markdownit({ headingIds: true })
      const src = '# foo-1\n\n# foo\n\n# foo'
      // github-slugger: 'foo-1', then 'foo', then skips 'foo-1' -> 'foo-2'
      assert.deepStrictEqual(headingIds(md, src), ['foo-1', 'foo', 'foo-2'])
      assert.deepStrictEqual(headingIds(md, src), expectedIds(md, src))
    })

    it('counts reset on every render (single instance reused)', function () {
      const md = markdownit({ headingIds: true })
      const src = '# foo\n\n# foo'
      assert.deepStrictEqual(headingIds(md, src), ['foo', 'foo-1'])
      // render again, same single instance: counters must not leak
      assert.deepStrictEqual(headingIds(md, src), ['foo', 'foo-1'])
      assert.deepStrictEqual(headingIds(md, src), ['foo', 'foo-1'])
    })

    it('counts reset across unrelated documents in a render loop', function () {
      const md = markdownit({ headingIds: true })
      const docs = ['# a\n\n# a', '# b', '# a\n\n# a\n\n# a', '## a']
      docs.forEach(function (doc) {
        assert.deepStrictEqual(headingIds(md, doc), expectedIds(md, doc))
      })
    })

    it('env-based renders also start fresh', function () {
      const md = markdownit({ headingIds: true })
      assert.deepStrictEqual(headingIds(md, '# dup', { x: 1 }), ['dup'])
      assert.deepStrictEqual(headingIds(md, '# dup', { x: 2 }), ['dup'])
    })
  })

  describe('token attrs integration', function () {
    it('id is readable from heading_open token attrs', function () {
      const md = markdownit({ headingIds: true })
      const tokens = md.parse('# the heading', {})
      const open = tokens[0]
      assert.strictEqual(open.type, 'heading_open')
      assert.strictEqual(open.attrGet('id'), 'the-heading')
    })

    it('duplicate headings expose distinct ids in token attrs', function () {
      const md = markdownit({ headingIds: true })
      const tokens = md.parse('# same\n\n# same', {})
      const opens = tokens.filter(t => t.type === 'heading_open')
      assert.strictEqual(opens[0].attrGet('id'), 'same')
      assert.strictEqual(opens[1].attrGet('id'), 'same-1')
    })

    it('custom heading_open renderer keeps the id', function () {
      const md = markdownit({ headingIds: true })
      md.renderer.rules.heading_open = function (tokens, idx, options, env, self) {
        // colleague plugin reads id from token attrs and adds another one
        tokens[idx].attrJoin('class', 'custom-heading')
        return self.renderToken(tokens, idx, options)
      }
      assert.strictEqual(
        md.render('# plug me in\n'),
        '<h1 id="plug-me-in" class="custom-heading">plug me in</h1>\n'
      )
    })
  })

  describe('rendered markup', function () {
    it('all six levels carry ids', function () {
      const md = markdownit({ headingIds: true })
      const html = md.render('# a\n## b\n### c\n#### d\n##### e\n###### f\n')
      assert.deepStrictEqual(
        renderedHeadings(html),
        [
          { level: 1, id: 'a' },
          { level: 2, id: 'b' },
          { level: 3, id: 'c' },
          { level: 4, id: 'd' },
          { level: 5, id: 'e' },
          { level: 6, id: 'f' }
        ]
      )
    })

    it('setext headings carry ids', function () {
      const md = markdownit({ headingIds: true })
      assert.strictEqual(
        md.render('deploy guide\n==============\n'),
        '<h1 id="deploy-guide">deploy guide</h1>\n'
      )
      assert.strictEqual(
        md.render('rollback steps\n--------------\n'),
        '<h2 id="rollback-steps">rollback steps</h2>\n'
      )
    })

    it('heading inside blockquote carries id', function () {
      const md = markdownit({ headingIds: true })
      assert.strictEqual(
        md.render('> # quoted heading\n'),
        '<blockquote>\n<h1 id="quoted-heading">quoted heading</h1>\n</blockquote>\n'
      )
    })

    it('id is properly escaped in attributes', function () {
      const md = markdownit({ headingIds: true })
      // quotes and angle brackets are stripped by slugging anyway;
      // ampersand decodes from entity and also gets stripped, leaving only
      // letters/spaces - but verify attribute rendering is safe
      const html = md.render('# 1 < 2 & 2 > 1\n')
      assert.include(html, 'id="1--2--2--1"')
    })
  })

  describe('inlines do not get ids', function () {
    it('renderInline output has no heading processing', function () {
      const md = markdownit({ headingIds: true })
      assert.strictEqual(md.renderInline('plain text'), 'plain text')
    })
  })
})
