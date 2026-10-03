// Generate anchors the same way github.com does for markdown headings.
//
// The slug algorithm mirrors the `slug` function and the occurrence tracking
// in github-slugger (https://www.npmjs.com/package/github-slugger), the
// de-facto reference for GitHub heading anchors: text is lowercased, every
// character matched by slug_regex is dropped, and remaining spaces become
// hyphens. Repeated headings get `-1`, `-2`, ... suffixes.

import SLUG_STRIP_RE from './slug_regex.mjs'

const has = Object.prototype.hasOwnProperty

export function slugify (value) {
  return String(value).toLowerCase().replace(SLUG_STRIP_RE, '').replace(/ /g, '-')
}

// Track slugs within a single document so that duplicate headings receive
// numeric suffixes. Each render starts with a fresh Slugger.
export function Slugger () {
  this.occurrences = Object.create(null)
}

Slugger.prototype.slug = function (value) {
  const original = slugify(value)
  let result = original

  while (has.call(this.occurrences, result)) {
    this.occurrences[original]++
    result = original + '-' + this.occurrences[original]
  }

  this.occurrences[result] = 0

  return result
}
