// The HTML tokenizer's reading of a page, shared by scripts/verify.mjs and
// scripts/site-style.mjs so both read the markup a browser builds.

// Every start and end tag with its attributes, read as the HTML tokenizer reads
// them: "/" separates attributes as whitespace does, a quoted value runs to its
// own quote whatever it holds, and an attribute may follow a closing quote with
// no space at all. A comment ends where a browser ends one (<!-->, <!--->, -->
// or --!>, whichever comes first), and the elements whose content a browser
// reads as text — <script>, <style>, <title>, <textarea> and the rest — end at
// the first matching end tag, with nothing inside read as markup. Reading that
// text as markup is not the safe side: the first version did so for <title>,
// and "<title>x<!--</title>" opened a comment that hid a real microdata list
// after it (Chromium's DOM, checked). A differential run of this reader against
// Chromium over 20,000 generated snippets found nothing else. scripts/verify.mjs
// refuses inline <math> and holds inline <svg> to a shape-only allowlist,
// because inside them <style> is not raw text, and a <script> may not hold
// "<!--", from which a browser can run it past its </script>.
export const HTML_SPACE = /[\t\n\f\r ]/;
const TEXT_ELEMENTS = new Set(["script", "style", "title", "textarea", "xmp", "iframe", "noembed", "noframes"]);
export const htmlTags = (markup) => {
  const tags = [];
  let at = 0;
  const readWhile = (test) => {
    const from = at;
    while (at < markup.length && test(markup[at])) at++;
    return markup.slice(from, at);
  };
  const skipPast = (ending) => {
    ending.lastIndex = at;
    const found = ending.exec(markup);
    at = found ? found.index + found[0].length : markup.length;
  };
  let svgDepth = 0;
  while ((at = markup.indexOf("<", at)) !== -1) {
    const start = at;
    at++;
    if (markup.startsWith("!--", at)) {
      at += 3;
      if (markup[at] === ">") at += 1;
      else if (markup.startsWith("->", at)) at += 2;
      else skipPast(/--!?>/g);
      continue;
    }
    const closing = markup[at] === "/";
    if (closing) at++;
    if (!/[A-Za-z]/.test(markup[at] ?? "")) {
      // <!DOCTYPE …>, <?…> and </ before a non-letter run to the first ">";
      // "<" before anything else is text.
      if (closing || markup[at] === "!" || markup[at] === "?") skipPast(/>/g);
      continue;
    }
    const name = readWhile((c) => !/[\t\n\f\r />]/.test(c)).toLowerCase();
    const attributes = [];
    let selfClosing = false;
    while (at < markup.length && markup[at] !== ">") {
      if (/[\t\n\f\r /]/.test(markup[at])) {
        if (markup[at] === "/" && markup[at + 1] === ">") selfClosing = true;
        at++;
        continue;
      }
      // A name may begin with "=" and runs to a space, "/", ">" or "=".
      const attribute = (markup[at++] + readWhile((c) => !/[\t\n\f\r />=]/.test(c))).toLowerCase();
      readWhile((c) => HTML_SPACE.test(c));
      let value = "";
      if (markup[at] === "=") {
        at++;
        readWhile((c) => HTML_SPACE.test(c));
        const quote = markup[at];
        if (quote === '"' || quote === "'") {
          at++;
          value = readWhile((c) => c !== quote);
          at++;
        } else {
          value = readWhile((c) => !/[\t\n\f\r >]/.test(c));
        }
      }
      attributes.push({ name: attribute, value });
    }
    at++;
    // foreign: the tag sits inside an inline <svg> (the <svg> and </svg> tags
    // included), where the page check below holds it to an SVG allowlist. An
    // <svg/> is empty, as in a browser.
    const opensSvg = !closing && name === "svg" && !selfClosing;
    const tag = {
      name, closing, selfClosing, attributes, text: "", start, end: at, foreign: svgDepth > 0 || name === "svg",
    };
    if (opensSvg) svgDepth++;
    if (closing && name === "svg" && svgDepth > 0) svgDepth--;
    tags.push(tag);
    if (!closing && name === "plaintext") {
      tag.text = markup.slice(at);
      at = markup.length;
    } else if (!closing && TEXT_ELEMENTS.has(name)) {
      const end = new RegExp(`</${name}[\\t\\n\\f\\r />]`, "gi");
      end.lastIndex = at;
      const stop = end.exec(markup)?.index ?? markup.length;
      tag.text = markup.slice(at, stop);
      at = stop;
    }
  }
  return tags;
};
