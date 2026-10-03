import { assert } from 'chai'
import GithubSlugger, { slug as ghSlug } from 'github-slugger'
import markdownit from '../index.mjs'
import { slugify, createSlugger } from '../lib/common/slugify.mjs'

function extractIds (html) {
  return [...html.matchAll(/<h[1-6][^>]*\bid="([^"]*)"/g)].map(m => m[1])
}

describe('headingIds option', function () {
  it('is off by default and renders byte-identical output', function () {
    const src = [
      '# deploy *guide*',
      '',
      '## rollback steps',
      '',
      'setext title',
      '============',
      '',
      '> # quoted',
      '',
      'paragraph with [link](#rollback-steps) and `code`.',
      ''
    ].join('\n')

    const mdDefault = markdownit()
    const mdExplicitOff = markdownit({ headingIds: false })
    const mdCommonmark = markdownit('commonmark')
    const mdZero = markdownit('zero')

    assert.isFalse(/\bid=/.test(mdDefault.render(src)))
    assert.strictEqual(mdExplicitOff.render(src), mdDefault.render(src))
    assert.isFalse(/\bid=/.test(mdCommonmark.render(src)))
    assert.isFalse(/\bid=/.test(mdZero.render('# foo')))
  })

  it('can be enabled after construction with .set()', function () {
    const md = markdownit().set({ headingIds: true })
    assert.strictEqual(md.render('# foo'), '<h1 id="foo">foo</h1>\n')
  })

  it('adds ids to h1-h6 from ATX headings', function () {
    const md = markdownit({ headingIds: true })
    const src = [
      '# one',
      '## two',
      '### three',
      '#### four',
      '##### five',
      '###### six',
      '####### not a heading'
    ].join('\n')

    assert.deepEqual(extractIds(md.render(src)),
      ['one', 'two', 'three', 'four', 'five', 'six'])
  })

  it('adds ids to setext headings (= and -)', function () {
    const md = markdownit({ headingIds: true })
    const html = md.render('first level\n===========\n\nsecond level\n------------')

    assert.include(html, '<h1 id="first-level">first level</h1>')
    assert.include(html, '<h2 id="second-level">second level</h2>')
  })

  it('adds ids to headings nested in block quotes', function () {
    const md = markdownit({ headingIds: true })
    const html = md.render('> # deploy guide\n>\n> > ## rollback steps')

    assert.include(html, '<h1 id="deploy-guide">deploy guide</h1>')
    assert.include(html, '<h2 id="rollback-steps">rollback steps</h2>')
  })

  it('slugs from displayed text, not raw markdown source', function () {
    const md = markdownit({ headingIds: true })
    const src = [
      '# deploy *emphasis* guide',
      '# deploy [link text](https://example.com/deploy) guide',
      '# deploy `inline code` guide',
      '# entity &amp; a&#771;o &#x2014; end',
      '# 中文标题 日本語タイトル',
      '# Party 🎉 time'
    ].join('\n')

    const expected = new GithubSlugger()
    assert.deepEqual(extractIds(md.render(src)), [
      expected.slug('deploy emphasis guide'),
      expected.slug('deploy link text guide'),
      expected.slug('deploy inline code guide'),
      expected.slug('entity & ão — end'),
      expected.slug('中文标题 日本語タイトル'),
      expected.slug('Party 🎉 time')
    ])
  })

  it('matches github-slugger for emphasis, links, code and entities', function () {
    const md = markdownit({ headingIds: true })
    const cases = [
      '# deploy *guide* with [rollback steps](deploy-guide)',
      '## `a < b > c` &amp; co',
      '### foo [a](#x) bar `z` *i* **b** ~~s~~',
      'Setext with `code`\n=================',
      '# &#65;&#x42; entities text',
      '# trimmed heading   '
    ]
    // displayed text, per what the page renders:
    const texts = [
      'deploy guide with rollback steps',
      'a < b > c & co',
      'foo a bar z i b s',
      'Setext with `code`',
      'AB entities text',
      'trimmed heading'
    ]

    cases.forEach(function (src, i) {
      assert.deepEqual(extractIds(md.render(src)), [ghSlug(texts[i])], src)
    })
  })

  it('assigns github-slugger numeric suffixes to duplicate headings', function () {
    const md = markdownit({ headingIds: true })
    const src = [
      '# rollback steps',
      '# rollback steps',
      '# rollback steps',
      '## rollback steps-1',
      '# other',
      '# rollback steps'
    ].join('\n')

    const ref = new GithubSlugger()
    const displayedTexts = [
      'rollback steps',
      'rollback steps',
      'rollback steps',
      'rollback steps-1',
      'other',
      'rollback steps'
    ]

    assert.deepEqual(extractIds(md.render(src)), displayedTexts.map(t => ref.slug(t)))
    assert.deepEqual(extractIds(md.render(src)), [
      'rollback-steps',
      'rollback-steps-1',
      'rollback-steps-2',
      'rollback-steps-1-1',
      'other',
      'rollback-steps-3'
    ])
  })

  it('resets duplicate counters on every render of a reused instance', function () {
    const md = markdownit({ headingIds: true })

    assert.strictEqual(md.render('# dup\n\n# dup'),
      md.render('# dup\n\n# dup'))
    assert.deepEqual(extractIds(md.render('# dup')), ['dup'])
    // a second, independent document must start from a blank slugger again
    assert.deepEqual(extractIds(md.render('# dup\n\n# dup')), ['dup', 'dup-1'])
    assert.deepEqual(extractIds(md.render('# dup')), ['dup'])
  })

  it('puts the id on token.attrs so heading_open overrides can read it', function () {
    const md = markdownit({ headingIds: true })

    let seenId = null
    md.renderer.rules.heading_open = function (tokens, idx, options, env, self) {
      seenId = tokens[idx].attrGet('id')
      return '<' + tokens[idx].tag + ' data-from-plugin="1"' +
             self.renderAttrs(tokens[idx]) + '>'
    }

    const html = md.render('# deploy guide')
    assert.strictEqual(seenId, 'deploy-guide')
    assert.strictEqual(html, '<h1 data-from-plugin="1" id="deploy-guide">deploy guide</h1>\n')
  })

  it('is exposed via parse() token attrs, independently of rendering', function () {
    const md = markdownit({ headingIds: true })
    const open = md.parse('# deploy guide')[0]

    assert.strictEqual(open.type, 'heading_open')
    assert.deepEqual(open.attrs, [['id', 'deploy-guide']])
    assert.strictEqual(open.attrGet('id'), 'deploy-guide')
  })

  it('does not add ids when there are no block headings (renderInline)', function () {
    const md = markdownit({ headingIds: true })
    assert.strictEqual(md.renderInline('foo *bar*'), 'foo <em>bar</em>')
  })

  it('vendored slugify matches github-slugger one by one on many inputs', function () {
    const samples = [
      '', ' ', 'a', 'A', 'Hello World', 'deploy-guide', 'rollback_steps',
      'foo & bar <> "quotes"', 'a.b,c!d?e', 'multiple   spaces',
      'trailing dash -', '- leading dash', 'underscores __init__',
      'café résumé naïve', '中文 标题', '日本語のテスト', '한국어 제목',
      'Русский заголовок', 'العنوان العربي', 'ελληνικός τίτλος',
      'emoji 🎉 🚀 💩 mix', '🎉', '＋【全角】かっこ＃',
      'UPPER lower MiXeD', 'a\tb\nc', '100% + 50% = 150%',
      'foo@bar #hash (paren) [bracket] {brace}',
      'ﬁ ligature', 'en dash – em dash —', 'smart “quotes” ‘single’'
    ]

    samples.forEach(function (s) {
      assert.strictEqual(slugify(s), ghSlug(s), JSON.stringify(s))
    })

    // stateful occurrence suffixing must match as well
    const a = createSlugger()
    const b = new GithubSlugger()
    const seq = ['foo', 'foo', 'foo', 'foo-1', 'bar', 'foo', 'bar', '']
    seq.forEach(function (s) {
      assert.strictEqual(a.slug(s), b.slug(s), 'duplicate: ' + JSON.stringify(s))
    })
  })
})
